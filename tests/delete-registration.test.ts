import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { deleteRegistration, type RegistrationKind } from '../src/lib/delete-registration';
import { createInvitation } from '../src/lib/invitations';
import type { User } from '../src/lib/auth';

test('exclusão: seis cadastros, isolamento, vínculos compartilhados, versões e preservação do histórico', async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'f'.repeat(64);
  const db = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const insert = async (sql: string, args: unknown[] = []) =>
    (await db.query<{ id: string }>(sql, args)).rows[0].id;
  const company = await insert("INSERT INTO companies(name) VALUES('Empresa A') RETURNING id");
  const foreignCompany = await insert(
    "INSERT INTO companies(name) VALUES('Empresa B') RETURNING id",
  );
  const unit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Principal','CDD') RETURNING id",
    [company],
  );
  const emptyUnit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Vazia','CDD') RETURNING id",
    [company],
  );
  const foreignUnit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Outra empresa','CDD') RETURNING id",
    [foreignCompany],
  );
  const user = async (name: string) =>
    insert("INSERT INTO users(name,email,password_hash) VALUES($1,$2,'hash') RETURNING id", [
      name,
      name + '@example.com',
    ]);
  const rootId = await user('root'),
    localId = await user('local'),
    viewerId = await user('viewer');
  await db.query('UPDATE users SET platform_admin=true WHERE id=$1', [rootId]);
  const actor = (id: string, platform_admin = false): User => ({
    id,
    name: id,
    email: id + '@example.com',
    platform_admin,
    session_expires_at: '',
  });
  const root = actor(rootId, true),
    local = actor(localId),
    viewer = actor(viewerId);
  for (const id of [unit, emptyUnit, foreignUnit])
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
      rootId,
      id,
    ]);
  await db.query(
    "INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin'),($3,$2,'executante')",
    [localId, unit, viewerId],
  );
  const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55443, maxConnections: 5 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55443/postgres',
    max: 1,
  });
  const tx = async <T>(fn: (c: pg.PoolClient) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  const remove = (
    kind: RegistrationKind,
    id: string,
    version?: number,
    who = root,
    unitId = unit,
  ) => tx((c) => deleteRegistration(c, who, { kind, id, version, unitId }));
  const status = (expected: number) => (error: unknown) =>
    (error as { status?: number }).status === expected;
  const count = async (table: string, id: string) =>
    Number(
      (
        await db.query<{ total: number }>(`SELECT count(*)::int total FROM ${table} WHERE id=$1`, [
          id,
        ])
      ).rows[0].total,
    );
  try {
    const region = await insert(
      "INSERT INTO regions(company_id,name) VALUES($1,'Região') RETURNING id",
      [company],
    );
    const foreignRegion = await insert(
      "INSERT INTO regions(company_id,name) VALUES($1,'Outra região') RETURNING id",
      [foreignCompany],
    );
    await assert.rejects(remove('region', region, undefined, viewer), status(403));
    await assert.rejects(remove('region', foreignRegion), status(404));
    await assert.rejects(remove('unit', foreignUnit), status(404));
    await assert.rejects(remove('company', foreignCompany, undefined, local), status(403));
    await db.query('UPDATE units SET region_id=$1 WHERE id=$2', [region, emptyUnit]);
    await assert.rejects(remove('region', region), status(409));
    await assert.rejects(remove('unit', unit, undefined, local), status(409));
    await remove('unit', emptyUnit);
    assert.equal(await count('units', emptyUnit), 0);
    await remove('region', region);
    assert.equal(await count('regions', region), 0);
    await assert.rejects(remove('company', foreignCompany), status(409));
    await remove('region', foreignRegion, undefined, root, foreignUnit);
    await remove('unit', foreignUnit, undefined, root, foreignUnit);
    await remove('company', foreignCompany);
    assert.equal(await count('companies', foreignCompany), 0);

    const shareUnit = await insert(
      "INSERT INTO units(company_id,name,kind) VALUES($1,'Compartilhada','CDD') RETURNING id",
      [company],
    );
    const contractor = await insert(
      "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Contratada','12345678000195') RETURNING id",
      [company],
    );
    await db.query('INSERT INTO contractor_units VALUES($1,$2,$3),($1,$2,$4)', [
      company,
      contractor,
      unit,
      shareUnit,
    ]);
    await assert.rejects(remove('contractor', contractor, 99), status(409));
    await remove('contractor', contractor, 1);
    assert.equal(
      await count('contractors', contractor),
      1,
      'Mantém cadastro usado em outra unidade',
    );
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
      rootId,
      shareUnit,
    ]);
    await remove('contractor', contractor, 1, root, shareUnit);
    assert.equal(await count('contractors', contractor), 0);

    const currentContractor = await insert(
      "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Atual','11111111111111') RETURNING id",
      [company],
    );
    const oldContractor = await insert(
      "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Histórica','22222222222222') RETURNING id",
      [company],
    );
    await db.query('INSERT INTO contractor_units VALUES($1,$2,$3),($1,$4,$3)', [
      company,
      currentContractor,
      unit,
      oldContractor,
    ]);
    const document = crypto.randomUUID();
    await db.query(
      "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,'APR','Serviço','Local','2026-11-18','2026-11-19',$5)",
      [document, company, unit, currentContractor, rootId],
    );
    await db.query('INSERT INTO document_versions(document_id,version,snapshot) VALUES($1,1,$2)', [
      document,
      JSON.stringify({ contractor_id: oldContractor }),
    ]);
    await assert.rejects(remove('contractor', currentContractor, 1), status(409));
    await assert.rejects(remove('contractor', oldContractor, 1), status(409));
    assert.equal(await count('contractors', oldContractor), 1);
    await assert.rejects(remove('unit', unit), status(409));
    const historicalUnit = await insert(
      "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade com histórico','CDD') RETURNING id",
      [company],
    );
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
      rootId,
      historicalUnit,
    ]);
    await db.query('INSERT INTO contractor_units VALUES($1,$2,$3)', [
      company,
      currentContractor,
      historicalUnit,
    ]);
    const historicalDocument = crypto.randomUUID();
    await db.query(
      "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,'APR','Histórico','Local','2026-11-18','2026-11-19',$5)",
      [historicalDocument, company, historicalUnit, currentContractor, rootId],
    );
    await assert.rejects(remove('unit', historicalUnit), status(409));
    assert.equal(
      (await db.query('SELECT 1 FROM memberships WHERE unit_id=$1', [historicalUnit])).rows.length,
      1,
      'Falha não remove o acesso ao histórico',
    );
    assert.equal(
      (await db.query('SELECT 1 FROM contractor_units WHERE unit_id=$1', [historicalUnit])).rows
        .length,
      1,
    );
    assert.equal(await count('documents', historicalDocument), 1);

    const unused = await user('unused');
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'aprovador')", [
      unused,
      unit,
    ]);
    await db.query('UPDATE users SET password_pending=true WHERE id=$1', [unused]);
    await tx((c) => createInvitation(c, rootId, unused, unit));
    await assert.rejects(remove('user', unused, 99), status(409));
    await remove('user', unused, 1);
    assert.equal(await count('users', unused), 0);
    assert.equal(
      (await db.query('SELECT 1 FROM user_invitations WHERE user_id=$1', [unused])).rows.length,
      0,
    );
    await assert.rejects(remove('user', rootId, 1), status(409));
    await assert.rejects(remove('user', rootId, 1, local), status(403));
    const used = await user('used');
    const listed = await user('listed');
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'executante')", [
      listed,
      unit,
    ]);
    const executors = JSON.stringify({ executors: [{ userId: listed }] });
    await db.query('UPDATE documents SET data=$2 WHERE id=$1', [document, executors]);
    await assert.rejects(remove('user', listed, 1), status(409));
    await db.query("UPDATE documents SET data='{}' WHERE id=$1", [document]);
    await db.query(
      "UPDATE document_versions SET snapshot=snapshot || jsonb_build_object('data',$2::jsonb) WHERE document_id=$1",
      [document, executors],
    );
    await assert.rejects(remove('user', listed, 1), status(409));
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'executante')", [
      used,
      unit,
    ]);
    await db.query("INSERT INTO audit_events(actor_id,action) VALUES($1,'ação_histórica')", [used]);
    await assert.rejects(remove('user', used, 1), status(409));
    assert.equal(
      (
        await db.query<{ active: boolean; version: number }>(
          'SELECT active,version FROM memberships WHERE user_id=$1 AND unit_id=$2',
          [used, unit],
        )
      ).rows[0].active,
      true,
      'Falha desfaz a remoção do acesso',
    );
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'executante')", [
      used,
      shareUnit,
    ]);
    await remove('user', used, 1);
    assert.equal(await count('users', used), 1, 'Outras unidades e histórico preservados');
    assert.equal(
      (
        await db.query('SELECT 1 FROM memberships WHERE user_id=$1 AND unit_id=$2', [
          used,
          shareUnit,
        ])
      ).rows.length,
      1,
    );
    await assert.rejects(remove('account', used, undefined, local), status(403));
    await assert.rejects(remove('account', rootId), status(409));
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('session-used',$1,now()+interval '1 hour')",
      [used],
    );
    await remove('account', used);
    assert.equal(
      (await db.query<{ active: boolean }>('SELECT active FROM users WHERE id=$1', [used])).rows[0]
        .active,
      false,
    );
    assert.equal(
      (await db.query('SELECT 1 FROM sessions WHERE user_id=$1', [used])).rows.length,
      0,
    );
    assert.equal(
      (await db.query('SELECT 1 FROM memberships WHERE user_id=$1 AND active', [used])).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query("SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='ação_histórica'", [
          used,
        ])
      ).rows.length,
      1,
      'Exclusão global preserva autoria',
    );
    const lastAdmin = await user('lastAdmin');
    const soleUnit = await insert(
      "INSERT INTO units(company_id,name,kind) VALUES($1,'Único admin','CDD') RETURNING id",
      [company],
    );
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
      lastAdmin,
      soleUnit,
    ]);
    await assert.rejects(remove('account', lastAdmin), status(409));

    const assignment = await insert(
      "INSERT INTO approvers(company_id,unit_id,user_id,kind,profile) VALUES($1,$2,$3,'APR','Perfil teste') RETURNING id",
      [company, unit, rootId],
    );
    await db.query(
      "INSERT INTO approvals(document_id,version,profile,user_id,decision) VALUES($1,1,'Perfil teste',$2,'aprovado')",
      [document, rootId],
    );
    await assert.rejects(remove('approver', assignment, 2), status(409));
    await remove('approver', assignment, 1);
    assert.equal(
      (
        await db.query("SELECT 1 FROM approvals WHERE document_id=$1 AND decision='aprovado'", [
          document,
        ])
      ).rows.length,
      1,
    );
    const regional = await insert(
      "INSERT INTO regions(company_id,name) VALUES($1,'Regional') RETURNING id",
      [company],
    );
    await db.query('UPDATE units SET region_id=$1 WHERE id=$2', [regional, unit]);
    const regionalAssignment = await insert(
      "INSERT INTO approvers(company_id,region_id,user_id,kind,profile) VALUES($1,$2,$3,'APR','Regional teste') RETURNING id",
      [company, regional, rootId],
    );
    await assert.rejects(remove('approver', regionalAssignment, 1, local), status(403));
    await remove('approver', regionalAssignment, 1);
    assert.equal(
      (await db.query('SELECT 1 FROM memberships WHERE user_id=$1 AND unit_id=$2', [rootId, unit]))
        .rows.length,
      1,
    );
    assert(
      (
        await db.query<{ total: number }>(
          "SELECT count(*)::int total FROM audit_events WHERE action='cadastro.excluido'",
        )
      ).rows[0].total >= 8,
    );
  } finally {
    await pool.end();
    await socket.stop();
    await db.close();
  }
});
