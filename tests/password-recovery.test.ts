import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import {
  requestPasswordRecovery,
  confirmPasswordRecovery,
  processPasswordRecovery,
  recoveryRequest,
  recoveryLink,
} from '../src/lib/passwordRecovery';
import { decryptSecret, encryptSecret } from '../src/lib/integrations';
import { digest, hashPassword, verifyPassword } from '../src/lib/security';

await test('recuperação: fila privada, Resend, uso único, expiração, limites, sessões e preservação do MFA', async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'c'.repeat(64);
  process.env.APP_URL = 'https://ptw.example.com';
  const embedded = await PGlite.create();
  for (const filename of (await readdir(new URL('../db/', import.meta.url)))
    .filter((filename) => filename.endsWith('.sql'))
    .sort())
    await embedded.exec(await readFile(new URL('../db/' + filename, import.meta.url), 'utf8'));
  const socket = new PGLiteSocketServer({ db: embedded, host: '127.0.0.1', port: 55454 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55454/postgres',
    max: 3,
  });
  const tx = async <T>(operation: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  const sent: { text: string; subject: string; to: string[] }[] = [];
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, options?: RequestInit) => {
      sent.push(JSON.parse(String(options?.body)));
      return Response.json({ id: 'recovery-email' });
    },
  );
  try {
    const {
      rows: [account],
    } = await pool.query<{ id: string }>(
      "INSERT INTO users(name,email,password_hash,platform_admin) VALUES('Nexus','recovery@example.com',$1,true) RETURNING id",
      [hashPassword('Anterior!123')],
    );
    await pool.query(
      "INSERT INTO user_security(user_id,secret_ciphertext,enabled_at,last_step) VALUES($1,'segredo-mfa-preservado',now(),123)",
      [account.id],
    );
    const securityBefore = (await pool.query('SELECT * FROM user_security')).rows;
    const issue = async (): Promise<{ id: string; token: string }> => {
      await pool.query('DELETE FROM password_recovery_limits');
      await tx((client) =>
        requestPasswordRecovery(client, recoveryRequest.parse({ email: 'RECOVERY@example.com' })),
      );
      const {
        rows: [recovery],
      } = await pool.query<{ id: string; token_ciphertext: string; token_hash: string }>(
        'SELECT * FROM password_recoveries WHERE consumed_at IS NULL ORDER BY created_at DESC LIMIT 1',
      );
      const token = decryptSecret(recovery.token_ciphertext, recovery.id, 'password-recovery');
      assert.equal(recovery.token_hash, digest(token));
      assert(!recovery.token_ciphertext.includes(token));
      return { id: recovery.id, token };
    };
    const confirm = (token: string, password = 'NovaSenha!123') =>
      tx((client) => confirmPasswordRecovery(client, { token, password }));
    const first = await issue();
    assert.equal(sent.length, 0, 'Solicitação só enfileira; não chama o provedor');
    assert(
      verifyPassword(
        'Anterior!123',
        (await pool.query('SELECT password_hash FROM users')).rows[0].password_hash,
      ),
    );
    assert.equal(await processPasswordRecovery(pool), true);
    assert.equal(
      (await pool.query('SELECT status FROM password_recoveries WHERE id=$1', [first.id])).rows[0]
        .status,
      'blocked',
    );
    assert.equal(sent.length, 0);
    await pool.query(
      'INSERT INTO email_gateway(sender,secret_ciphertext,updated_by) VALUES($1,$2,$3)',
      ['nexus@example.com', encryptSecret('re_test_recovery', 'platform', 'resend'), account.id],
    );
    await pool.query('UPDATE password_recoveries SET available_at=now() WHERE id=$1', [first.id]);
    await processPasswordRecovery(pool);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to[0], 'recovery@example.com');
    assert(sent[0].text.includes(recoveryLink(first.token)));
    assert.match(sent[0].subject, /Recuperação/);
    assert.equal(
      (await pool.query('SELECT token_ciphertext FROM password_recoveries WHERE id=$1', [first.id]))
        .rows[0].token_ciphertext,
      null,
    );
    const second = await issue();
    await assert.rejects(confirm(first.token), /inválido/);
    await pool.query(
      "UPDATE password_recoveries SET expires_at=now()-interval '1 second' WHERE id=$1",
      [second.id],
    );
    await assert.rejects(confirm(second.token), /expirado/);
    const third = await issue();
    await assert.rejects(confirm(third.token, 'fraca'), /8 caracteres/);
    await pool.query('UPDATE users SET active=false WHERE id=$1', [account.id]);
    await assert.rejects(confirm(third.token), /inválido/);
    await pool.query("UPDATE users SET active=true,email='alterado@example.com' WHERE id=$1", [
      account.id,
    ]);
    await assert.rejects(confirm(third.token), /inválido/);
    await pool.query("UPDATE users SET email='recovery@example.com' WHERE id=$1", [account.id]);
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('old-session',$1,now()+interval '1 hour')",
      [account.id],
    );
    const results = await Promise.allSettled([confirm(third.token), confirm(third.token)]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
      'Apenas uma confirmação concorrente vence',
    );
    assert.equal((await pool.query('SELECT 1 FROM sessions')).rowCount, 0);
    assert.deepEqual((await pool.query('SELECT * FROM user_security')).rows, securityBefore);
    assert(
      verifyPassword(
        'NovaSenha!123',
        (await pool.query('SELECT password_hash FROM users')).rows[0].password_hash,
      ),
    );
    assert.equal(
      (await pool.query("SELECT 1 FROM audit_events WHERE action='usuario.senha_recuperada'"))
        .rowCount,
      1,
    );
    assert(
      !JSON.stringify((await pool.query('SELECT details FROM audit_events')).rows).includes(
        third.token,
      ),
    );
    await pool.query('DELETE FROM password_recovery_limits');
    for (let count = 0; count < 4; count++)
      await tx((client) => requestPasswordRecovery(client, { email: 'recovery@example.com' }));
    assert.equal(
      (
        await pool.query('SELECT attempts FROM password_recovery_limits WHERE bucket=$1', [
          digest('recovery@example.com'),
        ])
      ).rows[0].attempts,
      4,
    );
    const before = (await pool.query('SELECT count(*)::int count FROM password_recoveries')).rows[0]
      .count;
    await tx((client) => requestPasswordRecovery(client, { email: 'recovery@example.com' }));
    assert.equal(
      (await pool.query('SELECT count(*)::int count FROM password_recoveries')).rows[0].count,
      before,
    );
    await tx((client) => requestPasswordRecovery(client, { email: 'ausente@example.com' }));
    await pool.query('DELETE FROM password_recovery_limits');
    await pool.query('UPDATE users SET password_pending=true WHERE id=$1', [account.id]);
    await tx((client) => requestPasswordRecovery(client, { email: 'recovery@example.com' }));
    assert.equal(
      (await pool.query('SELECT count(*)::int count FROM password_recoveries')).rows[0].count,
      before,
    );
    process.env.APP_URL = 'http://localhost:3000';
    assert.throws(() => recoveryLink('a'.repeat(64)), /HTTPS pública/);
  } finally {
    fetchMock.mock.restore();
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
