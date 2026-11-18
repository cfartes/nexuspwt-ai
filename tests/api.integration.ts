import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { hashPassword } from '../src/lib/security';
import { decryptSecret } from '../src/lib/integrations';
import { aprProfiles } from '../src/lib/forms';
const db = await PGlite.create();
await db.exec(await readFile(new URL('../db/001-initial.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../db/002-integrations.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../db/003-notifications.sql', import.meta.url), 'utf8'));
await db.exec(
  await readFile(new URL('../db/004-membership-management.sql', import.meta.url), 'utf8'),
);
await db.exec(
  await readFile(new URL('../db/005-approver-management.sql', import.meta.url), 'utf8'),
);
await db.exec(await readFile(new URL('../db/006-whatsapp-gateway.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../db/007-contractor-details.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../db/008-user-invitations.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../db/009-apr-removal.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../db/010-company-unit-limit.sql', import.meta.url), 'utf8'));
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
await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
  user.id,
  unit.id,
]);
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
      INTEGRATIONS_ENCRYPTION_KEY: 'a'.repeat(64),
      OPENWA_ALLOWED_ORIGINS: 'https://openwa.example.com',
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
  const call = async (path: string, body?: unknown, expected = 200, method?: string) => {
    const r = await fetch(base + path, {
      method: method || (body ? 'POST' : 'GET'),
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
  assert(ws.companies.some((c: { id: string }) => c.id === company.id));
  assert(ws.registeredUnits.some((u: { id: string }) => u.id === unit.id));
  await call(`/api/address?unit=${unit.id}&cep=invalido`, undefined, 400);
  await call('/api/workspace?unit=' + randomUUID(), undefined, 403);
  await call('/api/admin', {
    action: 'contractor',
    unitId: unit.id,
    name: 'Terceirizada piloto',
    cnpj: '12345678000195',
  });
  ws = await call('/api/workspace');
  assert.equal(ws.contractors.length, 1);
  const contractorRegistration = ws.contractors[0];
  const contractorAddress = {
    tradeName: 'Terceira Serviços',
    contactName: 'Responsável',
    phone: '+55 11 99999-9999',
    email: 'contato@terceira.example',
    cep: '01001000',
    street: 'Praça da Sé',
    number: '100',
    complement: 'Sala 2',
    district: 'Sé',
    city: 'São Paulo',
    state: 'SP',
  };
  const editContractor = {
    action: 'updateContractor',
    unitId: unit.id,
    id: contractorRegistration.id,
    version: contractorRegistration.version,
    name: contractorRegistration.name,
    details: contractorAddress,
  };
  await call(
    '/api/admin',
    { ...editContractor, details: { ...contractorAddress, email: 'invalido' } },
    400,
  );
  await call('/api/admin', editContractor);
  await call('/api/admin', editContractor, 409);
  await call('/api/admin', {
    action: 'contractor',
    unitId: unit.id,
    name: 'Não substituir',
    cnpj: contractorRegistration.cnpj,
    details: { city: 'Outra cidade' },
  });
  const savedContractor = (await call(`/api/workspace?unit=${unit.id}`)).contractors[0];
  assert.equal(savedContractor.details.street, contractorAddress.street);
  assert.equal(
    savedContractor.details.city,
    contractorAddress.city,
    'Vincular CNPJ existente não sobrescreve os dados compartilhados',
  );
  assert.equal(savedContractor.version, contractorRegistration.version + 1);
  const integrationPath = `/api/integrations?unit=${unit.id}`;
  const initialConfig = await call(integrationPath);
  assert.equal(initialConfig.integrations.length, 0);
  assert.equal(initialConfig.encryptionReady, true);
  const signature = {
    service: 'signature',
    provider: 'certisign',
    unitId: unit.id,
    version: 0,
    environment: 'sandbox',
    accountId: '',
    clientId: '',
    secret: 'token-certisign-somente-teste',
  };
  const configured = await call('/api/integrations', signature);
  assert.equal(configured.hasSecret, true);
  assert.equal(configured.version, 1);
  assert(!JSON.stringify(configured).includes(signature.secret));
  const {
    rows: [savedSecret],
  } = await db.query<{ secret_ciphertext: string }>(
    "SELECT secret_ciphertext FROM company_integrations WHERE company_id=$1 AND service='signature'",
    [company.id],
  );
  assert(!savedSecret.secret_ciphertext.includes(signature.secret));
  const safeConfig = await call(integrationPath);
  assert(!JSON.stringify(safeConfig).includes(savedSecret.secret_ciphertext));
  await call('/api/integrations', { ...signature, version: 1, secret: '' });
  const {
    rows: [preservedSecret],
  } = await db.query<{ secret_ciphertext: string }>(
    "SELECT secret_ciphertext FROM company_integrations WHERE company_id=$1 AND service='signature'",
    [company.id],
  );
  assert.equal(preservedSecret.secret_ciphertext, savedSecret.secret_ciphertext);
  await call('/api/integrations', signature, 409);
  const changed = await call('/api/integrations', {
    ...signature,
    provider: 'docusign',
    version: 2,
    secret: '',
    accountId: 'conta-teste',
    clientId: 'integracao-teste',
  });
  assert.equal(changed.hasSecret, false, 'Trocar o fornecedor não reaproveita o segredo anterior');
  await call('/api/integrations', { ...signature, version: 3 });
  const removed = await call('/api/integrations', {
    ...signature,
    version: 4,
    secret: '',
    clearSecret: true,
  });
  assert.equal(removed.hasSecret, false);
  const whatsapp = {
    service: 'whatsapp',
    provider: 'openwa',
    unitId: unit.id,
    version: 0,
    baseUrl: 'https://openwa.example.com/api',
    sessionId: '',
    secret: '',
  };
  await call('/api/integrations', { ...whatsapp, sendNotifications: true }, 400);
  await call('/api/integrations', { ...whatsapp, secret: 'owa_teste…abreviada' }, 400);
  await call('/api/integrations', whatsapp);
  await call('/api/integrations', { unitId: unit.id, version: 1 }, 400, 'PUT');
  const key = 'owa_apenas_teste_sem_envio';
  const sessionId = randomUUID();
  await call('/api/integrations', { ...whatsapp, version: 1, secret: key, sessionId });
  await call(
    '/api/integrations',
    { ...whatsapp, version: 2, baseUrl: 'https://outro.example.com/api', sessionId },
    400,
  );
  await call('/api/integrations', {
    ...whatsapp,
    version: 2,
    baseUrl: 'https://outro.example.com/api',
    sessionId,
    secret: key,
  });
  await call('/api/integrations', { unitId: unit.id, version: 3 }, 400, 'PUT');
  await call('/api/integrations', { ...whatsapp, version: 3, sessionId, secret: key });
  const enabled = await call('/api/integrations', {
    ...whatsapp,
    version: 4,
    sessionId,
    sendNotifications: true,
  });
  assert.equal(enabled.settings.sendNotifications, true);
  await call('/api/integrations', { ...whatsapp, version: 5, sessionId, sendNotifications: false });
  await call('/api/admin', { action: 'company', unitId: unit.id, name: 'Empresa isolada' });
  const allUnits = (await call('/api/workspace')).units;
  const isolatedUnit = allUnits.find((u: { company_id: string }) => u.company_id !== company.id);
  await call(
    '/api/admin',
    { ...editContractor, unitId: isolatedUnit.id, version: savedContractor.version },
    404,
  );
  const companyRegistrations = await call(`/api/workspace?unit=${unit.id}`);
  assert(
    companyRegistrations.companies.some((c: { id: string }) => c.id === isolatedUnit.company_id),
  );
  assert(
    companyRegistrations.registeredUnits.every(
      (u: { company_id: string }) => u.company_id === company.id,
    ),
  );
  assert(
    !companyRegistrations.registeredUnits.some((u: { id: string }) => u.id === isolatedUnit.id),
  );
  assert.equal(
    (await call(`/api/workspace?unit=${isolatedUnit.id}`)).unit.company_name,
    'Empresa isolada',
  );
  assert.equal((await call(`/api/integrations?unit=${isolatedUnit.id}`)).integrations.length, 0);
  const { rows: audits } = await db.query<{ details: unknown }>(
    "SELECT details FROM audit_events WHERE action='integracao.configurada'",
  );
  assert(!JSON.stringify(audits).includes(signature.secret));
  assert(!JSON.stringify(audits).includes(key));
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
  const queued = (await call(`/api/notifications?unit=${unit.id}`)).notifications;
  assert.equal(queued.length, 1, 'Quatro perfis do mesmo aprovador geram um único aviso');
  assert.equal(queued[0].status, 'pending');
  assert.equal((await call(`/api/notifications?unit=${isolatedUnit.id}`)).notifications.length, 0);
  await call('/api/notifications', { unitId: isolatedUnit.id, id: queued[0].id }, 404);
  assert.equal((await call(`/api/workspace?document=${d.id}`)).unit.id, unit.id);
  await call(`/api/workspace?document=${randomUUID()}`, undefined, 403);
  await call('/api/notifications', { unitId: unit.id, id: queued[0].id }, 409);
  await db.query("UPDATE notification_outbox SET status='uncertain' WHERE id=$1", [queued[0].id]);
  await call('/api/notifications', { unitId: unit.id, id: queued[0].id }, 409);
  await call('/api/notifications', {
    unitId: unit.id,
    id: queued[0].id,
    confirmDuplicateRisk: true,
  });
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
  await call(`/api/documents/${d.id}/workflow`, { action: 'revise', version: 2 }, 400);
  await call(
    `/api/documents/${d.id}/workflow`,
    { action: 'revise', version: 1, comment: 'Revisar controles' },
    409,
  );
  await call(
    `/api/documents/${pt.id}/workflow`,
    { action: 'revise', version: 1, comment: 'Não é APR' },
    409,
  );
  await call(`/api/documents/${d.id}/workflow`, {
    action: 'revise',
    version: 2,
    comment: 'Atualizar período e empresa responsável',
  });
  await call(
    `/api/documents/${d.id}/workflow`,
    { action: 'revise', version: 2, comment: 'Reenvio duplicado' },
    409,
  );
  ws = await call('/api/workspace');
  assert.equal(ws.documents.find((doc: { id: string }) => doc.id === d.id).version, 3);
  assert.equal(ws.documents.find((doc: { id: string }) => doc.id === d.id).status, 'rascunho');
  await call('/api/documents', { ...pt, id: randomUUID() }, 400);
  await call('/api/admin', {
    action: 'contractor',
    unitId: unit.id,
    name: 'Nova responsável',
    cnpj: '98765432000198',
  });
  ws = await call('/api/workspace');
  const nextContractor = ws.contractors.find(
    (contractor: { cnpj: string }) => contractor.cnpj === '98765432000198',
  );
  const revision = await call('/api/documents', {
    ...d,
    version: 3,
    title: 'Nova revisão da cobertura',
    contractorId: nextContractor.id,
    startsAt: '2026-11-19',
  });
  assert.equal(revision.version, 4);
  const oldPt = await call('/api/documents', {
    ...pt,
    version: 1,
    title: 'PT preservada na versão original',
  });
  assert.equal(
    oldPt.apr_version,
    2,
    'Salvar a PT não troca sua versão da APR nem usa as novas datas/terceirizada',
  );
  await call(`/api/documents/${d.id}/workflow`, { action: 'submit', version: 4 });
  await call(`/api/documents/${d.id}/workflow`, { action: 'approve', version: 4 });
  await call('/api/documents', { ...pt, id: randomUUID() }, 400);
  const newPt = await call('/api/documents', {
    ...pt,
    id: randomUUID(),
    contractorId: nextContractor.id,
    startsAt: '2026-11-19',
  });
  assert.equal(newPt.apr_version, 4, 'Nova PT usa a versão aprovada atual');
  const history = await call(`/api/documents/${d.id}/history`);
  assert.deepEqual(
    history.versions.map((v: { version: number }) => v.version),
    [4, 2],
  );
  assert(history.versions.every((v: { status: string }) => v.status === 'aprovado'));
  assert(
    history.events.some(
      (event: { action: string; details: { comment: string } }) =>
        event.action === 'workflow.revise' &&
        event.details.comment === 'Atualizar período e empresa responsável',
    ),
  );
  const historical = await fetch(`${base}/print/${d.id}?version=2`, {
    headers: { Cookie: cookie },
  });
  assert.equal(historical.status, 200);
  const historicalHtml = await historical.text();
  assert.match(historicalHtml, /Manutenção da cobertura/);
  assert.doesNotMatch(historicalHtml, /Nova revisão da cobertura/);
  assert.match(historicalHtml, /Terceirizada piloto/);
  assert.equal(
    (await fetch(`${base}/print/${d.id}?version=999`, { headers: { Cookie: cookie } })).status,
    404,
  );
  assert.equal(
    (await fetch(`${base}/print/${d.id}?version=inválida`, { headers: { Cookie: cookie } })).status,
    404,
  );
  const adminCookie = cookie;
  const executorPassword = randomUUID();
  await call('/api/admin', {
    action: 'user',
    unitId: unit.id,
    name: 'Outro executante',
    email: 'executor@nexus.local',
    phone: '+55 11 99999-9999',
    password: executorPassword,
    role: 'executante',
  });
  const duplicateUser = await call(
    '/api/admin',
    {
      action: 'user',
      unitId: unit.id,
      name: 'Outro executante',
      email: 'executor@nexus.local',
      phone: '+55 11 99999-9999',
      password: executorPassword,
      role: 'executante',
    },
    409,
  );
  assert.match(duplicateUser.error, /Vincular usuário existente/);
  assert(
    !(await call(`/api/workspace?unit=${isolatedUnit.id}`)).companyPeople.some(
      (p: { email: string }) => p.email === 'executor@nexus.local',
    ),
    'Usuários disponíveis não atravessam empresas',
  );
  await call('/api/auth', { email: 'executor@nexus.local', password: executorPassword });
  await call(integrationPath, undefined, 403);
  const personalNotifications = await call(`/api/notifications?unit=${unit.id}`);
  assert.equal(personalNotifications.notifications.length, 0);
  await call(
    '/api/notifications',
    { unitId: unit.id, id: queued[0].id, confirmDuplicateRisk: true },
    403,
  );
  await call('/api/integrations', { ...signature, version: 5 }, 403);
  await call('/api/integrations', { unitId: unit.id, version: 4 }, 403, 'PUT');
  await db.query(
    "UPDATE memberships SET role='admin' WHERE user_id=(SELECT id FROM users WHERE email='executor@nexus.local') AND unit_id=$1",
    [unit.id],
  );
  await call(integrationPath, undefined, 403);
  await db.query(
    "UPDATE memberships SET role='executante' WHERE user_id=(SELECT id FROM users WHERE email='executor@nexus.local') AND unit_id=$1",
    [unit.id],
  );
  await call(
    `/api/documents/${d.id}/workflow`,
    { action: 'revise', version: 4, comment: 'Tentativa sem permissão' },
    403,
  );
  await call(`/api/documents/${pt.id}/history`, undefined, 403);
  const approvedHistory = await call(`/api/documents/${d.id}/history`);
  assert.equal(approvedHistory.versions.length, 2);
  cookie = adminCookie;
  let people = (await call(`/api/workspace?unit=${unit.id}`)).people;
  let person = people.find((p: { email: string }) => p.email === 'executor@nexus.local');
  const change = (
    p: {
      id: string;
      membership_version: number;
      phone: string;
      role: string;
      active: boolean;
      contractor_id: string | null;
    },
    patch: Record<string, unknown> = {},
  ) => ({
    action: 'updateMembership',
    unitId: unit.id,
    userId: p.id,
    version: p.membership_version,
    phone: p.phone,
    role: p.role,
    active: p.active,
    contractorId: p.contractor_id,
    ...patch,
  });
  const self = people.find((p: { id: string }) => p.id === user.id);
  const firstContractor = ws.contractors.find((c: { cnpj: string }) => c.cnpj === '12345678000195');
  await call('/api/admin', change(self, { role: 'gestor' }), 409);
  await call('/api/admin', change(self, { active: false }), 400);
  await call(
    '/api/admin',
    { action: 'membership', unitId: unit.id, email: 'test@nexus.local', role: 'gestor' },
    409,
  );
  await call(
    '/api/admin',
    change(person, {
      contractorId: firstContractor.id,
      role: 'gestor',
      phone: '+55 21 98888-7777',
    }),
  );
  await call('/api/admin', change(person, { phone: '+55 21 98888-6666' }), 409);
  person = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === person.id,
  );
  assert.equal(person.contractor_id, firstContractor.id);
  assert.equal(person.phone, '+55 21 98888-7777');
  await call('/api/admin', change(person, { role: 'admin' }), 400);
  await call('/api/admin', change(person, { phone: '123' }), 400);
  await call('/api/admin', change(person, { contractorId: randomUUID() }), 400);
  const quotaBefore = (await call(`/api/workspace?unit=${unit.id}`)).unitQuota;
  assert.equal(quotaBefore.limit, 1);
  assert.equal(quotaBefore.used, 1);
  const secondUnitInput = {
    action: 'unit',
    unitId: unit.id,
    name: 'Segunda unidade',
    kind: 'CDD',
    regionId: null,
  };
  await call('/api/admin', secondUnitInput, 409);
  await call(
    '/api/admin',
    { action: 'setUnitLimit', unitId: unit.id, limit: 0, version: quotaBefore.version },
    400,
  );
  await call('/api/admin', {
    action: 'setUnitLimit',
    unitId: unit.id,
    limit: 3,
    version: quotaBefore.version,
  });
  await call(
    '/api/admin',
    { action: 'setUnitLimit', unitId: unit.id, limit: 4, version: quotaBefore.version },
    409,
  );
  await call('/api/admin', secondUnitInput);
  const quotaAfter = (await call(`/api/workspace?unit=${unit.id}`)).unitQuota;
  assert.equal(quotaAfter.used, 2);
  assert.equal(quotaAfter.limit, 3);
  await call(
    '/api/admin',
    { action: 'setUnitLimit', unitId: unit.id, limit: 1, version: quotaAfter.version },
    409,
  );
  const secondUnit = (await call('/api/workspace')).units.find(
    (u: { id: string; company_id: string }) => u.id !== unit.id && u.company_id === company.id,
  );
  await call('/api/admin', {
    action: 'membership',
    unitId: secondUnit.id,
    email: 'executor@nexus.local',
    role: 'aprovador',
  });
  assert.equal(
    (await call(`/api/workspace?unit=${secondUnit.id}`)).people.find(
      (p: { id: string }) => p.id === person.id,
    ).phone,
    '+55 11 99999-9999',
  );
  const photoPayload = {
    caption: 'Evidência de teste',
    capturedAt: '2026-11-18T12:00:00.000Z',
    latitude: -23,
    longitude: -46,
    accuracy: 10,
    mime: 'image/png',
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/CWkAAAAASUVORK5CYII=',
  };
  const ownPhoto = crypto.randomUUID(),
    otherPhoto = crypto.randomUUID();
  await call(`/api/documents/${pt.id}/photos`, { ...photoPayload, id: ownPhoto });
  await call(`/api/documents/${newPt.id}/photos`, { ...photoPayload, id: otherPhoto });
  await call(
    '/api/documents',
    { ...pt, version: oldPt.version, contractorId: nextContractor.id },
    409,
  );
  await call('/api/auth', { email: 'executor@nexus.local', password: executorPassword });
  const contractorCookie = cookie;
  const scoped = await call(`/api/workspace?unit=${unit.id}`);
  assert(
    scoped.documents.every(
      (doc: { contractor_id: string }) => doc.contractor_id === firstContractor.id,
    ),
  );
  assert.deepEqual(
    scoped.contractors.map((c: { id: string }) => c.id),
    [firstContractor.id],
  );
  await call(`/api/workspace?document=${d.id}`, undefined, 403);
  await call(`/api/documents/${d.id}/history`, undefined, 403);
  await call(`/api/documents/${newPt.id}/photos`, undefined, 403);
  assert.equal(
    (await fetch(`${base}/api/photos/${otherPhoto}`, { headers: { Cookie: cookie } })).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/api/photos/${ownPhoto}`, { headers: { Cookie: cookie } })).status,
    200,
  );
  assert.equal((await fetch(`${base}/print/${d.id}`, { headers: { Cookie: cookie } })).status, 404);
  assert.equal(
    (await fetch(`${base}/print/${d.id}?version=2`, { headers: { Cookie: cookie } })).status,
    200,
  );
  await call('/api/documents', { ...d, version: 4, contractorId: firstContractor.id }, 403);
  const owned = await call('/api/documents', {
    ...d,
    id: randomUUID(),
    version: 0,
    contractorId: firstContractor.id,
    title: 'Serviço da terceirizada vinculada',
  });
  await call(
    '/api/documents',
    { ...d, id: randomUUID(), version: 0, contractorId: nextContractor.id },
    403,
  );
  await call('/api/admin', change(person, { contractorId: null, role: 'admin' }), 403);
  cookie = adminCookie;
  await call('/api/admin', change(person, { active: false }));
  cookie = contractorCookie;
  await call(`/api/workspace?unit=${unit.id}`, undefined, 403);
  assert.equal((await call(`/api/workspace?unit=${secondUnit.id}`)).unit.id, secondUnit.id);
  assert.equal(
    (await fetch(`${base}/api/photos/${ownPhoto}`, { headers: { Cookie: cookie } })).status,
    403,
  );
  cookie = adminCookie;
  person = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === person.id,
  );
  assert.equal(person.active, false);
  await call('/api/admin', change(person, { active: true, role: 'executante', phone: '' }));
  person = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === person.id,
  );
  assert.equal(person.phone, '');
  assert.equal(
    (await call(`/api/workspace?unit=${secondUnit.id}`)).people.find(
      (p: { id: string }) => p.id === person.id,
    ).phone,
    '+55 11 99999-9999',
  );
  await call('/api/documents', {
    ...pt,
    version: oldPt.version,
    title: oldPt.title,
    data: {
      ...pt.data,
      executors: [...pt.data.executors, { userId: person.id, role: 'Executante' }],
    },
  });
  cookie = contractorCookie;
  const executorWorkspace = await call(`/api/workspace?unit=${unit.id}`);
  assert(executorWorkspace.documents.some((doc: { id: string }) => doc.id === pt.id));
  assert(executorWorkspace.documents.some((doc: { id: string }) => doc.id === owned.id));
  assert(!executorWorkspace.documents.some((doc: { id: string }) => doc.id === d.id));
  assert.equal(
    (await fetch(`${base}/api/photos/${ownPhoto}`, { headers: { Cookie: cookie } })).status,
    200,
  );
  cookie = adminCookie;
  await call('/api/admin', change(person, { role: 'admin', contractorId: null }));
  person = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === person.id,
  );
  await call('/api/admin', change(self, { role: 'gestor' }));
  cookie = contractorCookie;
  const changedSelf = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === user.id,
  );
  await call('/api/admin', change(changedSelf, { role: 'admin' }));
  cookie = adminCookie;
  await call(
    '/api/admin',
    change(person, { role: 'executante', contractorId: firstContractor.id }),
  );
  const {
    rows: [globalUser],
  } = await db.query<{ phone: string }>('SELECT phone FROM users WHERE id=$1', [person.id]);
  assert.equal(globalUser.phone, '+55 11 99999-9999');
  person = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === person.id,
  );
  await call('/api/admin', change(person, { active: false }));
  const secondaryPerson = (await call(`/api/workspace?unit=${secondUnit.id}`)).people.find(
    (p: { id: string }) => p.id === person.id,
  );
  await call('/api/admin', change(secondaryPerson, { unitId: secondUnit.id, active: false }));
  cookie = contractorCookie;
  await call('/api/workspace', undefined, 403);
  cookie = adminCookie;
  // Configuration affects future submissions; pending transfers are explicit and versioned.
  person = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === person.id,
  );
  await call('/api/admin', change(person, { active: true, role: 'aprovador', contractorId: null }));
  ws = await call(`/api/workspace?unit=${unit.id}`);
  const assignment = ws.approvers.find((a: { kind: string }) => a.kind === 'APR');
  const editAssignment = {
    action: 'updateApprover',
    unitId: unit.id,
    id: assignment.id,
    version: assignment.version,
    userId: person.id,
    active: true,
    reason: 'Cobertura de férias',
  };
  await call('/api/admin', editAssignment);
  await call('/api/admin', editAssignment, 409);
  await call('/api/admin', { ...editAssignment, version: assignment.version + 1, active: false });
  await call(`/api/documents/${owned.id}/workflow`, { action: 'submit', version: 1 }, 400);
  await call('/api/admin', { ...editAssignment, version: assignment.version + 2, userId: user.id });
  await call(`/api/documents/${owned.id}/workflow`, { action: 'submit', version: 1 });
  ws = await call(`/api/workspace?unit=${unit.id}`);
  const pending = ws.approvals.filter((a: { document_id: string }) => a.document_id === owned.id);
  assert.equal(pending.length, 4);
  for (const approval of pending) {
    const transfer = {
      action: 'reassignApproval',
      unitId: unit.id,
      id: approval.id,
      assignmentVersion: approval.assignment_version,
      userId: person.id,
      reason: 'Substituição autorizada',
    };
    await call('/api/admin', { ...transfer, reason: '' }, 400);
    await call('/api/admin', { ...transfer, unitId: secondUnit.id }, 404);
    await call('/api/admin', transfer);
    await call('/api/admin', { ...transfer, userId: user.id }, 409);
  }
  const reassigned = await db.query<{ user_id: string; assignment_version: number }>(
    'SELECT user_id,assignment_version FROM approvals WHERE document_id=$1',
    [owned.id],
  );
  assert(reassigned.rows.every((a) => a.user_id === person.id && a.assignment_version === 2));
  const jobs = await db.query<{ user_id: string; status: string }>(
    'SELECT user_id,status FROM notification_outbox WHERE document_id=$1',
    [owned.id],
  );
  assert.equal(jobs.rows.length, 2);
  assert.equal(jobs.rows.find((j) => j.user_id === user.id)?.status, 'cancelled');
  assert.equal(jobs.rows.find((j) => j.user_id === person.id)?.status, 'pending');
  await call(
    '/api/admin',
    {
      action: 'reassignApproval',
      unitId: unit.id,
      id: ws.approvals.find(
        (a: { document_id: string; version: number }) => a.document_id === d.id && a.version === 4,
      ).id,
      assignmentVersion: 1,
      userId: person.id,
      reason: 'Não pode alterar decisão',
    },
    409,
  );
  const transferHistory = await call(`/api/documents/${owned.id}/history`);
  assert.equal(
    transferHistory.events.filter(
      (e: { action: string }) => e.action === 'aprovacao.responsavel_substituido',
    ).length,
    4,
  );
  const {
    rows: [region],
  } = await db.query<{ id: string }>(
    'INSERT INTO regions(company_id,name) VALUES($1,$2) RETURNING id',
    [company.id, 'Regional de teste'],
  );
  await db.query('UPDATE units SET region_id=$1 WHERE id=$2 OR id=$3', [
    region.id,
    unit.id,
    secondUnit.id,
  ]);
  await call('/api/admin', {
    action: 'approver',
    unitId: unit.id,
    userId: person.id,
    kind: 'APR',
    profile: aprProfiles[0],
    scope: 'region',
  });
  ws = await call(`/api/workspace?unit=${unit.id}`);
  const regional = ws.approvers.find(
    (a: { region_id: string | null }) => a.region_id === region.id,
  );
  const editRegional = {
    action: 'updateApprover',
    unitId: unit.id,
    id: regional.id,
    version: regional.version,
    userId: person.id,
    active: false,
    reason: 'Encerramento da cobertura regional',
  };
  const gatewayInput = {
    version: 0,
    baseUrl: 'https://openwa.example.com/api',
    secret: 'chave-global-teste-sem-envio',
  };
  await call('/api/whatsapp/gateway', gatewayInput);
  await call('/api/whatsapp/gateway', gatewayInput, 409);
  const gatewayPublic = await call('/api/whatsapp/gateway');
  assert.equal(gatewayPublic.hasSecret, true);
  assert(!JSON.stringify(gatewayPublic).includes(gatewayInput.secret));
  await call('/api/whatsapp/gateway', { ...gatewayInput, version: 1, secret: '' });
  await call('/api/whatsapp/gateway', {
    ...gatewayInput,
    version: 2,
    secret: 'chave-global-teste-rotacionada',
  });
  const encryptedBinding = (
    await db.query<{ secret_ciphertext: string }>(
      "SELECT secret_ciphertext FROM company_integrations WHERE company_id=$1 AND service='whatsapp'",
      [company.id],
    )
  ).rows[0];
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64);
  assert.equal(
    decryptSecret(encryptedBinding.secret_ciphertext, company.id, 'whatsapp'),
    'chave-global-teste-rotacionada',
  );
  const {
    rows: [unassignedUnit],
  } = await db.query<{ id: string }>(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade sem acesso atribuído','CDD') RETURNING id",
    [company.id],
  );
  assert(
    (await call(`/api/workspace?unit=${unit.id}`)).registeredUnits.some(
      (u: { id: string }) => u.id === unassignedUnit.id,
    ),
  );
  await db.query('UPDATE users SET platform_admin=false WHERE id=$1', [user.id]);
  await call(
    '/api/admin',
    { action: 'setUnitLimit', unitId: unit.id, limit: 5, version: quotaAfter.version },
    403,
  );
  await call('/api/admin', { ...secondUnitInput, name: 'Não ultrapassar limite' }, 409);
  await call('/api/email-gateway', undefined, 403);
  await call(
    '/api/email-gateway',
    { version: 0, sender: 'acesso@example.com', secret: 're_chave_teste_sem_envio' },
    403,
  );
  const unitAdminRegistrations = await call(`/api/workspace?unit=${unit.id}`);
  assert(
    !unitAdminRegistrations.registeredUnits.some((u: { id: string }) => u.id === unassignedUnit.id),
    'Admin local só consulta unidades com acesso ativo',
  );
  assert.equal(
    unitAdminRegistrations.companies.length,
    0,
    'Admin de unidade não lista empresas da plataforma',
  );
  assert(
    unitAdminRegistrations.registeredUnits.every(
      (u: { company_id: string }) => u.company_id === company.id,
    ),
  );
  await call('/api/whatsapp/gateway', undefined, 403);
  await call(
    '/api/whatsapp/gateway',
    { version: 0, baseUrl: 'https://openwa.example.com', secret: 'chave-teste' },
    403,
  );
  const companyConnection = await call(`/api/whatsapp?unit=${unit.id}`);
  assert(
    (await call(`/api/workspace?unit=${secondUnit.id}`)).companyPeople.some(
      (p: { id: string }) => p.id === person.id,
    ),
  );
  assert(!('sessionId' in companyConnection));
  assert(!('secret' in companyConnection));
  assert(!('baseUrl' in companyConnection));
  cookie = contractorCookie;
  await call(`/api/whatsapp?unit=${unit.id}`, undefined, 403);
  const restrictedRegistrations = await call(`/api/workspace?unit=${unit.id}`);
  assert.equal(restrictedRegistrations.companies.length, 0);
  assert.equal(restrictedRegistrations.registeredUnits.length, 0);
  assert.equal(restrictedRegistrations.companyPeople.length, 0);
  assert.equal(restrictedRegistrations.unitQuota, null);
  await call(`/api/address?unit=${unit.id}&cep=01001000`, undefined, 403);
  await call('/api/admin', { ...editContractor, version: savedContractor.version }, 403);
  cookie = adminCookie;
  await call('/api/admin', editRegional, 403);
  await db.query('UPDATE users SET platform_admin=true WHERE id=$1', [user.id]);
  person = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === person.id,
  );
  await call('/api/admin', change(person, { contractorId: firstContractor.id }), 409);
  await call('/api/admin', editRegional);
  await call('/api/admin', change(person, { contractorId: firstContractor.id }));
  assert.equal(
    (
      await db.query('SELECT 1 FROM memberships WHERE user_id=$1 AND unit_id=$2', [
        person.id,
        secondUnit.id,
      ])
    ).rows.length,
    1,
    'Desativar atribuição preserva acesso existente',
  );
  await call('/api/email-gateway', {
    version: 0,
    sender: 'acesso@example.com',
    secret: 're_chave_teste_sem_envio',
  });
  const emailGateway = await call('/api/email-gateway');
  assert.equal(emailGateway.hasSecret, true);
  assert(!JSON.stringify(emailGateway).includes('re_chave_teste_sem_envio'));
  await call(
    '/api/email-gateway',
    { version: 0, sender: 'acesso@example.com', secret: 're_chave_teste_sem_envio' },
    409,
  );
  await call('/api/admin', {
    action: 'user',
    unitId: unit.id,
    name: 'Aprovador convidado',
    email: 'convidado@nexus.local',
    phone: '+55 11 99999-9999',
    role: 'aprovador',
  });
  const invited = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { email: string }) => p.email === 'convidado@nexus.local',
  );
  assert.equal(invited.password_pending, true);
  assert.equal(invited.invitation_status.email.status, 'pending');
  assert.equal(invited.invitation_status.whatsapp.status, 'pending');
  await call(
    '/api/auth',
    { email: 'convidado@nexus.local', password: 'senha-que-admin-nao-define' },
    401,
  );
  const getInvitation = async () =>
    (
      await db.query<{ id: string; token_ciphertext: string }>(
        'SELECT id,token_ciphertext FROM user_invitations WHERE user_id=$1 AND consumed_at IS NULL',
        [invited.id],
      )
    ).rows[0];
  let invitation = await getInvitation();
  const oldToken = decryptSecret(invitation.token_ciphertext, invitation.id, 'invitation');
  await call('/api/invitations', { unitId: unit.id, userId: invited.id });
  await call(
    '/api/invitations/accept',
    { token: oldToken, password: 'nova-senha-aprovador-123' },
    400,
  );
  invitation = await getInvitation();
  const token = decryptSecret(invitation.token_ciphertext, invitation.id, 'invitation');
  await call('/api/invitations/accept', { token, password: 'curta' }, 400);
  await call('/api/invitations/accept', { token, password: 'nova-senha-aprovador-123' });
  await call('/api/invitations/accept', { token, password: 'nova-senha-aprovador-123' }, 400);
  await call('/api/auth', { email: 'convidado@nexus.local', password: 'nova-senha-aprovador-123' });
  assert.equal((await call(`/api/workspace?unit=${unit.id}`)).user.id, invited.id);
  await call('/api/invitations', { unitId: unit.id, userId: user.id }, 403);
  await call(`/api/documents/${d.id}/remove`, { version: 4 }, 403);
  await call(
    '/api/admin',
    { action: 'deleteRegistration', unitId: unit.id, kind: 'unit', id: unit.id },
    403,
  );
  cookie = adminCookie;
  await call('/api/invitations', { unitId: unit.id, userId: invited.id }, 409);
  await call('/api/admin', { action: 'region', unitId: unit.id, name: 'Regional para excluir' });
  const removableRegion = (await call(`/api/workspace?unit=${unit.id}`)).regions.find(
    (r: { name: string }) => r.name === 'Regional para excluir',
  );
  await call('/api/admin', {
    action: 'deleteRegistration',
    unitId: unit.id,
    kind: 'region',
    id: removableRegion.id,
  });
  assert(
    !(await call(`/api/workspace?unit=${unit.id}`)).regions.some(
      (r: { id: string }) => r.id === removableRegion.id,
    ),
  );
  await call(
    '/api/admin',
    { action: 'deleteRegistration', unitId: unit.id, kind: 'region', id: removableRegion.id },
    404,
  );
  await call(
    '/api/admin',
    { action: 'deleteRegistration', unitId: unit.id, kind: 'unit', id: unit.id },
    409,
  );
  await call(`/api/documents/${d.id}/remove`, { version: 4 }, 409);
  const removableApr = {
    ...d,
    id: randomUUID(),
    version: 0,
    contractorId: firstContractor.id,
    title: 'APR para remover',
  };
  await call('/api/documents', removableApr);
  await call(`/api/documents/${removableApr.id}/remove`, { version: 99 }, 409);
  await call(`/api/documents/${removableApr.id}/remove`, { version: 1 });
  assert(
    !(await call(`/api/workspace?unit=${unit.id}`)).documents.some(
      (row: { id: string }) => row.id === removableApr.id,
    ),
  );
  await call('/api/documents', { ...removableApr, version: 1 }, 409);
  await call(
    '/api/documents',
    {
      ...pt,
      id: randomUUID(),
      version: 0,
      aprId: removableApr.id,
      contractorId: firstContractor.id,
    },
    400,
  );
  await call(`/api/documents/${removableApr.id}/workflow`, { action: 'submit', version: 1 }, 409);
  assert(
    (await call(`/api/documents/${removableApr.id}/history`)).events.some(
      (e: { action: string }) => e.action === 'apr.removida',
    ),
  );
  const removedPrint = await fetch(base + `/print/${removableApr.id}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(removedPrint.status, 200);
  assert((await removedPrint.text()).includes('APR REMOVIDA DA OPERAÇÃO'));
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
    'Integração OK: APR/PT, integrações, gestão de acessos por unidade, contatos independentes, isolamento de documentos/fotos por terceirizada, desativação sem exclusão, proteção do último administrador e CSRF. Nenhuma chamada a provedores reais.',
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
