import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { encryptSecret } from '../src/lib/integrations';
import { connectWhatsapp, connectionInput, connectionView } from '../src/lib/whatsapp-connection';
import { safeQr, sessionPhone, businessPhone } from '../src/lib/openwa';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('identidade da sessão e QR: apenas PNG, sem inferir telefone de nome ou UUID', () => {
  assert.equal(businessPhone('47999595207'), '5547999595207');
  assert.equal(businessPhone('+1 415 555 1234'), '14155551234');
  assert.equal(businessPhone('5547999595207'), '5547999595207');
  assert.equal(safeQr(png), `data:image/png;base64,${png}`);
  assert.equal(safeQr(null), null);
  for (const value of ['https://externo.test/qr', 'data:image/svg+xml;base64,PHN2Zz4=', png + '!'])
    assert.throws(() => safeQr(value));
  assert.equal(sessionPhone({ id: crypto.randomUUID(), name: '5511999999999' }), null);
  assert.equal(
    sessionPhone({ data: { me: { id: '5511999999999:12@s.whatsapp.net' } } }),
    '5511999999999',
  );
  assert.equal(sessionPhone({ me: { id: '5511999999999@g.us' } }), null);
  assert(
    !connectionInput.safeParse({
      action: 'connect',
      unitId: crypto.randomUUID(),
      version: 0,
      sessionId: crypto.randomUUID(),
    }).success,
  );
});

test('pareamento por empresa: recupera criação incerta, confere número, isola sessão e não envia mensagens', async () => {
  process.env.OPENWA_ALLOWED_ORIGINS = 'https://openwa.example.com';
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'd'.repeat(64);
  const db = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = await readFile(new URL('../db/' + file, import.meta.url), 'utf8');
    await db.exec(sql);
    if (file.startsWith('006')) await db.exec(sql);
  }
  const {
    rows: [user],
  } = await db.query<{ id: string }>(
    "INSERT INTO users(name,email,password_hash) VALUES('Admin','admin@example.com','hash') RETURNING id",
  );
  const { rows: companies } = await db.query<{ id: string }>(
    "INSERT INTO companies(name) VALUES('A'),('B') RETURNING id",
  );
  await db.query(
    'INSERT INTO whatsapp_gateway(base_url,secret_ciphertext,updated_by) VALUES($1,$2,$3)',
    [
      'https://openwa.example.com/api',
      encryptSecret('chave-privada-teste', 'platform', 'whatsapp'),
      user.id,
    ],
  );
  const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55441, maxConnections: 5 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55441/postgres',
    max: 1,
  });
  let id = crypto.randomUUID();
  const phone = '5511999999999',
    unitId = crypto.randomUUID();
  let created = false,
    failStart = true,
    state = 'CREATED',
    actualPhone = phone,
    posts = 0;
  const request = mock.method(globalThis, 'fetch', async (url: unknown, options?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    assert.equal((options?.headers as Record<string, string>)['X-API-Key'], 'chave-privada-teste');
    assert(!path.includes('messages'));
    if (path === '/api/sessions' && options?.method === 'POST') {
      created = true;
      posts++;
      return Response.json({ data: { id } });
    }
    if (path === '/api/sessions')
      return Response.json({
        data: [
          ...(created ? [{ id, name: `nexus-ptw-${companies[0].id}` }] : []),
          { id: crypto.randomUUID(), name: 'rotafy-outra-empresa' },
        ],
      });
    if (!created || !path.startsWith('/api/sessions/' + id))
      return Response.json({ error: 'Not Found' }, { status: 404 });
    if (path.endsWith('/start')) {
      if (failStart) throw new Error('timeout');
      state = 'QR_READY';
      return Response.json({ status: 'qr_ready' });
    }
    if (path.endsWith('/qr')) return Response.json({ data: { qrCode: png } });
    return Response.json({ data: { status: state, me: { id: actualPhone + '@c.us' } } });
  });
  const run = async (
    companyId: string,
    version: number,
    action: 'connect' | 'refresh' | 'notifications',
    extra: Record<string, unknown> = {},
  ) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await connectWhatsapp(
        client,
        companyId,
        user.id,
        connectionInput.parse({ unitId, version, action, ...extra }),
      );
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };
  try {
    await assert.rejects(run(companies[0].id, 0, 'connect', { phone }), /conectar/);
    failStart = false;
    let result = await run(companies[0].id, 0, 'connect', { phone });
    assert.equal(posts, 1, 'Recupera sessão criada antes de falha sem duplicar');
    assert.equal(
      result.status,
      'qr_ready',
      'Aproveita o QR retornado após iniciar, sem aguardar outra consulta',
    );
    result = await run(companies[0].id, result.version, 'refresh');
    assert.equal(result.status, 'qr_ready');
    assert.equal(result.qrCode, `data:image/png;base64,${png}`);
    await assert.rejects(run(companies[0].id, 0, 'connect', { phone }), /alterada/);
    state = 'READY';
    actualPhone = '';
    result = await run(companies[0].id, result.version, 'refresh');
    assert.equal(
      result.status,
      'identity_pending',
      'Identidade ausente não significa número incorreto',
    );
    actualPhone = '5511888888888';
    result = await run(companies[0].id, result.version, 'refresh');
    assert.equal(result.status, 'wrong_number');
    assert.equal(result.sendNotifications, false);
    await assert.rejects(
      run(companies[0].id, result.version, 'notifications', { enabled: true }),
      /Confirme/,
    );
    actualPhone = phone;
    result = await run(companies[0].id, result.version, 'refresh');
    assert.equal(result.status, 'connected');
    assert.equal(result.sendNotifications, false);
    result = await run(companies[0].id, result.version, 'notifications', { enabled: true });
    assert.equal(result.sendNotifications, true);
    const view = JSON.stringify(
      connectionView(
        (
          await db.query<any>('SELECT * FROM company_integrations WHERE company_id=$1', [
            companies[0].id,
          ])
        ).rows[0],
      ),
    );
    assert(!view.includes(id));
    assert(!view.includes('chave'));
    assert(!view.includes('baseUrl'));
    await assert.rejects(run(companies[1].id, 0, 'connect', { phone }), /outra empresa/);
    state = 'DISCONNECTED';
    result = await run(companies[0].id, result.version, 'refresh');
    assert.equal(result.sendNotifications, false);
    assert.equal(result.status, 'disconnected');
    created = false;
    id = crypto.randomUUID();
    state = 'created';
    result = await run(companies[0].id, result.version, 'refresh');
    assert.equal(result.status, 'missing_session', '404 limpa a indicação antiga de conexão');
    result = await run(companies[0].id, result.version, 'connect', { phone });
    assert.equal(result.status, 'qr_ready');
    assert.equal(posts, 2, 'Cria somente a sessão própria do PTW quando a anterior foi removida');
    assert.equal(
      (
        await db.query<{ settings: { sessionId: string } }>(
          "SELECT settings FROM company_integrations WHERE company_id=$1 AND service='whatsapp'",
          [companies[0].id],
        )
      ).rows[0].settings.sessionId,
      id,
    );
  } finally {
    request.mock.restore();
    await pool.end();
    await socket.stop();
    await db.close();
  }
});
