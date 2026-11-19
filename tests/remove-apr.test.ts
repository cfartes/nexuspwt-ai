import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { removeApr } from '../src/lib/remove-apr';
import type { User } from '../src/lib/auth';
await test('APR: somente admin da unidade, bloqueio por qualquer PT e remoção com histórico preservado', async () => {
  const db = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const insert = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: string }>(sql, params)).rows[0].id;
  const company = await insert("INSERT INTO companies(name) VALUES('Empresa') RETURNING id");
  const unit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade','CDD') RETURNING id",
    [company],
  );
  const rootId = await insert(
    "INSERT INTO users(name,email,password_hash) VALUES('Admin','admin@example.com','hash') RETURNING id",
  );
  const managerId = await insert(
    "INSERT INTO users(name,email,password_hash,platform_admin) VALUES('Gestor','gestor@example.com','hash',true) RETURNING id",
  );
  await db.query(
    "INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin'),($3,$2,'gestor')",
    [rootId, unit, managerId],
  );
  const root: User = {
    id: rootId,
    name: 'Admin',
    email: 'admin@example.com',
    platform_admin: false,
    session_expires_at: '',
  };
  const manager: User = { ...root, id: managerId, platform_admin: true };
  const contractor = await insert(
    "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Contratada','12345678000195') RETURNING id",
    [company],
  );
  const apr = crypto.randomUUID(),
    linked = crypto.randomUUID(),
    pt = crypto.randomUUID();
  for (const id of [apr, linked])
    await db.query(
      "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,status) VALUES($1,$2,$3,$4,'APR','Serviço','Local','2026-11-18','2026-11-19',$5,'em_aprovacao')",
      [id, company, unit, contractor, rootId],
    );
  await db.query(
    "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version) VALUES($1,$2,$3,$4,'PT','Turno','Local','2026-11-18','2026-11-19',$5,$6,1)",
    [pt, company, unit, contractor, rootId, linked],
  );
  await db.query("INSERT INTO document_versions(document_id,version,snapshot) VALUES($1,1,'{}')", [
    apr,
  ]);
  await db.query(
    "INSERT INTO approvals(document_id,version,profile,user_id) VALUES($1,1,'Perfil',$2)",
    [apr, rootId],
  );
  await db.query('INSERT INTO notification_outbox(document_id,version,user_id) VALUES($1,1,$2)', [
    apr,
    rootId,
  ]);
  const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55444, maxConnections: 5 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55444/postgres',
    max: 1,
  });
  const remove = async (who: User, id: string, version = 1) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await removeApr(c, who, id, version);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  const status = (value: number) => (e: unknown) => (e as { status?: number }).status === value;
  try {
    await assert.rejects(remove(manager, apr), status(403));
    await assert.rejects(remove(root, linked), status(409));
    await assert.rejects(remove(root, pt), status(400));
    await assert.rejects(remove(root, apr, 99), status(409));
    await remove(root, apr);
    const saved = (
      await db.query<{ removed_at: string; removed_by: string }>(
        'SELECT removed_at,removed_by FROM documents WHERE id=$1',
        [apr],
      )
    ).rows[0];
    assert(saved.removed_at);
    assert.equal(saved.removed_by, rootId);
    assert.equal(
      (await db.query('SELECT 1 FROM document_versions WHERE document_id=$1', [apr])).rows.length,
      1,
    );
    assert.equal(
      (await db.query('SELECT 1 FROM approvals WHERE document_id=$1', [apr])).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM notification_outbox WHERE document_id=$1',
          [apr],
        )
      ).rows[0].status,
      'cancelled',
    );
    assert.equal(
      (
        await db.query(
          "SELECT 1 FROM audit_events WHERE document_id=$1 AND action='apr.removida'",
          [apr],
        )
      ).rows.length,
      1,
    );
    await assert.rejects(remove(root, apr), status(409));
  } finally {
    await pool.end();
    await socket.stop();
    await db.close();
  }
});
