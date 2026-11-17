import { readFile } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL em .env.local');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('nexus-schema'))");
  await db.query(await readFile(new URL('../db/001-initial.sql', import.meta.url), 'utf8'));
  const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (email && password) {
    if (password.length < 12)
      throw new Error('A senha inicial precisa de pelo menos 12 caracteres');
    const existing = await db.query('SELECT id FROM users WHERE platform_admin=true');
    if (!existing.rowCount) {
      const salt = randomBytes(16).toString('hex');
      const hash = salt + ':' + scryptSync(password, salt, 64).toString('hex');
      const {
        rows: [company],
      } = await db.query("INSERT INTO companies(name) VALUES('Ambev') RETURNING id");
      const {
        rows: [unit],
      } = await db.query(
        "INSERT INTO units(company_id,name,kind) VALUES($1,$2,'Fábrica') RETURNING id",
        [company.id, process.env.BOOTSTRAP_UNIT || 'Unidade piloto'],
      );
      const {
        rows: [user],
      } = await db.query(
        "INSERT INTO users(name,email,password_hash,platform_admin) VALUES('Administrador',$1,$2,true) RETURNING id",
        [email, hash],
      );
      await db.query("INSERT INTO memberships VALUES($1,$2,'admin')", [user.id, unit.id]);
      console.log('Empresa, unidade piloto e administrador criados.');
    } else console.log('Administrador já existe; credenciais preservadas.');
  }
  await db.query('COMMIT');
  console.log('Banco atualizado.');
} catch (e) {
  await db.query('ROLLBACK');
  throw e;
} finally {
  await db.end();
}
