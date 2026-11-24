import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { onlineMigrations } from '../scripts/online-migrations.mjs';

await test('deploy online: adota schema existente, não reaplica SQL e recusa mudanças não aprovadas', async () => {
  const database = new PGlite();
  const socket = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 55450 });
  await socket.start();
  const client = new pg.Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55450/postgres',
  });
  await client.connect();
  const directory = new URL('../db/', import.meta.url);
  const temporary = await mkdtemp(join(tmpdir(), 'ptw-migrations-'));
  try {
    for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort())
      await client.query(await readFile(new URL(name, directory), 'utf8'));
    await client.query(
      "INSERT INTO companies(name,unit_limit,identity_upload_enabled) VALUES('Preservada',133,true)",
    );
    await onlineMigrations(client, directory);
    assert.equal(
      (await client.query('SELECT count(*)::int total FROM deployment_migrations')).rows[0].total,
      19,
    );
    await onlineMigrations(client, directory);
    assert.deepEqual(
      (await client.query('SELECT name,unit_limit,identity_upload_enabled FROM companies')).rows,
      [{ name: 'Preservada', unit_limit: 133, identity_upload_enabled: true }],
    );
    await client.query(
      "UPDATE deployment_migrations SET checksum='alterado' WHERE name='001-initial.sql'",
    );
    await assert.rejects(onlineMigrations(client, directory), /Histórico/);
    await writeFile(join(temporary, 'online-migrations.json'), '{}');
    await writeFile(join(temporary, '019-unsafe.sql'), 'DROP TABLE companies;');
    await assert.rejects(onlineMigrations(client, pathToFileURL(temporary + '/')), /sem aprovação/);
    assert.equal(
      (await client.query('SELECT count(*)::int total FROM companies')).rows[0].total,
      1,
    );
    const approved = JSON.parse(
      await readFile(new URL('online-migrations.json', directory), 'utf8'),
    );
    await client.query('UPDATE deployment_migrations SET checksum=$1 WHERE name=$2', [
      approved['001-initial.sql'],
      '001-initial.sql',
    ]);
    await rm(join(temporary, '019-unsafe.sql'));
    for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')))
      await writeFile(join(temporary, name), await readFile(new URL(name, directory)));
    const failingSql =
      "INSERT INTO companies(name) VALUES('Rollback'); SELECT missing_column FROM companies;";
    approved['019-failing.sql'] = createHash('sha256').update(failingSql).digest('hex');
    await writeFile(join(temporary, 'online-migrations.json'), JSON.stringify(approved));
    await writeFile(join(temporary, '019-failing.sql'), failingSql);
    await assert.rejects(
      onlineMigrations(client, pathToFileURL(temporary + '/')),
      /missing_column/,
    );
    assert.equal(
      (await client.query("SELECT count(*)::int total FROM companies WHERE name='Rollback'"))
        .rows[0].total,
      0,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int total FROM deployment_migrations WHERE name='019-failing.sql'",
        )
      ).rows[0].total,
      0,
    );
  } finally {
    await client.end();
    await socket.stop();
    await database.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
