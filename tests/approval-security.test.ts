import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { newTotpSecret, totp, totpStep } from '../src/lib/totp';
import {
  authenticateDecision,
  assertDecisionIdentity,
  recordIdentity,
  validCpf,
} from '../src/lib/approval-security';
import { encryptSecret, decryptSecret } from '../src/lib/integrations';
import { hashPassword } from '../src/lib/security';
import type { User } from '../src/lib/auth';

test('TOTP usa vetores RFC 6238 e rejeita códigos fora da janela ou reutilizados', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  for (const [time, code] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ] as const)
    assert.equal(totp(secret, Math.floor(time / 30), 8), code);
  assert.match(newTotpSecret(), /^[A-Z2-7]{32}$/);
  const step = 100;
  assert.equal(totpStep(secret, totp(secret, step), step - 1, step * 30000), step);
  assert.equal(totpStep(secret, totp(secret, step), step, step * 30000), null);
  assert.equal(totpStep(secret, totp(secret, step - 2), -1, step * 30000), null);
  assert(validCpf('52998224725'));
  assert(!validCpf('11111111111'));
  assert(!validCpf('52998224724'));
});

test('decisões exigem conferência humana, senha e MFA conforme a empresa; erros persistem e códigos não repetem', async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'c'.repeat(64);
  const embedded = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await embedded.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const {
    rows: [company],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO companies(name) VALUES('Empresa') RETURNING id",
  );
  const {
    rows: [unit],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade','CDD') RETURNING id",
    [company.id],
  );
  const password = 'senha-segura-para-o-teste';
  const { rows } = await embedded.query<{ id: string }>(
    "INSERT INTO users(name,email,phone,password_hash) VALUES('Admin','admin@test.local','5511999999999',$1),('Pessoa','pessoa@test.local','5511888888888',$1) RETURNING id",
    [hashPassword(password)],
  );
  const admin = { id: rows[0].id, platform_admin: true } as User;
  const person = { id: rows[1].id, platform_admin: false } as User;
  await embedded.query(
    "INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$3,'admin'),($2,$3,'seguranca_trabalho')",
    [admin.id, person.id, unit.id],
  );
  const socket = new PGLiteSocketServer({
    db: embedded,
    host: '127.0.0.1',
    port: 55446,
    maxConnections: 5,
  });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55446/postgres',
    max: 1,
  });
  const tx = async <T>(run: (c: pg.PoolClient) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await run(c);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  };
  let now = Math.floor(Date.now() / 30000) * 30000 + 1000;
  const clock = mock.method(Date, 'now', () => now);
  const status = (code: number) => (error: unknown) =>
    (error as { status: number }).status === code;
  try {
    let proof = await authenticateDecision(pool, person, password);
    await assert.rejects(
      tx((c) => assertDecisionIdentity(c, person, unit.id, proof)),
      status(403),
    );
    await assert.rejects(
      tx((c) =>
        recordIdentity(c, person, unit.id, person.id, '52998224725', 'Conferência presencial', 1),
      ),
      status(403),
    );
    await tx((c) =>
      recordIdentity(
        c,
        admin,
        unit.id,
        person.id,
        '52998224725',
        'Conferência presencial de documento e vínculo',
        1,
      ),
    );
    await tx((c) => assertDecisionIdentity(c, person, unit.id, proof));
    const {
      rows: [stored],
    } = await pool.query('SELECT * FROM user_security WHERE user_id=$1', [person.id]);
    assert.equal(decryptSecret(stored.cpf_ciphertext, person.id, 'cpf'), '52998224725');
    const secret = newTotpSecret();
    await pool.query(
      "UPDATE user_security SET pending_ciphertext=$2,pending_expires_at=now()+interval '10 minutes' WHERE user_id=$1",
      [person.id, encryptSecret(secret, person.id, 'totp')],
    );
    await authenticateDecision(
      pool,
      person,
      password,
      totp(secret, Math.floor(now / 30000)),
      'confirm',
    );
    await assert.rejects(
      authenticateDecision(pool, person, password, totp(secret, Math.floor(now / 30000)), 'totp'),
      status(403),
    );
    await pool.query('UPDATE companies SET approval_mfa_required=true WHERE id=$1', [company.id]);
    proof = await authenticateDecision(pool, person, password);
    await assert.rejects(
      tx((c) => assertDecisionIdentity(c, person, unit.id, proof)),
      status(403),
    );
    now += 30000;
    proof = await authenticateDecision(
      pool,
      person,
      password,
      totp(secret, Math.floor(now / 30000)),
      'totp',
    );
    const evidence = await tx((c) => assertDecisionIdentity(c, person, unit.id, proof));
    assert.equal(evidence.method, 'password_totp');
    await pool.query("UPDATE memberships SET phone='5511777777777' WHERE user_id=$1", [person.id]);
    await assert.rejects(
      tx((c) => assertDecisionIdentity(c, person, unit.id, proof)),
      status(403),
    );
    for (let i = 0; i < 7; i++)
      await assert.rejects(authenticateDecision(pool, person, 'incorreta'), status(403));
    await authenticateDecision(pool, person, password);
    await assert.rejects(authenticateDecision(pool, person, 'incorreta'), status(403));
    await assert.rejects(authenticateDecision(pool, person, password), status(429));
    const {
      rows: [attempts],
    } = await pool.query('SELECT failures FROM user_security WHERE user_id=$1', [person.id]);
    assert.equal(attempts.failures, 8);
    await authenticateDecision(pool, admin, password);
    const expiredSecret = newTotpSecret();
    await pool.query(
      "UPDATE user_security SET pending_ciphertext=$2,pending_expires_at=now()-interval '1 minute' WHERE user_id=$1",
      [admin.id, encryptSecret(expiredSecret, admin.id, 'totp')],
    );
    await assert.rejects(
      authenticateDecision(
        pool,
        admin,
        password,
        totp(expiredSecret, Math.floor(now / 30000)),
        'confirm',
      ),
      status(403),
    );
    assert.equal(
      (await pool.query('SELECT enabled_at FROM user_security WHERE user_id=$1', [admin.id]))
        .rows[0].enabled_at,
      null,
    );
    const { rows: audit } = await pool.query('SELECT details FROM audit_events');
    const text = JSON.stringify(audit);
    assert(!text.includes(password));
    assert(!text.includes(secret));
    assert(!text.includes('52998224725'));
    const passwordOnly = await authenticateDecision(pool, admin, password);
    await assert.rejects(
      tx((c) => assertDecisionIdentity(c, admin, unit.id, passwordOnly)),
      status(403),
      'flag in the caller cannot exempt an ordinary database account',
    );
    await pool.query('UPDATE users SET platform_admin=true WHERE id=$1', [admin.id]);
    const exempt = await tx((c) => assertDecisionIdentity(c, admin, unit.id, passwordOnly));
    assert('exemption' in exempt);
    assert.equal(exempt.exemption, 'nexus_superadmin');
    assert.equal(exempt.method, 'password');
    assert.equal(exempt.verifiedBy, null);
    await assert.rejects(
      tx((c) =>
        recordIdentity(
          c,
          person,
          unit.id,
          admin.id,
          '52998224725',
          'Tentativa de conferir conta Nexus',
          1,
        ),
      ),
      status(403),
    );
  } finally {
    clock.mock.restore();
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
