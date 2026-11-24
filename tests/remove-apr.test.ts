import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { removeDocument } from '../src/lib/remove-document';
import type { User } from '../src/lib/auth';
await test('remoção: APR exige admin e nenhuma PT; PT em rascunho permite autor/admin e demais estados exigem Superadmin', async () => {
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
  await db.query("INSERT INTO document_versions(document_id,version,snapshot) VALUES($1,1,'{}')", [
    pt,
  ]);
  await db.query(
    "INSERT INTO approvals(document_id,version,profile,user_id) VALUES($1,1,'Perfil PT',$2)",
    [pt, rootId],
  );
  await db.query('INSERT INTO notification_outbox(document_id,version,user_id) VALUES($1,1,$2)', [
    pt,
    rootId,
  ]);
  await db.query(
    "INSERT INTO photos(id,document_id,actor_id,caption,captured_at,latitude,longitude,accuracy,mime,sha256,content) VALUES(gen_random_uuid(),$1,$2,'Evidência',now(),0,0,1,'image/png','hash',decode('1234','hex'))",
    [pt, rootId],
  );
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
      const kind = (await c.query('SELECT kind FROM documents WHERE id=$1', [id])).rows[0].kind;
      await removeDocument(c, who, id, version, kind);
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
    await assert.rejects(remove(root, pt, 99), status(409));
    const adminDraft = crypto.randomUUID();
    await db.query(
      'INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version) SELECT $1,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,$2,apr_id,apr_version FROM documents WHERE id=$3',
      [adminDraft, manager.id, pt],
    );
    await remove(root, adminDraft);
    const authorId = await insert(
      "INSERT INTO users(name,email,password_hash) VALUES('Autor','autor@test.local','hash') RETURNING id",
    );
    await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'executante')", [
      authorId,
      unit,
    ]);
    const author = { ...root, id: authorId };
    await assert.rejects(remove(author, pt), status(403));
    const authorDraft = crypto.randomUUID();
    await db.query(
      'INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version) SELECT $1,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,$2,apr_id,apr_version FROM documents WHERE id=$3',
      [authorDraft, authorId, pt],
    );
    await remove(author, authorDraft);
    const contractorAdminId = await insert(
      "INSERT INTO users(name,email,password_hash) VALUES('Gestor contratada','gestor-contratada@test.local','hash') RETURNING id",
    );
    await db.query(
      'INSERT INTO contractor_units(company_id,contractor_id,unit_id) VALUES($1,$2,$3)',
      [company, contractor, unit],
    );
    await db.query(
      "INSERT INTO memberships(user_id,unit_id,role,contractor_id) VALUES($1,$2,'gestor',$3)",
      [contractorAdminId, unit, contractor],
    );
    const contractorAdmin = { ...root, id: contractorAdminId };
    const contractorDraft = crypto.randomUUID();
    await db.query(
      'INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version) SELECT $1,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version FROM documents WHERE id=$2',
      [contractorDraft, pt],
    );
    await remove(contractorAdmin, contractorDraft);
    const otherContractor = await insert(
      "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Outra contratada','98765432000100') RETURNING id",
      [company],
    );
    const otherContractorDraft = crypto.randomUUID();
    await db.query(
      'INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version) SELECT $1,company_id,unit_id,$2,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version FROM documents WHERE id=$3',
      [otherContractorDraft, otherContractor, pt],
    );
    await assert.rejects(remove(contractorAdmin, otherContractorDraft), status(403));
    await assert.rejects(remove(manager, pt, 99), status(409));
    await db.query('UPDATE memberships SET active=false WHERE user_id=$1', [manager.id]);
    await assert.rejects(remove(manager, pt), status(403));
    await db.query('UPDATE memberships SET active=true WHERE user_id=$1', [manager.id]);
    await remove(manager, pt);
    const removedPt = (
      await db.query<{ removed_by: string; removed_at: string }>(
        'SELECT removed_by,removed_at FROM documents WHERE id=$1',
        [pt],
      )
    ).rows[0];
    assert.equal(removedPt.removed_by, manager.id);
    assert(removedPt.removed_at);
    for (const [table, column] of [
      ['document_versions', 'document_id'],
      ['approvals', 'document_id'],
      ['photos', 'document_id'],
    ] as const)
      assert.equal(
        (await db.query(`SELECT 1 FROM ${table} WHERE ${column}=$1`, [pt])).rows.length,
        1,
      );
    assert.equal(
      (
        await db.query<{ status: string }>(
          'SELECT status FROM notification_outbox WHERE document_id=$1',
          [pt],
        )
      ).rows[0].status,
      'cancelled',
    );
    assert.equal(
      (await db.query('SELECT 1 FROM documents WHERE id=$1 AND removed_at IS NULL', [linked])).rows
        .length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT 1 FROM audit_events WHERE document_id=$1 AND actor_id=$2 AND action='pt.removida'",
          [pt, manager.id],
        )
      ).rows.length,
      1,
    );
    await assert.rejects(remove(manager, pt), status(409));
    for (const documentStatus of ['em_aprovacao', 'aprovado', 'encerrado']) {
      const otherPt = crypto.randomUUID();
      await db.query(
        'INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version,status) SELECT $1,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,apr_id,apr_version,$2 FROM documents WHERE id=$3',
        [otherPt, documentStatus, pt],
      );
      await assert.rejects(remove(root, otherPt), status(403));
      await remove(manager, otherPt);
      assert(
        (
          await db.query<{ removed_at: string }>('SELECT removed_at FROM documents WHERE id=$1', [
            otherPt,
          ])
        ).rows[0].removed_at,
      );
    }
    await assert.rejects(remove(root, linked), status(409));
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
