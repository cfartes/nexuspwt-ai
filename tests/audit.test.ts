import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { auditFilters, companyAudit } from '../src/lib/audit';
import type { User } from '../src/lib/auth';

await test('auditoria exclusiva da empresa: isolamento, filtros, paginação e preservação após exclusão', async () => {
  const embedded = await PGlite.create();
  const files = (await readdir(new URL('../db/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files.filter((f) => !f.startsWith('015-')))
    await embedded.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const { rows: companies } = await embedded.query<{ id: string }>(
    "INSERT INTO companies(name) VALUES('A'),('B') RETURNING id",
  );
  const { rows: units } = await embedded.query<{ id: string }>(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'A1','CDD'),($1,'A2','CDD'),($2,'B1','CDD') RETURNING id",
    companies.map((c) => c.id),
  );
  const { rows: users } = await embedded.query<{ id: string }>(
    "INSERT INTO users(name,email,password_hash) VALUES('Dona A','owner@test.local','dummy'),('Local','local@test.local','dummy'),('Outro','other@test.local','dummy') RETURNING id",
  );
  const owner = { id: users[0].id, platform_admin: false } as User;
  const local = { id: users[1].id, platform_admin: false } as User;
  await embedded.query('INSERT INTO company_admins(company_id,user_id) VALUES($1,$2)', [
    companies[0].id,
    owner.id,
  ]);
  await embedded.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
    local.id,
    units[0].id,
  ]);
  // Existing events get only an explicit source-derived scope, never inferred from actor membership.
  await embedded.query(
    "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'acesso.atualizado',$2)",
    [
      owner.id,
      JSON.stringify({
        unitId: units[1].id,
        role: 'gestor',
        secret: 'do-not-return',
        cpf: 'do-not-return',
      }),
    ],
  );
  const migration = await readFile(new URL('../db/015-company-audit.sql', import.meta.url), 'utf8');
  await embedded.exec(migration);
  await embedded.exec(migration);
  const socket = new PGLiteSocketServer({
    db: embedded,
    host: '127.0.0.1',
    port: 55447,
    maxConnections: 5,
  });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55447/postgres',
    max: 1,
  });
  const denied = (error: unknown) => (error as { status: number }).status === 403;
  try {
    await pool.query(
      "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'cadastro.region',$2),($3,'resend.configurado','{}')",
      [users[2].id, JSON.stringify({ companyId: companies[1].id, name: 'Privado B' }), owner.id],
    );
    let result = await companyAudit(pool, owner, units[0].id, {});
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].unit_name, 'A2');
    assert.deepEqual(result.events[0].details, { role: 'gestor' });
    assert(!result.actors.some((a) => a.id === users[2].id));
    assert(!result.units.some((u) => u.id === units[2].id));
    assert(!result.actions.includes('resend.configurado'));
    await assert.rejects(companyAudit(pool, local, units[0].id, {}), denied);
    await assert.rejects(
      companyAudit(pool, { ...local, platform_admin: true }, units[0].id, {}),
      denied,
    );
    for (const role of ['gestor', 'seguranca_trabalho', 'aprovador', 'executante']) {
      await pool.query('UPDATE memberships SET role=$1 WHERE user_id=$2', [role, local.id]);
      await assert.rejects(companyAudit(pool, local, units[0].id, {}), denied);
    }
    await assert.rejects(companyAudit(pool, owner, units[2].id, {}), denied);
    await assert.rejects(companyAudit(pool, owner, units[0].id, { unit: units[2].id }), denied);
    assert.equal(
      (await companyAudit(pool, owner, units[0].id, { actor: users[2].id })).events.length,
      0,
    );
    assert(!auditFilters.safeParse({ from: '2026-11-20', to: '2026-11-19' }).success);
    assert(!auditFilters.safeParse({ before: '9223372036854775808' }).success);
    assert(!auditFilters.safeParse({ before: 'abc' }).success);
    assert(!auditFilters.safeParse({ companyId: companies[1].id }).success);
    await pool.query('DELETE FROM units WHERE id=$1', [units[1].id]);
    result = await companyAudit(pool, owner, units[0].id, { unit: units[1].id });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].unit_name, 'A2');
    assert(result.units.some((u) => u.id === units[1].id && u.name === 'A2'));
    await pool.query("UPDATE users SET name='Nome alterado' WHERE id=$1", [owner.id]);
    assert.equal(result.events[0].actor_name, 'Dona A');
    const {
      rows: [contractor],
    } = await pool.query(
      "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Contratada A','11111111111111') RETURNING id",
      [companies[0].id],
    );
    const {
      rows: [document],
    } = await pool.query(
      "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,data,created_by) VALUES($1,$2,$3,$4,'APR','Documento de teste','Local','2026-11-19','2026-11-20','{}',$5) RETURNING id",
      [randomUUID(), companies[0].id, units[0].id, contractor.id, owner.id],
    );
    await pool.query(
      "INSERT INTO audit_events(document_id,actor_id,action,details) VALUES($1,$2,'workflow.approve',$3)",
      [
        document.id,
        owner.id,
        JSON.stringify({ version: 1, verification: { cpf: 'hidden' }, password: 'hidden' }),
      ],
    );
    result = await companyAudit(pool, owner, units[0].id, { action: 'workflow.approve' });
    assert.equal(result.events[0].document_kind, 'APR');
    assert.equal(result.events[0].unit_name, 'A1');
    assert.deepEqual(result.events[0].details, { version: 1 });
    for (const occurred of [
      '2026-11-19T02:59:59Z',
      '2026-11-19T03:00:00Z',
      '2026-11-20T02:59:59Z',
      '2026-11-20T03:00:00Z',
    ])
      await pool.query(
        "INSERT INTO audit_events(actor_id,action,details,occurred_at) VALUES($1,'teste.periodo',$2,$3)",
        [owner.id, JSON.stringify({ companyId: companies[0].id }), occurred],
      );
    result = await companyAudit(pool, owner, units[0].id, {
      action: 'teste.periodo',
      from: '2026-11-19',
      to: '2026-11-19',
    });
    assert.equal(result.events.length, 2, 'período respeita o dia de Brasília');
    for (let i = 0; i < 53; i++)
      await pool.query(
        "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'teste.pagina',$2)",
        [owner.id, JSON.stringify({ companyId: companies[0].id })],
      );
    const first = await companyAudit(pool, owner, units[0].id, { action: 'teste.pagina' });
    assert.equal(first.events.length, 50);
    assert(first.nextCursor);
    const second = await companyAudit(pool, owner, units[0].id, {
      action: 'teste.pagina',
      before: first.nextCursor,
    });
    assert.equal(second.events.length, 3);
    assert.equal(second.nextCursor, null);
    assert(!second.events.some((e) => first.events.some((p) => e.id === p.id)));
    await pool.query('UPDATE company_admins SET active=false WHERE user_id=$1', [owner.id]);
    await assert.rejects(companyAudit(pool, owner, units[0].id, {}), denied);
  } finally {
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
