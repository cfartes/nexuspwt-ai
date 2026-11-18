import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { assertUnitCapacity, setUnitLimit } from '../src/lib/unit-limit';
import type { User } from '../src/lib/auth';
test('limite por empresa: migração preserva unidades e configuração, permissão, versão e bloqueio na criação', async () => {
  const db = await PGlite.create();
  await db.exec(await readFile(new URL('../db/001-initial.sql', import.meta.url), 'utf8'));
  const {
    rows: [company],
  } = await db.query<{ id: string }>(
    "INSERT INTO companies(name) VALUES('Existente') RETURNING id",
  );
  await db.query("INSERT INTO units(company_id,name,kind) VALUES($1,'A','CDD'),($1,'B','CDD')", [
    company.id,
  ]);
  const sql = await readFile(new URL('../db/010-company-unit-limit.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  const get = async () =>
    (
      await db.query<{ unit_limit: number; unit_limit_version: number }>(
        'SELECT unit_limit,unit_limit_version FROM companies WHERE id=$1',
        [company.id],
      )
    ).rows[0];
  assert.equal((await get()).unit_limit, 2);
  const {
    rows: [user],
  } = await db.query<{ id: string }>(
    "INSERT INTO users(name,email,password_hash) VALUES('Superadmin','admin@example.com','hash') RETURNING id",
  );
  const root: User = {
    id: user.id,
    name: 'Admin',
    email: 'admin@example.com',
    platform_admin: true,
    session_expires_at: '',
  };
  const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55445, maxConnections: 5 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55445/postgres',
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
  const status = (value: number) => (e: unknown) => (e as { status?: number }).status === value;
  try {
    await assert.rejects(
      tx((c) => assertUnitCapacity(c, company.id)),
      status(409),
    );
    await assert.rejects(
      tx((c) => setUnitLimit(c, { ...root, platform_admin: false }, company.id, 3, 1)),
      status(403),
    );
    await assert.rejects(
      tx((c) => setUnitLimit(c, root, company.id, 1, 1)),
      status(409),
    );
    await tx((c) => setUnitLimit(c, root, company.id, 3, 1));
    await db.exec(sql);
    assert.equal(
      (await get()).unit_limit,
      3,
      'Reexecutar migrações não redefine o limite contratado',
    );
    await assert.rejects(
      tx((c) => setUnitLimit(c, root, company.id, 5, 1)),
      status(409),
    );
    await tx(async (c) => {
      await assertUnitCapacity(c, company.id);
      await c.query("INSERT INTO units(company_id,name,kind) VALUES($1,'C','CDD')", [company.id]);
    });
    await assert.rejects(
      tx(async (c) => {
        await assertUnitCapacity(c, company.id);
        await c.query("INSERT INTO units(company_id,name,kind) VALUES($1,'D','CDD')", [company.id]);
      }),
      status(409),
    );
    assert.equal(
      (await db.query('SELECT 1 FROM units WHERE company_id=$1', [company.id])).rows.length,
      3,
    );
    const {
      rows: [other],
    } = await db.query<{ id: string }>("INSERT INTO companies(name) VALUES('MVP') RETURNING id");
    assert.equal(
      (
        await db.query<{ unit_limit: number }>('SELECT unit_limit FROM companies WHERE id=$1', [
          other.id,
        ])
      ).rows[0].unit_limit,
      1,
    );
    await tx((c) => assertUnitCapacity(c, other.id));
    await db.query("DELETE FROM units WHERE company_id=$1 AND name='C'", [company.id]);
    await tx((c) => assertUnitCapacity(c, company.id));
    assert.equal(
      (await db.query("SELECT 1 FROM audit_events WHERE action='empresa.limite_unidades_alterado'"))
        .rows.length,
      1,
    );
  } finally {
    await pool.end();
    await socket.stop();
    await db.close();
  }
});
