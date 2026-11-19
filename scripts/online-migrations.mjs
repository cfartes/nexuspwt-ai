import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function onlineMigrations(client, directory) {
  const approved = JSON.parse(await readFile(new URL('online-migrations.json', directory), 'utf8'));
  const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const migrations = await Promise.all(
    files.map(async (name) => {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex');
      if (approved[name] !== checksum)
        throw new Error(`Migração sem aprovação para deploy online: ${name}`);
      return { name, sql, checksum };
    }),
  );
  await client.query("SELECT pg_advisory_lock(hashtext('nexus-schema'))");
  try {
    await client.query("SET lock_timeout='1s'");
    await client.query("SET statement_timeout='10s'");
    await client.query(
      'CREATE TABLE IF NOT EXISTS deployment_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = (await client.query('SELECT name,checksum FROM deployment_migrations')).rows;
    for (const row of applied) {
      if (
        !migrations.some(
          (migration) => migration.name === row.name && migration.checksum === row.checksum,
        )
      )
        throw new Error(`Histórico de migração divergente: ${row.name}`);
    }
    for (const migration of migrations) {
      if (applied.some((row) => row.name === migration.name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO deployment_migrations(name,checksum) VALUES($1,$2)', [
          migration.name,
          migration.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('RESET lock_timeout');
    await client.query('RESET statement_timeout');
    await client.query("SELECT pg_advisory_unlock(hashtext('nexus-schema'))");
  }
}
