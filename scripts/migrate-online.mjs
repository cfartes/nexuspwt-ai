import pg from 'pg';
import { onlineMigrations } from './online-migrations.mjs';
import { provisionRuntimeRoles } from './runtime-roles.mjs';

if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const {
    rows: [schema],
  } = await client.query(
    "SELECT to_regclass('public.companies') IS NOT NULL AND to_regclass('public.users') IS NOT NULL ready",
  );
  if (!schema.ready) throw new Error('Atualização exige banco existente.');
  await onlineMigrations(client, new URL('../db/', import.meta.url));
  await provisionRuntimeRoles(client);
  console.log('Migrações online concluídas; nenhum bootstrap de usuário foi executado.');
} catch {
  console.error(
    'Migração online interrompida. Confira aprovação/checksums e bloqueios no PostgreSQL. App anterior preservado.',
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
