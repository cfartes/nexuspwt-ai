import { readFile, readdir } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';
import { provisionRuntimeRoles } from './runtime-roles.mjs';
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL em .env.local');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('nexus-schema'))");
  const migrations = new URL('../db/', import.meta.url);
  for (const file of (await readdir(migrations)).filter((name) => /^\d+.*\.sql$/.test(name)).sort())
    await db.query(await readFile(new URL(file, migrations), 'utf8'));
  const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (email && password) {
    const existing = await db.query('SELECT id FROM users WHERE platform_admin=true');
    if (!existing.rowCount) {
      if (
        password.length < 8 ||
        password.length > 256 ||
        !/\p{Lu}/u.test(password) ||
        !/[^\p{L}\p{N}\s]/u.test(password)
      )
        throw new Error(
          'A senha inicial precisa de 8 a 256 caracteres, uma letra maiúscula e um caractere especial',
        );
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
      await db.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
        user.id,
        unit.id,
      ]);
      console.log('Empresa, unidade piloto e administrador criados.');
    } else console.log('Administrador já existe; credenciais preservadas.');
  }
  await db.query('COMMIT');
  await provisionRuntimeRoles(db);
  console.log('Banco atualizado.');
} catch (e) {
  await db.query('ROLLBACK');
  throw e;
} finally {
  await db.end();
}
