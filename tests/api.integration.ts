import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { hashPassword, digest } from '../src/lib/security';
import { decryptSecret, encryptSecret } from '../src/lib/integrations';
import { aprProfiles } from '../src/lib/forms';
import { totp } from '../src/lib/totp';
const db = await PGlite.create();
process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64);
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
await db.exec(await readFile(new URL('../db/011-company-details.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../db/012-safety-role.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../db/013-approval-identity.sql', import.meta.url), 'utf8'));
await db.exec(
  await readFile(new URL('../db/014-company-administrators.sql', import.meta.url), 'utf8'),
);
await db.exec(await readFile(new URL('../db/015-company-audit.sql', import.meta.url), 'utf8'));
await db.exec(
  await readFile(new URL('../db/016-contractor-executors.sql', import.meta.url), 'utf8'),
);
await db.exec(await readFile(new URL('../db/017-login-mfa.sql', import.meta.url), 'utf8'));
await db.exec(
  await readFile(new URL('../db/019-contractor-onboarding.sql', import.meta.url), 'utf8'),
);
await db.exec(
  await readFile(new URL('../db/018-identity-upload-policy.sql', import.meta.url), 'utf8'),
);
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
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await new Promise((r) => setTimeout(r, 200));
    if (i === 99) throw new Error('Servidor não iniciou: ' + logs);
  }
  let cookie = '';
  const call = async (path: string, body?: unknown, expected = 200, method?: string) => {
    if (
      path === '/api/admin' &&
      body &&
      typeof body === 'object' &&
      'action' in body &&
      body.action === 'contractor'
    ) {
      const b = body as { action: unknown; cnpj: string; details?: Record<string, unknown> };
      body = {
        ...b,
        details: {
          contactName: 'Contato de teste',
          email: `contact-${b.cnpj}@example.com`,
          phone: '5511999999999',
          ...b.details,
        },
      };
    }
    if (
      body &&
      typeof body === 'object' &&
      'action' in body &&
      ['approve', 'reject'].includes(String(body.action)) &&
      !path.startsWith('/api/contractor-registrations')
    )
      body = { password, ...body };
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
  await call(`/api/audit?context=${unit.id}`, undefined, 401);
  await call('/api/auth', { email: 'test@nexus.local', password: 'incorreta' }, 401);
  await call('/api/auth', { email: 'test@nexus.local', password });
  let ws = await call('/api/workspace');
  assert.equal(ws.unit.id, unit.id);
  await call(`/api/audit?context=${unit.id}`, undefined, 403);
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
  const companyData = {
    name: 'Empresa isolada',
    cnpj: '11222333000181',
    details: {
      contactName: 'Responsável financeiro',
      email: 'fiscal@example.com',
      phone: '11999999999',
      cep: '01001000',
      street: 'Praça da Sé',
      number: '100',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
      municipalityCode: '3550308',
      billingEmail: 'notas@example.com',
    },
  };
  await call('/api/admin', { action: 'company', unitId: unit.id, name: 'Incompleta' }, 400);
  await call('/api/admin', { action: 'company', unitId: unit.id, ...companyData });
  await call('/api/admin', { action: 'company', unitId: unit.id, ...companyData }, 409);
  const allUnits = (await call('/api/workspace')).units;
  const isolatedUnit = allUnits.find((u: { company_id: string }) => u.company_id !== company.id);
  await call(
    '/api/admin',
    { ...editContractor, unitId: isolatedUnit.id, version: savedContractor.version },
    404,
  );
  const companyRegistrations = await call(`/api/workspace?unit=${unit.id}`);
  const registeredCompany = companyRegistrations.companies.find(
    (c: { id: string }) => c.id === isolatedUnit.company_id,
  );
  assert.equal(registeredCompany.cnpj, companyData.cnpj);
  assert.equal(registeredCompany.details.billingEmail, companyData.details.billingEmail);
  const editCompany = {
    action: 'updateCompany',
    unitId: unit.id,
    id: registeredCompany.id,
    version: registeredCompany.version,
    ...companyData,
    details: { ...companyData.details, contactName: 'Novo responsável' },
  };
  await call('/api/admin', editCompany);
  await call('/api/admin', editCompany, 409);
  assert.equal(
    (await call(`/api/workspace?unit=${unit.id}`)).companies.find(
      (c: { id: string }) => c.id === registeredCompany.id,
    ).details.contactName,
    'Novo responsável',
  );
  await call(
    '/api/admin',
    {
      action: 'deleteRegistration',
      kind: 'company',
      unitId: unit.id,
      id: registeredCompany.id,
      version: registeredCompany.version + 1,
    },
    409,
  );
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
  const seedResponsible = async (contractorId: string, email: string) => {
    await call('/api/admin', {
      action: 'user',
      unitId: unit.id,
      name: 'Segurança da contratada',
      email,
      phone: '5511999999999',
      role: 'seguranca_trabalho',
      contractorId,
    });
    const {
      rows: [responsible],
    } = await db.query<{ id: string }>(
      'UPDATE users SET password_pending=false,password_hash=$2 WHERE email=$1 RETURNING id',
      [email, hashPassword(password)],
    );
    await call('/api/security', {
      action: 'verify',
      unitId: unit.id,
      userId: responsible.id,
      cpf: email.includes('first') ? '52998224725' : '11144477735',
      reference: 'Conferência presencial de documento com foto e vínculo',
      confirmed: true,
      password,
      version: 1,
    });
    return responsible.id;
  };
  const responsibleEmail = 'safety-first@example.com';
  const responsibleId = await seedResponsible(ws.contractors[0].id, responsibleEmail);
  // Fixture de conferência anterior do administrador, realizada por outro usuário.
  await db.query("UPDATE users SET phone='5511999999999' WHERE id=$1", [user.id]);
  await db.query(
    "UPDATE memberships m SET identity_verified_at=now(),identity_verified_by=$3,identity_snapshot=jsonb_build_object('name',u.name,'email',u.email,'phone',COALESCE(m.phone,u.phone),'contractorId',m.contractor_id) FROM users u WHERE m.user_id=u.id AND u.id=$1 AND m.unit_id=$2",
    [user.id, unit.id, responsibleId],
  );
  const approveAsResponsible = async (documentId: string, version: number, email: string) => {
    const previous = cookie;
    await call('/api/auth', { email, password });
    await call(`/api/documents/${documentId}/workflow`, { action: 'approve', version });
    cookie = previous;
  };
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
      answers: { companyUserId: responsibleId, safetyUserId: responsibleId },
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
  assert.equal(created.data.answers.companyOwner, 'Segurança da contratada');
  assert.equal(created.data.answers.safetyPhone, '5511999999999');
  await call(
    '/api/documents',
    {
      ...d,
      id: randomUUID(),
      data: { ...d.data, answers: { ...d.data.answers, safetyUserId: user.id } },
    },
    400,
  );
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
  await db.query('UPDATE memberships SET active=false WHERE user_id=$1 AND unit_id=$2', [
    responsibleId,
    unit.id,
  ]);
  await call(`/api/documents/${d.id}/workflow`, { action: 'submit', version: 2 }, 400);
  await db.query('UPDATE memberships SET active=true WHERE user_id=$1 AND unit_id=$2', [
    responsibleId,
    unit.id,
  ]);
  const legacyApr = await call('/api/documents', {
    ...d,
    id: randomUUID(),
    data: { ...d.data, answers: { companyOwner: 'Nome antigo sem vínculo' } },
  });
  await call(`/api/documents/${legacyApr.id}/workflow`, { action: 'submit', version: 1 }, 400);
  await call(`/api/documents/${d.id}/workflow`, { action: 'submit', version: 2 });
  const queued = (await call(`/api/notifications?unit=${unit.id}`)).notifications;
  assert.equal(
    queued.length,
    2,
    'Perfis da contratada e contratante avisam as pessoas correspondentes sem duplicar por perfil',
  );
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
  await approveAsResponsible(d.id, 2, responsibleEmail);
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
  const nextResponsibleEmail = 'safety-next@example.com';
  const nextResponsibleId = await seedResponsible(nextContractor.id, nextResponsibleEmail);
  const revision = await call('/api/documents', {
    ...d,
    version: 3,
    title: 'Nova revisão da cobertura',
    contractorId: nextContractor.id,
    data: {
      ...d.data,
      answers: { companyUserId: nextResponsibleId, safetyUserId: nextResponsibleId },
    },
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
  await approveAsResponsible(d.id, 4, nextResponsibleEmail);
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
  await call(
    '/api/admin',
    {
      action: 'user',
      unitId: unit.id,
      name: 'Outro executante',
      email: 'executor@nexus.local',
      phone: '11999999999',
      role: 'executante',
      password: executorPassword,
    },
    400,
  );
  await call('/api/admin', {
    action: 'user',
    unitId: unit.id,
    name: 'Outro executante',
    email: 'executor@nexus.local',
    phone: '+55 11 99999-9999',
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
  const executorInvitation = (
    await db.query<{ id: string; token_ciphertext: string }>(
      "SELECT i.id,i.token_ciphertext FROM user_invitations i JOIN users u ON u.id=i.user_id WHERE u.email='executor@nexus.local' AND i.consumed_at IS NULL",
    )
  ).rows[0];
  await call('/api/auth', { email: 'executor@nexus.local', password: executorPassword }, 401);
  await call('/api/invitations/accept', {
    token: decryptSecret(executorInvitation.token_ciphertext, executorInvitation.id, 'invitation'),
    password: executorPassword,
  });
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
  const people = (await call(`/api/workspace?unit=${unit.id}`)).people;
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
    '5511999999999',
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
    '5511999999999',
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
  const restrictedPeople = await call(`/api/workspace?unit=${unit.id}`);
  const changedSelf = restrictedPeople.people.find((p: { id: string }) => p.id === user.id);
  assert.equal(changedSelf, undefined, 'Superadmin não aparece na lista de pessoas da empresa');
  assert(!restrictedPeople.companyPeople.some((p: { id: string }) => p.id === user.id));
  assert(!restrictedPeople.approvers.some((p: { user_id: string }) => p.user_id === user.id));
  await call(
    '/api/admin',
    {
      action: 'membership',
      unitId: unit.id,
      email: 'test@nexus.local',
      role: 'aprovador',
      contractorId: null,
    },
    403,
  );
  await call(
    '/api/admin',
    {
      action: 'approver',
      unitId: unit.id,
      userId: user.id,
      kind: 'APR',
      profile: aprProfiles[2],
      scope: 'unit',
    },
    403,
  );
  await call(
    '/api/admin',
    change({ ...self, membership_version: self.membership_version + 1 }, { role: 'admin' }),
    403,
  );
  await db.query(
    "UPDATE memberships SET role='admin',version=version+1 WHERE user_id=$1 AND unit_id=$2",
    [user.id, unit.id],
  );
  cookie = adminCookie;
  await call(
    '/api/admin',
    change(person, { role: 'executante', contractorId: firstContractor.id }),
  );
  const {
    rows: [globalUser],
  } = await db.query<{ phone: string }>('SELECT phone FROM users WHERE id=$1', [person.id]);
  assert.equal(globalUser.phone, '5511999999999');
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
  const assignment = ws.approvers.find(
    (a: { kind: string; profile: string }) => a.kind === 'APR' && a.profile === aprProfiles[2],
  );
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
  assert.equal(jobs.rows.length, 3);
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
  await call('/api/admin', { ...editCompany, version: editCompany.version + 1 }, 403);
  await call(
    '/api/admin',
    { action: 'company', unitId: unit.id, ...companyData, cnpj: '22333444000181' },
    403,
  );
  await call(
    '/api/admin',
    { action: 'deleteRegistration', unitId: unit.id, kind: 'account', id: person.id },
    403,
  );
  await call(
    '/api/admin',
    { action: 'setUnitLimit', unitId: unit.id, limit: 5, version: quotaAfter.version },
    403,
  );
  await call('/api/admin', { ...secondUnitInput, name: 'Não ultrapassar limite' }, 403);
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
    1,
    'Admin de unidade consulta somente a própria empresa',
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
  const companyConnection = await call(`/api/whatsapp?unit=${unit.id}`, undefined, 403);
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
  await call(
    '/api/admin',
    change(person, { contractorId: firstContractor.id, role: 'gestor' }),
    409,
  );
  await call('/api/admin', editRegional);
  await call('/api/admin', change(person, { contractorId: firstContractor.id, role: 'gestor' }));
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
  const globalAccount = {
    action: 'user',
    unitId: unit.id,
    name: 'Usuário para excluir globalmente',
    email: 'global-remove@nexus.local',
    phone: '+55 11 99999-9999',
    role: 'executante',
  };
  await call('/api/admin', globalAccount);
  const excludedGlobalUser = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { email: string }) => p.email === globalAccount.email,
  );
  await call('/api/admin', {
    action: 'membership',
    unitId: secondUnit.id,
    email: globalAccount.email,
    role: 'executante',
  });
  await call('/api/admin', {
    action: 'deleteRegistration',
    unitId: unit.id,
    kind: 'user',
    id: excludedGlobalUser.id,
    version: excludedGlobalUser.membership_version,
  });
  assert(
    (await call(`/api/workspace?unit=${unit.id}`)).companyPeople.some(
      (p: { id: string }) => p.id === excludedGlobalUser.id,
    ),
  );
  await call('/api/admin', {
    action: 'deleteRegistration',
    unitId: unit.id,
    kind: 'account',
    id: excludedGlobalUser.id,
  });
  assert(
    !(await call(`/api/workspace?unit=${unit.id}`)).companyPeople.some(
      (p: { id: string }) => p.id === excludedGlobalUser.id,
    ),
  );
  assert(
    !(await call(`/api/workspace?unit=${secondUnit.id}`)).people.some(
      (p: { id: string }) => p.id === excludedGlobalUser.id,
    ),
  );
  await call(
    '/api/admin',
    { action: 'membership', unitId: unit.id, email: globalAccount.email, role: 'executante' },
    404,
  );
  await call('/api/admin', globalAccount, 409);
  await call(
    '/api/auth',
    { email: globalAccount.email, password: 'senha-teste-exclusao-123' },
    401,
  );
  for (const invitedRole of ['gestor', 'admin']) {
    const email = `convite-${invitedRole}@nexus.local`;
    await call('/api/admin', {
      action: 'user',
      unitId: unit.id,
      name: `Convidado ${invitedRole}`,
      email,
      phone: '47999595207',
      role: invitedRole,
    });
    const pendingPerson = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
      (p: { email: string }) => p.email === email,
    );
    assert.equal(pendingPerson.password_pending, true);
    assert.equal(pendingPerson.phone, '5547999595207');
    assert.equal(pendingPerson.invitation_status.email.status, 'pending');
    assert.equal(pendingPerson.invitation_status.whatsapp.status, 'pending');
    await call('/api/auth', { email, password: 'senha-definida-por-admin' }, 401);
  }
  cookie = adminCookie;
  // Exercise the tenant administrator's MFA rules independently of the Nexus exemption.
  await db.query('UPDATE users SET platform_admin=false WHERE id=$1', [user.id]);
  await db.query('INSERT INTO company_admins(company_id,user_id) VALUES($1,$2)', [
    company.id,
    user.id,
  ]);
  const securityPolicy = await call(`/api/security?unit=${unit.id}`);
  assert.equal(securityPolicy.required, false);
  await call(
    '/api/security',
    {
      action: 'verify',
      unitId: unit.id,
      userId: user.id,
      cpf: '52998224725',
      reference: 'Não permite autoconferência',
      confirmed: true,
      password,
      version: 1,
    },
    403,
  );
  await call('/api/security', { action: 'begin', unitId: unit.id, password: 'incorreta' }, 403);
  const enrollment = await call('/api/security', { action: 'begin', unitId: unit.id, password });
  assert.match(enrollment.secret, /^[A-Z2-7]{32}$/);
  assert.match(enrollment.qrCode, /^data:image\/png;base64,/);
  const enrollmentStep = Math.floor(Date.now() / 30000);
  const confirmedEnrollment = await call('/api/security', {
    action: 'confirm',
    unitId: unit.id,
    password,
    code: totp(enrollment.secret, enrollmentStep - 1),
  });
  assert(!('secret' in confirmedEnrollment));
  assert(!('qrCode' in confirmedEnrollment));
  const policyCode = totp(enrollment.secret, enrollmentStep);
  await call('/api/security', {
    action: 'policy',
    unitId: unit.id,
    required: true,
    version: securityPolicy.version,
    password,
    code: policyCode,
  });
  assert.equal((await call(`/api/workspace?unit=${unit.id}`)).securityPolicy.required, true);
  assert.equal(
    (await call(`/api/security?unit=${isolatedUnit.id}`)).required,
    false,
    'Política não invade outra empresa',
  );
  await call(
    '/api/security',
    {
      action: 'policy',
      unitId: unit.id,
      required: false,
      version: securityPolicy.version + 1,
      password,
    },
    403,
  );
  await call(
    '/api/security',
    {
      action: 'policy',
      unitId: unit.id,
      required: false,
      version: securityPolicy.version + 1,
      password,
      code: policyCode,
    },
    403,
  );
  const rootSecurityCookie = cookie;
  const loginChallenge = await call('/api/auth', { email: responsibleEmail, password });
  assert.equal(loginChallenge.mfaRequired, true);
  await call(
    '/api/security',
    {
      action: 'policy',
      unitId: unit.id,
      required: false,
      version: securityPolicy.version + 1,
      password,
    },
    401,
  );
  await call(`/api/documents/${d.id}/workflow`, { action: 'approve', version: 4, password }, 401);
  cookie = rootSecurityCookie;
  await call('/api/security', {
    action: 'policy',
    unitId: unit.id,
    required: false,
    version: securityPolicy.version + 1,
    password,
    code: totp(enrollment.secret, enrollmentStep + 1),
  });
  await call(
    '/api/security',
    {
      action: 'policy',
      unitId: unit.id,
      required: false,
      version: securityPolicy.version,
      password,
    },
    409,
  );
  assert(!JSON.stringify(await call(`/api/security?unit=${unit.id}`)).includes(enrollment.secret));
  await call('/api/security', { action: 'begin', unitId: unit.id, password }, 409);
  await call('/api/auth', { email: responsibleEmail, password });
  const ownEnrollment = await call('/api/security', { action: 'begin', unitId: unit.id, password });
  await call('/api/security', {
    action: 'confirm',
    unitId: unit.id,
    password,
    code: totp(ownEnrollment.secret, Math.floor(Date.now() / 30000) - 1),
  });
  const revokedCookie = cookie;
  cookie = rootSecurityCookie;
  const recoverPerson = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === responsibleId,
  );
  await call('/api/security', {
    action: 'reset',
    unitId: unit.id,
    userId: responsibleId,
    version: recoverPerson.membership_version,
    password,
    reference: 'Recuperação assistida após nova conferência',
    confirmed: true,
  });
  const recovered = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === responsibleId,
  );
  assert.equal(recovered.authenticator_enabled, false);
  assert.equal(recovered.identity_verified_at, null);
  cookie = revokedCookie;
  await call('/api/workspace', undefined, 401);
  cookie = rootSecurityCookie;
  const securityAudits = await db.query<{ details: unknown }>(
    "SELECT details FROM audit_events WHERE action LIKE 'seguranca.%'",
  );
  const securityText = JSON.stringify(securityAudits.rows);
  assert(!securityText.includes(password));
  assert(!securityText.includes(enrollment.secret));
  assert(!securityText.includes(ownEnrollment.secret));
  assert(!securityText.includes('52998224725'));
  await db.query('UPDATE users SET platform_admin=true WHERE id=$1', [user.id]);
  await db.query('DELETE FROM company_admins WHERE user_id=$1', [user.id]);
  await db.query(
    'UPDATE user_security SET secret_ciphertext=NULL,enabled_at=NULL WHERE user_id=$1',
    [user.id],
  );
  await call('/api/security', {
    action: 'policy',
    unitId: unit.id,
    required: true,
    version: securityPolicy.version + 2,
    password,
  });
  await call(
    '/api/security',
    {
      action: 'policy',
      unitId: unit.id,
      required: false,
      version: securityPolicy.version + 3,
      password: 'incorreta',
    },
    403,
  );
  await call('/api/security', {
    action: 'policy',
    unitId: unit.id,
    required: false,
    version: securityPolicy.version + 3,
    password,
  });
  const rootPerson = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === user.id,
  );
  assert.equal(rootPerson.platform_admin, true);
  const decisions = await db.query<{
    details: { verification?: { method: string; snapshotHash: string } };
  }>("SELECT details FROM audit_events WHERE action='workflow.approve'");
  assert(
    decisions.rows.every(
      (row) =>
        row.details.verification?.method === 'password' &&
        row.details.verification.snapshotHash.length === 64,
    ),
  );
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
  cookie = adminCookie;
  const matrixUsers: Record<string, string> = {};
  for (const role of [
    'owner',
    'admin',
    'gestor',
    'seguranca_trabalho',
    'aprovador',
    'executante',
  ]) {
    const {
      rows: [member],
    } = await db.query<{ id: string }>(
      'INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id',
      [`Matriz ${role}`, `matrix-${role}@example.com`, '5511999999999', hashPassword(password)],
    );
    matrixUsers[role] = member.id;
    await db.query('INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,$3)', [
      member.id,
      unit.id,
      role === 'owner' ? 'admin' : role,
    ]);
  }
  await call('/api/admin', {
    action: 'updateMembership',
    unitId: unit.id,
    userId: matrixUsers.owner,
    version: 1,
    role: 'admin_empresa',
    contractorId: null,
    active: true,
    phone: '5511999999999',
  });
  await call('/api/auth', { email: 'matrix-owner@example.com', password });
  const ownerView = await call(`/api/workspace?unit=${unassignedUnit.id}`);
  assert.equal(ownerView.unit.company_admin, true);
  assert(ownerView.units.some((un: { id: string }) => un.id === unit.id));
  assert.equal(ownerView.companies.length, 1);
  const audit = await call(`/api/audit?context=${unit.id}`);
  assert(audit.events.length > 0);
  assert.equal(audit.events.length <= 50, true);
  assert(
    audit.events.every(
      (event: { details: Record<string, unknown> }) => !('secret' in event.details),
    ),
  );
  await call(`/api/audit?context=${isolatedUnit.id}`, undefined, 403);
  await call(`/api/audit?context=${unit.id}&unit=${isolatedUnit.id}`, undefined, 403);
  await call(`/api/audit?context=${unit.id}&from=2026-11-20&to=2026-11-19`, undefined, 400);
  await call(`/api/workspace?unit=${isolatedUnit.id}`, undefined, 403);
  await call('/api/admin', {
    action: 'region',
    unitId: unit.id,
    name: 'Regional gerenciada pela empresa',
  });
  await call(
    '/api/admin',
    {
      action: 'updateCompany',
      unitId: unit.id,
      id: isolatedUnit.company_id,
      version: 1,
      ...companyData,
    },
    403,
  );
  await call('/api/whatsapp/gateway', undefined, 403);
  await call('/api/email-gateway', undefined, 403);
  const tenantIntegrations = await call(`/api/integrations?unit=${unit.id}`);
  assert(
    tenantIntegrations.integrations.every(
      (integration: { service: string }) => integration.service === 'signature',
    ),
  );
  assert.equal(tenantIntegrations.openwaDefaultUrl, '');
  const companyReviewerCookie = cookie;
  await db.query(
    "INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin') ON CONFLICT DO NOTHING",
    [user.id, unassignedUnit.id],
  );
  await call('/api/auth', { email: 'test@nexus.local', password });
  await call('/api/admin', {
    action: 'contractor',
    unitId: unassignedUnit.id,
    name: 'Contratada compartilhada',
    cnpj: '44555666000177',
  });
  cookie = companyReviewerCookie;
  const sharedContractor = (
    await call(`/api/workspace?unit=${unassignedUnit.id}`)
  ).contractors.find((c: { cnpj: string }) => c.cnpj === '44555666000177');
  await call('/api/auth', { email: 'matrix-admin@example.com', password });
  const localView = await call(`/api/workspace?unit=${unit.id}`);
  await call(`/api/audit?context=${unit.id}`, undefined, 403);
  assert.equal(localView.unit.company_admin, false);
  assert(localView.registeredUnits.every((un: { id: string }) => un.id === unit.id));
  await call(`/api/workspace?unit=${unassignedUnit.id}`, undefined, 403);
  await call('/api/admin', { action: 'region', unitId: unit.id, name: 'Regional indevida' }, 403);
  await call(
    '/api/admin',
    { action: 'unit', unitId: unit.id, name: 'Unidade indevida', kind: 'CDD', regionId: null },
    403,
  );
  await call(
    '/api/admin',
    {
      action: 'contractor',
      unitId: unit.id,
      name: 'Cadastro da unidade',
      cnpj: '77888999000100',
    },
    403,
  );
  await call(
    '/api/admin',
    {
      action: 'updateMembership',
      unitId: unit.id,
      userId: matrixUsers.owner,
      version: 2,
      role: 'admin',
      contractorId: null,
      active: true,
      phone: '5511999999999',
    },
    403,
  );
  await call(
    '/api/admin',
    {
      action: 'user',
      unitId: unit.id,
      name: 'Elevação indevida',
      email: 'elevated@example.com',
      role: 'admin_empresa',
      phone: '5511999999999',
      contractorId: null,
    },
    403,
  );
  await call(
    '/api/security',
    { action: 'policy', unitId: unit.id, required: false, version: 1, password },
    403,
  );
  await call('/api/whatsapp?unit=' + unit.id, undefined, 403);
  await call(
    '/api/admin',
    {
      action: 'linkContractor',
      unitId: unit.id,
      contractorId: sharedContractor.id,
    },
    403,
  );
  const unitAdminCookie = cookie;
  await call('/api/auth', { email: 'test@nexus.local', password });
  await call('/api/admin', {
    action: 'linkContractor',
    unitId: unit.id,
    contractorId: sharedContractor.id,
  });
  cookie = unitAdminCookie;
  await call(
    '/api/admin',
    {
      action: 'updateContractor',
      unitId: unit.id,
      id: sharedContractor.id,
      version: sharedContractor.version,
      name: 'Alteração indevida',
      details: {},
    },
    403,
  );
  await call(
    '/api/admin',
    {
      action: 'deleteRegistration',
      kind: 'contractor',
      unitId: unit.id,
      id: sharedContractor.id,
      version: sharedContractor.version,
    },
    409,
  );
  const sharedContact = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { contractor_id: string; role: string }) =>
      p.contractor_id === sharedContractor.id && p.role === 'gestor',
  );
  await call('/api/admin', {
    action: 'deleteRegistration',
    kind: 'user',
    unitId: unit.id,
    id: sharedContact.id,
    version: sharedContact.membership_version,
  });
  await call('/api/admin', {
    action: 'deleteRegistration',
    kind: 'contractor',
    unitId: unit.id,
    id: sharedContractor.id,
    version: sharedContractor.version,
  });
  assert.equal(
    (await db.query('SELECT 1 FROM contractors WHERE id=$1', [sharedContractor.id])).rowCount,
    1,
  );
  let matrixDocument: { id: string; version: number } | undefined;
  for (const role of ['gestor', 'seguranca_trabalho', 'executante']) {
    await call('/api/auth', { email: `matrix-${role}@example.com`, password });
    const scoped = await call(`/api/workspace?unit=${unit.id}`);
    await call(`/api/audit?context=${unit.id}`, undefined, 403);
    for (const field of ['companies', 'regions', 'registeredUnits', 'companyPeople'])
      assert.equal(scoped[field].length, 0, `${role}: ${field}`);
    assert(
      scoped.people.every(
        (p: { id: string; email: string }) => p.id === matrixUsers[role] || !p.email,
      ),
    );
    await call('/api/admin', { action: 'region', unitId: unit.id, name: 'Sem permissão' }, 403);
    await call('/api/integrations?unit=' + unit.id, undefined, 403);
    const draft = await call('/api/documents', {
      ...d,
      id: randomUUID(),
      title: `Rascunho de ${role}`,
    });
    if (role === 'seguranca_trabalho') matrixDocument = draft;
    if (role === 'executante') {
      assert(
        !(await call(`/api/workspace?unit=${unit.id}`)).documents.some(
          (doc: { id: string }) => doc.id === pt.id,
        ),
      );
      await call(`/api/documents/${pt.id}/history`, undefined, 403);
    }
  }
  cookie = adminCookie;
  await call(`/api/documents/${matrixDocument!.id}/workflow`, { action: 'submit', version: 1 });
  const assignedApproval = (await call(`/api/workspace?unit=${unit.id}`)).approvals.find(
    (a: { document_id: string; profile: string }) =>
      a.document_id === matrixDocument!.id && a.profile === aprProfiles[2],
  );
  await call('/api/admin', {
    action: 'reassignApproval',
    unitId: unit.id,
    id: assignedApproval.id,
    assignmentVersion: assignedApproval.assignment_version,
    userId: matrixUsers.aprovador,
    reason: 'Designação para teste de acesso',
  });
  await call('/api/auth', { email: 'matrix-aprovador@example.com', password });
  const approverScope = await call(`/api/workspace?unit=${unit.id}`);
  await call(`/api/audit?context=${unit.id}`, undefined, 403);
  assert.equal(approverScope.documents.length, 1);
  assert.equal(approverScope.documents[0].id, matrixDocument!.id);
  for (const field of ['companies', 'regions', 'registeredUnits', 'companyPeople', 'approvers'])
    assert.equal(approverScope[field].length, 0);
  await call('/api/documents', { ...d, id: randomUUID() }, 403);
  await call(`/api/documents/${d.id}/history`, undefined, 403);
  await call(`/api/documents/${matrixDocument!.id}/history`);
  await call(`/api/documents/${pt.id}/photos`, undefined, 403);
  assert.equal(
    (await fetch(`${base}/api/photos/${ownPhoto}`, { headers: { Cookie: cookie } })).status,
    403,
  );
  assert.equal((await fetch(`${base}/print/${d.id}`, { headers: { Cookie: cookie } })).status, 404);
  assert.equal(
    (await fetch(`${base}/print/${matrixDocument!.id}`, { headers: { Cookie: cookie } })).status,
    200,
  );
  cookie = adminCookie;
  const rootRow = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { id: string }) => p.id === user.id,
  );
  await call(
    '/api/admin',
    {
      action: 'deleteRegistration',
      kind: 'user',
      id: user.id,
      unitId: unit.id,
      version: rootRow.membership_version,
    },
    403,
  );
  const onboardingDetails = {
    contactName: 'Contato onboarding',
    email: 'onboarding@test.example',
    phone: '5511999999999',
  };
  await call('/api/admin', {
    action: 'contractor',
    unitId: unit.id,
    name: 'Contratada onboarding',
    cnpj: '11223344000155',
    details: onboardingDetails,
  });
  const onboardingView = await call(`/api/workspace?unit=${unit.id}`);
  const onboardingContractor = onboardingView.contractors.find(
    (c: { cnpj: string }) => c.cnpj === '11223344000155',
  );
  const contactA = onboardingView.people.find(
    (p: { email: string }) => p.email === onboardingDetails.email,
  );
  assert.equal(contactA.role, 'gestor');
  assert.equal(contactA.password_pending, true);
  assert.equal(onboardingView.identityPolicy.enabled, false);
  await call('/api/identity-policy', {
    unitId: unit.id,
    enabled: true,
    version: onboardingView.identityPolicy.version,
  });
  await db.query('UPDATE users SET password_hash=$2,password_pending=false WHERE id=$1', [
    contactA.id,
    hashPassword(password),
  ]);
  await call('/api/auth', { email: onboardingDetails.email, password });
  assert.equal((await call(`/api/workspace?unit=${unit.id}`)).documents.length, 0);
  await call('/api/admin', { action: 'region', unitId: unit.id, name: 'Escalada indevida' }, 403);
  const identityFile = {
    mime: 'application/pdf',
    base64: Buffer.from('%PDF-1.4\nDummy identity fixture only').toString('base64'),
  };
  const pendingContact = await call(`/api/workspace?unit=${unit.id}`);
  assert.equal(pendingContact.identityOnboarding.required, true);
  assert.equal(pendingContact.documents.length, 0);
  await call(
    '/api/contractor-team',
    {
      action: 'register',
      cpf: '39053344705',
      unitId: unit.id,
      name: 'Bloqueado',
      email: 'blocked@test.example',
      phone: '5511999999999',
    },
    403,
  );
  const contactSubmission = await call('/api/my-identity', {
    unitId: unit.id,
    documentType: 'RG',
    files: [identityFile],
  });
  await call(
    '/api/my-identity',
    { unitId: unit.id, userId: user.id, documentType: 'RG', files: [identityFile] },
    400,
  );
  cookie = adminCookie;
  await call('/api/contractor-team', {
    action: 'review',
    unitId: unit.id,
    id: contactSubmission.id,
    version: 1,
    decision: 'approved',
    reason: 'Responsável da contratada conferido pela unidade',
    confirmed: true,
  });
  await call('/api/auth', { email: onboardingDetails.email, password });
  assert.equal((await call(`/api/workspace?unit=${unit.id}`)).identityOnboarding.required, false);
  const registration = {
    action: 'register',
    cpf: '39053344705',
    unitId: unit.id,
    name: 'Executor onboarding',
    email: 'executor-onboarding@test.example',
    phone: '5511888888888',
    documentType: 'RG',
    files: [identityFile],
  };
  const submitted = await call('/api/contractor-team', registration);
  await call(
    '/api/contractor-team',
    { ...registration, email: 'escalada@test.example', role: 'admin' },
    400,
  );
  const teamA = await call(`/api/contractor-team?unit=${unit.id}`);
  const executorA = teamA.people.find((p: { email: string }) => p.email === registration.email);
  assert.equal(executorA.status, 'pending');
  assert(!JSON.stringify(teamA).includes(identityFile.base64));
  await call(
    '/api/contractor-team',
    {
      action: 'review',
      unitId: unit.id,
      id: submitted.id,
      version: 1,
      decision: 'approved',
      reason: 'Autovalidação indevida',
      confirmed: true,
    },
    403,
  );
  await call(`/api/contractor-team?unit=${isolatedUnit.id}`, undefined, 403);
  const privateDownload = await fetch(`${base}/api/executor-files/${executorA.files[0].id}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(privateDownload.status, 200);
  assert(privateDownload.headers.get('cache-control')?.includes('no-store'));
  assert(privateDownload.headers.get('content-disposition')?.startsWith('attachment;'));
  cookie = adminCookie;
  const executorDraft = {
    ...d,
    id: randomUUID(),
    contractorId: onboardingContractor.id,
    data: { ...d.data, answers: {}, executors: [{ userId: executorA.id, role: 'Executor' }] },
  };
  await call('/api/documents', executorDraft, 422);
  await call('/api/contractor-team', {
    action: 'review',
    unitId: unit.id,
    id: submitted.id,
    version: 1,
    decision: 'approved',
    reason: 'Documento e dados conferidos pela unidade',
    confirmed: true,
  });
  await call('/api/documents', executorDraft);
  await call('/api/admin', {
    action: 'contractor',
    unitId: unit.id,
    name: 'Outra contratada onboarding',
    cnpj: '55667788000199',
    details: { ...onboardingDetails, email: 'other-onboarding@test.example' },
  });
  const otherContact = (await call(`/api/workspace?unit=${unit.id}`)).people.find(
    (p: { email: string }) => p.email === 'other-onboarding@test.example',
  );
  await db.query('UPDATE users SET password_hash=$2,password_pending=false WHERE id=$1', [
    otherContact.id,
    hashPassword(password),
  ]);
  const secondIdentityPolicy = (await call(`/api/workspace?unit=${unit.id}`)).identityPolicy;
  await call('/api/identity-policy', {
    unitId: unit.id,
    enabled: false,
    version: secondIdentityPolicy.version,
  });
  await call('/api/auth', { email: 'other-onboarding@test.example', password });
  assert.deepEqual(
    (await call(`/api/contractor-team?unit=${unit.id}`)).people.map(
      (person: { id: string }) => person.id,
    ),
    [otherContact.id],
  );
  assert.equal(
    (
      await fetch(`${base}/api/executor-files/${executorA.files[0].id}`, {
        headers: { Cookie: cookie },
      })
    ).status,
    403,
  );
  await db.query('UPDATE companies SET approval_mfa_required=true WHERE id=$1', [company.id]);
  cookie = '';
  const challenge = await call('/api/auth', { email: onboardingDetails.email, password });
  assert.equal(challenge.mfaRequired, true);
  assert.equal(challenge.setupRequired, true);
  await call('/api/workspace', undefined, 401);
  const setup = await call('/api/auth', { email: onboardingDetails.email, password, enroll: true });
  assert.match(setup.qrCode, /^data:image\/png;base64,/);
  const loginCode = totp(setup.secret, Math.floor(Date.now() / 30000) - 1);
  await call('/api/auth', { email: onboardingDetails.email, password, code: loginCode });
  const mfaSession = cookie;
  assert.equal((await call(`/api/contractor-team?unit=${unit.id}`)).reviewer, false);
  const offTeam = await call('/api/contractor-team', {
    action: 'register',
    cpf: '12345678909',
    unitId: unit.id,
    name: 'Executor sem exigência',
    email: 'optional-doc@test.example',
    phone: '5511999999999',
  });
  assert.equal(offTeam.id, null);
  cookie = adminCookie;
  const disabledIdentityPolicy = (await call(`/api/workspace?unit=${unit.id}`)).identityPolicy;
  await call('/api/identity-policy', {
    unitId: unit.id,
    enabled: true,
    version: disabledIdentityPolicy.version,
  });
  cookie = mfaSession;
  const mfaReplacement = await call('/api/contractor-team', {
    action: 'resubmit',
    unitId: unit.id,
    userId: executorA.id,
    documentType: 'CNH',
    files: [identityFile],
  });
  assert.equal(
    (await call(`/api/contractor-team?unit=${unit.id}`)).people.find(
      (p: { id: string }) => p.id === executorA.id,
    ).status,
    'pending',
  );
  cookie = '';
  await call('/api/auth', { email: onboardingDetails.email, password, code: loginCode }, 403);
  await call('/api/auth', { email: 'matrix-gestor@example.com', password });
  const reviewerSetup = await call('/api/auth', {
    email: 'matrix-gestor@example.com',
    password,
    enroll: true,
  });
  await call('/api/auth', {
    email: 'matrix-gestor@example.com',
    password,
    code: totp(reviewerSetup.secret, Math.floor(Date.now() / 30000) - 1),
  });
  const lastStep = (
    await db.query<{ last_step: string }>('SELECT last_step FROM user_security WHERE user_id=$1', [
      matrixUsers.gestor,
    ])
  ).rows[0].last_step;
  await call('/api/contractor-team', {
    action: 'review',
    unitId: unit.id,
    id: mfaReplacement.id,
    version: 1,
    decision: 'approved',
    reason: 'Conferência feita usando a sessão MFA do gestor',
    confirmed: true,
  });
  assert.equal(
    (
      await db.query<{ last_step: string }>(
        'SELECT last_step FROM user_security WHERE user_id=$1',
        [matrixUsers.gestor],
      )
    ).rows[0].last_step,
    lastStep,
    'conferência não pede nem consome outro TOTP',
  );
  cookie = mfaSession;
  await db.query("UPDATE sessions SET last_seen_at=now()-interval '31 minutes' WHERE user_id=$1", [
    contactA.id,
  ]);
  await call('/api/workspace', undefined, 401);
  await call('/api/auth', { email: 'test@nexus.local', password });
  await call(`/api/workspace?unit=${unit.id}`);
  const lastPolicy = (await call(`/api/workspace?unit=${unit.id}`)).identityPolicy;
  await call('/api/identity-policy', {
    unitId: unit.id,
    enabled: false,
    version: lastPolicy.version,
  });
  const sessionDecision = await fetch(`${base}/api/documents/${matrixDocument!.id}/workflow`, {
    method: 'POST',
    headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve', version: matrixDocument!.version }),
  });
  assert.equal(sessionDecision.status, 200, await sessionDecision.text());
  await db.query('UPDATE companies SET approval_mfa_required=false WHERE id=$1', [company.id]);
  // Seed the bearer invitation because the HTTP harness intentionally has no public HTTPS origin.
  const registrationId = randomUUID(),
    registrationToken = randomBytes(32).toString('hex');
  await db.query(
    'INSERT INTO contractor_registrations(id,company_id,unit_id,email,created_by,token_hash,token_ciphertext) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      registrationId,
      company.id,
      unit.id,
      'registration-http@external.test',
      user.id,
      digest(registrationToken),
      encryptSecret(registrationToken, registrationId, 'contractor-registration-token'),
    ],
  );
  const reviewerCookie = cookie;
  await call('/api/contractor-registrations', {
    action: 'resend',
    unitId: unit.id,
    id: registrationId,
    version: 1,
    confirmed: true,
  });
  await call(
    '/api/contractor-registrations',
    { action: 'resend', unitId: unit.id, id: registrationId, version: 1, confirmed: true },
    409,
  );
  cookie = '';
  await call(`/api/contractor-registrations?unit=${unit.id}`, undefined, 401);
  await call('/api/contractor-registration', { action: 'read', token: 'invalid' }, 403);
  const registrationView = await call('/api/contractor-registration', {
    action: 'read',
    token: registrationToken,
  });
  assert.equal(registrationView.email, 'registration-http@external.test');
  const publicRegistration = {
    name: 'Contratada pelo link',
    cnpj: '91827364000122',
    details: {
      contactName: 'Gestora externa',
      email: registrationView.email,
      phone: '11999998888',
      cep: '01001000',
      street: 'Praça da Sé',
      number: '1',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    },
    people: [
      {
        name: 'Gestora externa',
        cpf: '93541134780',
        email: registrationView.email,
        phone: '11999998888',
        role: 'gestor',
      },
    ],
  };
  await call(
    '/api/contractor-registration',
    {
      action: 'submit',
      token: registrationToken,
      version: registrationView.version,
      data: { ...publicRegistration, people: [{ ...publicRegistration.people[0], role: 'admin' }] },
    },
    400,
  );
  await call('/api/contractor-registration', {
    action: 'submit',
    token: registrationToken,
    version: registrationView.version,
    data: publicRegistration,
    card: {
      mime: 'application/pdf',
      base64: Buffer.from('%PDF-1.7\nCartao CNPJ HTTP fixture').toString('base64'),
    },
  });
  assert.equal(
    (await db.query('SELECT 1 FROM users WHERE email=$1', [registrationView.email])).rows.length,
    0,
  );
  cookie = reviewerCookie;
  const pendingRegistrations = await call(`/api/contractor-registrations?unit=${unit.id}`);
  assert(
    pendingRegistrations.registrations.some(
      (entry: { id: string; status: string }) =>
        entry.id === registrationId && entry.status === 'submitted',
    ),
  );
  const registrationCardResponse = await fetch(
    `${base}/api/contractor-registrations/${registrationId}/card`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(registrationCardResponse.status, 200);
  assert(registrationCardResponse.headers.get('Cache-Control')?.includes('no-store'));
  assert((await registrationCardResponse.text()).startsWith('%PDF-'));
  await call('/api/contractor-registrations', {
    action: 'approve',
    unitId: unit.id,
    id: registrationId,
    version: registrationView.version + 1,
    reason: 'Empresa e colaboradora conferidas',
    confirmed: true,
  });
  const provisioned = (
    await db.query<{ role: string; password_pending: boolean }>(
      'SELECT m.role,u.password_pending FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1',
      [registrationView.email],
    )
  ).rows[0];
  assert.equal(provisioned.role, 'gestor');
  assert.equal(provisioned.password_pending, true);
  const publicApproved = await call('/api/contractor-registration', {
    action: 'read',
    token: registrationToken,
  });
  assert.equal(publicApproved.status, 'approved');
  assert.equal(publicApproved.data, null);
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
