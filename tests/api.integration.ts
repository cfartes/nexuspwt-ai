import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { hashPassword } from '../src/lib/security';
import { aprProfiles } from '../src/lib/forms';
const db = await PGlite.create();
await db.exec(await readFile(new URL('../db/001-initial.sql', import.meta.url), 'utf8'));
const {
  rows: [company],
} = await db.query<{ id: string }>("INSERT INTO companies(name) VALUES('Ambev') RETURNING id");
const {
  rows: [unit],
} = await db.query<{ id: string }>(
  "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade piloto','CDD') RETURNING id",
  [company.id],
);
const password = randomUUID() + randomUUID();
const {
  rows: [user],
} = await db.query<{ id: string }>(
  "INSERT INTO users(name,email,password_hash,platform_admin) VALUES('Administrador de teste','test@nexus.local',$1,true) RETURNING id",
  [hashPassword(password)],
);
await db.query("INSERT INTO memberships VALUES($1,$2,'admin')", [user.id, unit.id]);
const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55439, maxConnections: 10 });
await socket.start();
const base = 'http://localhost:3109';
let logs = '';
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', '3109'],
  {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55439/postgres',
      APP_URL: base,
      DB_POOL_SIZE: '1',
      COOKIE_SECURE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
server.stdout.on('data', (b) => {
  logs += b.toString();
});
server.stderr.on('data', (b) => {
  logs += b.toString();
});
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    if (i === 99) throw new Error('Servidor não iniciou: ' + logs);
  }
  let cookie = '';
  const call = async (path: string, body?: unknown, expected = 200) => {
    const r = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: base,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json();
    assert.equal(r.status, expected, JSON.stringify(json));
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return json;
  };
  await call('/api/workspace', undefined, 401);
  await call('/api/auth', { email: 'test@nexus.local', password: 'incorreta' }, 401);
  await call('/api/auth', { email: 'test@nexus.local', password });
  let ws = await call('/api/workspace');
  assert.equal(ws.unit.id, unit.id);
  await call('/api/workspace?unit=' + randomUUID(), undefined, 403);
  await call('/api/admin', {
    action: 'contractor',
    unitId: unit.id,
    name: 'Terceirizada piloto',
    cnpj: '12345678000195',
  });
  ws = await call('/api/workspace');
  assert.equal(ws.contractors.length, 1);
  const d = {
    id: randomUUID(),
    unitId: unit.id,
    contractorId: ws.contractors[0].id,
    kind: 'APR',
    title: 'Manutenção do telhado',
    location: 'Galpão 1',
    startsAt: '2026-11-17',
    endsAt: '2026-11-20',
    aprId: null,
    version: 0,
    data: {
      answers: {},
      types: [],
      ppe: [],
      risks: [
        {
          activity: 'Acesso ao telhado',
          tools: 'PEMT',
          risks: 'Queda de altura',
          sif: 'Potencial',
          controls: 'Isolamento e ancoragem',
          needsPt: true,
        },
      ],
      executors: [],
    },
  };
  const created = await call('/api/documents', d);
  assert.equal(created.version, 1);
  const retry = await call('/api/documents', d);
  assert.equal(retry.version, 1, 'Reenvio não cria revisão extra');
  await call('/api/documents', { ...d, title: 'Alteração desatualizada' }, 409);
  const updated = await call('/api/documents', {
    ...d,
    version: 1,
    title: 'Manutenção da cobertura',
  });
  assert.equal(updated.version, 2);
  await call(`/api/documents/${d.id}/workflow`, { action: 'submit', version: 2 }, 400);
  for (const profile of aprProfiles)
    await call('/api/admin', {
      action: 'approver',
      unitId: unit.id,
      userId: user.id,
      kind: 'APR',
      profile,
      scope: 'unit',
    });
  await call(`/api/documents/${d.id}/workflow`, { action: 'submit', version: 2 });
  await call('/api/documents', { ...d, version: 2 }, 409);
  await call(`/api/documents/${d.id}/workflow`, { action: 'approve', version: 2 });
  ws = await call('/api/workspace');
  assert.equal(ws.documents.find((x: { id: string }) => x.id === d.id).status, 'aprovado');
  assert.equal(ws.approvals.length, 4);
  const pt = {
    ...d,
    id: randomUUID(),
    kind: 'PT',
    aprId: d.id,
    version: 0,
    data: {
      answers: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`s11.q${i + 1}`, i === 8 ? 'Não' : 'Sim']),
      ),
      types: ['Outra atividade'],
      ppe: [],
      risks: [],
      executors: [{ userId: user.id, role: 'Responsável' }],
    },
  };
  await call('/api/documents', pt);
  const invalidDate = { ...pt, id: randomUUID(), endsAt: '2026-11-21' };
  await call('/api/documents', invalidDate, 400);
  const blocked = await call(
    `/api/documents/${pt.id}/workflow`,
    { action: 'submit', version: 1 },
    422,
  );
  assert.match(blocked.error, /contratante/);
  const print = await fetch(base + '/print/' + d.id, { headers: { Cookie: cookie } });
  assert.equal(print.status, 200);
  assert.match(await print.text(), /NÃO AUTORIZA EXECUÇÃO/);
  const foreign = await fetch(base + '/api/admin', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://externo.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'region', unitId: unit.id, name: 'Externa' }),
  });
  assert.equal(foreign.status, 403);
  console.log(
    'Integração OK: login, acesso por unidade, cadastro, reenvio idempotente, conflito de revisão, aprovação APR, bloqueio PT, impressão e CSRF.',
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  server.kill();
  await new Promise<void>((r) => server.once('exit', () => r()));
  await socket.stop();
  await db.close();
}
