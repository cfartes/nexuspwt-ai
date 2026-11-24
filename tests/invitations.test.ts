import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { createInvitation, acceptInvitation, invitationLink } from '../src/lib/invitations';
import { processInvitation } from '../src/lib/invitation-delivery';
import { encryptSecret, decryptSecret } from '../src/lib/integrations';
import { verifyPassword } from '../src/lib/security';
import { sendResendEmail } from '../src/lib/resend';

await test('convite: duas entregas, expiração, reemissão, revogação de acesso, definição única e envio sem expor token', async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'e'.repeat(64);
  process.env.APP_URL = 'https://nexus.example';
  process.env.OPENWA_ALLOWED_ORIGINS = 'https://openwa.example.com';
  const db = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const {
    rows: [company],
  } = await db.query<{ id: string }>("INSERT INTO companies(name) VALUES('Empresa') RETURNING id");
  const {
    rows: [unit],
  } = await db.query<{ id: string }>(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Piloto','CDD') RETURNING id",
    [company.id],
  );
  const {
    rows: [user],
  } = await db.query<{ id: string }>(
    "INSERT INTO users(name,email,phone,password_hash,password_pending) VALUES('Convidado','convidado@example.com','+55 11 99999-9999','inacessivel',true) RETURNING id",
  );
  await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'aprovador')", [
    user.id,
    unit.id,
  ]);
  const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55442, maxConnections: 5 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55442/postgres',
    max: 1,
  });
  const tx = async <T>(fn: (c: pg.PoolClient) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const value = await fn(c);
      await c.query('COMMIT');
      return value;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  const issue = async () => {
    await tx((c) => createInvitation(c, user.id, user.id, unit.id));
    return (
      await db.query<{ id: string; token_ciphertext: string }>(
        'SELECT id,token_ciphertext FROM user_invitations WHERE consumed_at IS NULL',
      )
    ).rows[0];
  };
  const raw = (invitation: { id: string; token_ciphertext: string }) =>
    decryptSecret(invitation.token_ciphertext, invitation.id, 'invitation');
  const requests: {
    url: string;
    body: { to?: string[]; text?: string } | null;
    headers: Headers;
  }[] = [];
  const request = mock.method(globalThis, 'fetch', async (url: unknown, options?: RequestInit) => {
    requests.push({
      url: String(url),
      body: options?.body ? JSON.parse(String(options.body)) : null,
      headers: new Headers(options?.headers),
    });
    if (String(url).includes('api.resend.com')) return Response.json({ id: 'email-aceito' });
    if (String(url).endsWith('send-text'))
      return Response.json({ success: true, messageId: 'whatsapp-aceito' });
    return Response.json({ status: 'READY', me: { id: '5511888888888@c.us' } });
  });
  try {
    const first = await issue();
    const firstToken = raw(first);
    assert(!first.token_ciphertext.includes(firstToken));
    assert.equal((await db.query('SELECT 1 FROM invitation_deliveries')).rows.length, 2);
    const second = await issue();
    await assert.rejects(
      tx((c) => acceptInvitation(c, firstToken, 'Senha!12')),
      /inválido/,
    );
    await db.query("UPDATE user_invitations SET expires_at=now()-interval '1 second' WHERE id=$1", [
      second.id,
    ]);
    await assert.rejects(
      tx((c) => acceptInvitation(c, raw(second), 'Senha!12')),
      /expirado/,
    );
    const third = await issue();
    const token = raw(third);
    await db.query('UPDATE memberships SET active=false WHERE user_id=$1', [user.id]);
    await assert.rejects(
      tx((c) => acceptInvitation(c, token, 'Senha!12')),
      /inválido/,
    );
    await db.query('UPDATE memberships SET active=true WHERE user_id=$1', [user.id]);
    await db.query(
      "UPDATE invitation_deliveries SET available_at=now()+interval '1 hour' WHERE invitation_id=$1 AND channel='whatsapp'",
      [third.id],
    );
    await processInvitation(pool);
    assert.match(
      (
        await db.query<{ last_error: string }>(
          "SELECT last_error FROM invitation_deliveries WHERE invitation_id=$1 AND channel='email'",
          [third.id],
        )
      ).rows[0].last_error,
      /Resend/,
    );
    assert.equal(requests.length, 0);
    await db.query(
      'INSERT INTO email_gateway(sender,secret_ciphertext,updated_by) VALUES($1,$2,$3)',
      ['acesso@example.com', encryptSecret('re_chave_para_testes', 'platform', 'resend'), user.id],
    );
    await db.query(
      "INSERT INTO company_integrations(company_id,service,provider,settings,secret_ciphertext,updated_by) VALUES($1,'whatsapp','openwa',$2,$3,$4)",
      [
        company.id,
        JSON.stringify({
          baseUrl: 'https://openwa.example.com/api',
          sessionId: crypto.randomUUID(),
          phone: '5511888888888',
        }),
        encryptSecret('chave-openwa-teste', company.id, 'whatsapp'),
        user.id,
      ],
    );
    await db.query('UPDATE invitation_deliveries SET available_at=now() WHERE invitation_id=$1', [
      third.id,
    ]);
    await processInvitation(pool);
    await db.query('UPDATE invitation_deliveries SET started_at=NULL');
    await processInvitation(pool);
    const sent = await db.query<{ status: string }>(
      'SELECT status FROM invitation_deliveries WHERE invitation_id=$1',
      [third.id],
    );
    assert(sent.rows.every((d) => d.status === 'sent'));
    const email = requests.find((r) => r.url.includes('resend'))!;
    assert.equal(email.body?.to?.[0], 'convidado@example.com');
    assert(email.body?.text?.includes('#token=' + token));
    assert(email.headers.get('Idempotency-Key'));
    assert(requests.some((r) => r.body?.text?.includes('/definir-senha#token=' + token)));
    const count = requests.length;
    await db.query(
      "UPDATE invitation_deliveries SET status='sending',started_at=now()-interval '3 minutes' WHERE invitation_id=$1 AND channel='email'",
      [third.id],
    );
    await processInvitation(pool);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM invitation_deliveries WHERE invitation_id=$1 AND channel='email'",
          [third.id],
        )
      ).rows[0].status,
      'uncertain',
    );
    assert.equal(requests.length, count, 'Envio interrompido não é repetido automaticamente');
    const audits = JSON.stringify((await db.query('SELECT details FROM audit_events')).rows);
    assert(!audits.includes(token));
    for (const password of ['Senha!1', 'senhasemMaiuscula'.toLowerCase() + '!', 'SenhaSemSimbolo'])
      await assert.rejects(
        tx((c) => acceptInvitation(c, token, password)),
        /8 caracteres/,
      );
    await tx((c) => acceptInvitation(c, token, 'Senha!12'));
    const saved = (
      await db.query<{ password_hash: string; password_pending: boolean }>(
        'SELECT password_hash,password_pending FROM users WHERE id=$1',
        [user.id],
      )
    ).rows[0];
    assert(verifyPassword('Senha!12', saved.password_hash));
    assert.equal(saved.password_pending, false);
    await assert.rejects(
      tx((c) => acceptInvitation(c, token, 'Outra!12')),
      /utilizado/,
    );
    await assert.rejects(
      tx((c) => createInvitation(c, user.id, user.id, unit.id)),
      /já definiu/,
    );
    process.env.APP_URL = 'http://localhost:3000';
    assert.throws(() => invitationLink(token), /HTTPS pública/);
  } finally {
    request.mock.restore();
    await pool.end();
    await socket.stop();
    await db.close();
  }
});

await test('Resend: ausência de confirmação mantém resultado incerto e recusa explícita bloqueia', async () => {
  const request = mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 500 }));
  try {
    assert.equal(
      (await sendResendEmail('re_teste', 'a@example.com', 'b@example.com', 'convite', 'id')).status,
      'uncertain',
    );
    request.mock.mockImplementation(async () => new Response('resposta sem JSON'));
    assert.equal(
      (await sendResendEmail('re_teste', 'a@example.com', 'b@example.com', 'convite', 'id')).status,
      'uncertain',
    );
    request.mock.mockImplementation(async () => Response.json(null));
    assert.equal(
      (await sendResendEmail('re_teste', 'a@example.com', 'b@example.com', 'convite', 'id')).status,
      'uncertain',
    );
    request.mock.mockImplementation(async () => Response.json({}, { status: 403 }));
    assert.equal(
      (await sendResendEmail('re_teste', 'a@example.com', 'b@example.com', 'convite', 'id')).status,
      'blocked',
    );
  } finally {
    request.mock.restore();
  }
});
