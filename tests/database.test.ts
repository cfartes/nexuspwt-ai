import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('schema PostgreSQL: isolamento dos vínculos, integridade da revisão e foto', async () => {
  const db = await PGlite.create();
  try {
    const sql = await readFile(new URL('../db/001-initial.sql', import.meta.url), 'utf8');
    const integrationsSql = await readFile(
      new URL('../db/002-integrations.sql', import.meta.url),
      'utf8',
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(integrationsSql);
    await db.exec(integrationsSql);
    const { rows: companies } = await db.query<{ id: string }>(
      "INSERT INTO companies(name) VALUES('Empresa A'),('Empresa B') RETURNING id",
    );
    const {
      rows: [unit],
    } = await db.query<{ id: string }>(
      "INSERT INTO units(company_id,name,kind) VALUES($1,'Piloto','CDD') RETURNING id",
      [companies[0].id],
    );
    const {
      rows: [other],
    } = await db.query<{ id: string }>(
      "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Terceirizada B','22222222222222') RETURNING id",
      [companies[1].id],
    );
    await assert.rejects(
      db.query('INSERT INTO contractor_units VALUES($1,$2,$3)', [
        companies[0].id,
        other.id,
        unit.id,
      ]),
      /foreign key/,
    );
    const {
      rows: [contractor],
    } = await db.query<{ id: string }>(
      "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Terceirizada A','11111111111111') RETURNING id",
      [companies[0].id],
    );
    await db.query('INSERT INTO contractor_units VALUES($1,$2,$3)', [
      companies[0].id,
      contractor.id,
      unit.id,
    ]);
    const {
      rows: [user],
    } = await db.query<{ id: string }>(
      "INSERT INTO users(name,email,password_hash) VALUES('Ana','ana@example.com','hash') RETURNING id",
    );
    const id = crypto.randomUUID();
    const insert =
      "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,'APR','APR teste','Local','2026-11-17','2026-11-18',$5)";
    await db.query(insert, [id, companies[0].id, unit.id, contractor.id, user.id]);
    await assert.rejects(
      db.query(
        "INSERT INTO approvals(document_id,version,profile,user_id) VALUES($1,1,'Segurança',$2)",
        [id, user.id],
      ),
      /foreign key/,
    );
    await db.query("INSERT INTO document_versions VALUES($1,1,'{}',now())", [id]);
    await db.query(
      "INSERT INTO approvals(document_id,version,profile,user_id) VALUES($1,1,'Segurança',$2)",
      [id, user.id],
    );
    await assert.rejects(
      db.query(
        "INSERT INTO approvals(document_id,version,profile,user_id) VALUES($1,1,'Segurança',$2)",
        [id, user.id],
      ),
      /unique/,
    );
    await assert.rejects(
      db.query("UPDATE documents SET ends_at='2026-11-16' WHERE id=$1", [id]),
      /check constraint/,
    );
  } finally {
    await db.close();
  }
});
