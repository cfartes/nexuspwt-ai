import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { processNotification, approvalMessage } from '../src/lib/notifications';
import { encryptSecret } from '../src/lib/integrations';
import { whatsappChatId, sendOpenwaText } from '../src/lib/openwa';

test('mensagem contém somente referência e link autenticado; telefone internacional é normalizado', () => {
  process.env.APP_URL = 'https://nexus.example';
  assert.equal(whatsappChatId('+55 (11) 99999-9999'), '5511999999999@c.us');
  assert.throws(() => whatsappChatId('grupo@g.us'));
  assert.throws(() => whatsappChatId('123'));
  const id = crypto.randomUUID(),
    text = approvalMessage(id, 2, 'APR', '123');
  assert(text.includes(`https://nexus.example/?document=${id}&version=2`));
  assert(!text.includes('approve='));
  process.env.APP_URL = 'http://dominio-sem-https.example';
  assert.throws(() => approvalMessage(id, 2, 'APR', '123'));
});
test('processo envia uma vez e suspende resultados incertos; ignora decisões concluídas e acessos removidos', async () => {
  process.env.APP_URL = 'https://nexus.example';
  process.env.OPENWA_ALLOWED_ORIGINS = 'https://openwa.example.com';
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'c'.repeat(64);
  const db = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const {
    rows: [company],
  } = await db.query<{ id: string }>("INSERT INTO companies(name) VALUES('Teste') RETURNING id");
  const {
    rows: [unit],
  } = await db.query<{ id: string }>(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Piloto','CDD') RETURNING id",
    [company.id],
  );
  const {
    rows: [user],
  } = await db.query<{ id: string }>(
    "INSERT INTO users(name,email,password_hash,phone) VALUES('Aprovador','test@example.com','hash','+55 11 99999-9999') RETURNING id",
  );
  await db.query("INSERT INTO memberships VALUES($1,$2,'aprovador')", [user.id, unit.id]);
  const {
    rows: [contractor],
  } = await db.query<{ id: string }>(
    "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Terceira','12345678000195') RETURNING id",
    [company.id],
  );
  const id = crypto.randomUUID();
  await db.query(
    "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,status) VALUES($1,$2,$3,$4,'APR','Atividade privada','Local','2026-11-17','2026-11-18',$5,'em_aprovacao')",
    [id, company.id, unit.id, contractor.id, user.id],
  );
  await db.query("INSERT INTO document_versions(document_id,version,snapshot) VALUES($1,1,'{}')", [
    id,
  ]);
  await db.query(
    "INSERT INTO approvals(document_id,version,profile,user_id) VALUES($1,1,'Segurança',$2)",
    [id, user.id],
  );
  await db.query('INSERT INTO notification_outbox(document_id,version,user_id) VALUES($1,1,$2)', [
    id,
    user.id,
  ]);
  await assert.rejects(
    db.query('INSERT INTO notification_outbox(document_id,version,user_id) VALUES($1,1,$2)', [
      id,
      user.id,
    ]),
    /unique/,
  );
  const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55440, maxConnections: 10 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55440/postgres',
    max: 1,
  });
  const request = mock.method(globalThis, 'fetch', async (url: unknown, options?: RequestInit) =>
    String(url).endsWith('send-text')
      ? Response.json({ success: true, messageId: 'simulado' })
      : Response.json({ status: 'READY' }),
  );
  const row = async () => {
    const {
      rows: [job],
    } = await db.query<{ status: string; attempts: number; recipient_hint: string }>(
      'SELECT * FROM notification_outbox WHERE document_id=$1',
      [id],
    );
    return job;
  };
  const reset = () =>
    db.query(
      "UPDATE notification_outbox SET status='pending',available_at=now(),started_at=NULL,attempts=0,last_error=NULL WHERE document_id=$1",
      [id],
    );
  try {
    let output = '';
    const worker = spawn(process.execPath, ['--import', 'tsx', 'scripts/notifications.ts'], {
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55440/postgres',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    worker.stdout.on('data', (data) => {
      output += data.toString();
    });
    worker.stderr.on('data', (data) => {
      output += data.toString();
    });
    try {
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        if ((await row()).status === 'blocked') {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert(blocked, output);
      assert.match(output, /Processo de notificações iniciado/);
    } finally {
      worker.kill();
      if (worker.exitCode === null)
        await new Promise<void>((resolve) => worker.once('exit', () => resolve()));
    }
    await processNotification(pool);
    assert.equal((await row()).status, 'blocked');
    assert.equal(request.mock.callCount(), 0);
    const key = 'chave-apenas-para-testes';
    const settings = {
      baseUrl: 'https://openwa.example.com/api',
      sessionId: crypto.randomUUID(),
      sendNotifications: true,
    };
    await db.query(
      "INSERT INTO company_integrations(company_id,service,provider,settings,secret_ciphertext,updated_by) VALUES($1,'whatsapp','openwa',$2,$3,$4)",
      [company.id, JSON.stringify(settings), encryptSecret(key, company.id, 'whatsapp'), user.id],
    );
    await reset();
    await processNotification(pool);
    assert.equal((await row()).status, 'sent');
    assert.equal((await row()).attempts, 1);
    assert.equal((await row()).recipient_hint, '••••9999');
    const send = request.mock.calls.find((call) =>
      String(call.arguments[0]).endsWith('send-text'),
    )!;
    const body = JSON.parse(String(send.arguments[1]?.body));
    assert.equal(body.chatId, '5511999999999@c.us');
    assert(!body.text.includes('Atividade privada'));
    assert.equal(body.linkPreview, false);
    const count = request.mock.callCount();
    assert.equal(await processNotification(pool), false);
    assert.equal(request.mock.callCount(), count);
    request.mock.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith('send-text')) throw new Error('timeout');
      return Response.json({ status: 'READY' });
    });
    await reset();
    await processNotification(pool);
    assert.equal((await row()).status, 'uncertain');
    const afterTimeout = request.mock.callCount();
    await processNotification(pool);
    assert.equal(request.mock.callCount(), afterTimeout);
    await db.query(
      "UPDATE notification_outbox SET status='sending',started_at=now()-interval '3 minutes' WHERE document_id=$1",
      [id],
    );
    await processNotification(pool);
    assert.equal((await row()).status, 'uncertain');
    assert.equal(request.mock.callCount(), afterTimeout);
    await reset();
    await db.query("UPDATE documents SET status='aprovado' WHERE id=$1", [id]);
    await processNotification(pool);
    assert.equal((await row()).status, 'cancelled');
    assert.equal(request.mock.callCount(), afterTimeout);
    await db.query("UPDATE documents SET status='em_aprovacao' WHERE id=$1", [id]);
    await reset();
    await db.query("UPDATE memberships SET role='executante' WHERE user_id=$1", [user.id]);
    await processNotification(pool);
    assert.equal((await row()).status, 'cancelled');
    assert.equal(request.mock.callCount(), afterTimeout);
    await db.query("UPDATE memberships SET role='aprovador' WHERE user_id=$1", [user.id]);
    await reset();
    await db.query('UPDATE documents SET version=2 WHERE id=$1', [id]);
    await processNotification(pool);
    assert.equal((await row()).status, 'cancelled');
    assert.equal(request.mock.callCount(), afterTimeout);
  } finally {
    request.mock.restore();
    await pool.end();
    await socket.stop();
    await db.close();
  }
});
test('resposta sem confirmação e erro após POST não provocam repetição automática', async () => {
  process.env.OPENWA_ALLOWED_ORIGINS = 'https://openwa.example.com';
  const request = mock.method(
    globalThis,
    'fetch',
    async () => new Response('erro', { status: 500 }),
  );
  const args = [
    'https://openwa.example.com',
    crypto.randomUUID(),
    'chave-de-teste',
    '5511999999999@c.us',
    'Mensagem de teste',
  ] as const;
  try {
    assert.equal((await sendOpenwaText(...args)).status, 'uncertain');
    request.mock.mockImplementation(async () => Response.json({}));
    assert.equal((await sendOpenwaText(...args)).status, 'uncertain');
    request.mock.mockImplementation(async () => new Response('negado', { status: 403 }));
    assert.equal((await sendOpenwaText(...args)).status, 'blocked');
  } finally {
    request.mock.restore();
  }
});
