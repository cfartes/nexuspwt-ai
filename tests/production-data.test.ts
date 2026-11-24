import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { cleanProductionData, seedValidationData } from '../scripts/production-data';
import { hashPassword, verifyPassword } from '../src/lib/security';
import { decryptSecret } from '../src/lib/integrations';
import { validCpf } from '../src/lib/approval-security';

await test('manutenção: carga sem documentos/envios; limpeza preserva Superadmin, segredos e migrações, sem CASCADE cego', async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'e'.repeat(64);
  const embedded = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort())
    await embedded.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const {
    rows: [root],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO users(name,email,password_hash,platform_admin) VALUES('Nexus','root@prod.test',$1,true) RETURNING id",
    [hashPassword('Root!123')],
  );
  await embedded.query(
    "INSERT INTO user_security(user_id,secret_ciphertext,last_step) VALUES($1,'root-factor',123)",
    [root.id],
  );
  await embedded.query(
    "INSERT INTO email_gateway(sender,secret_ciphertext,updated_by) VALUES('sender@prod.test','resend-secret',$1)",
    [root.id],
  );
  await embedded.query(
    "INSERT INTO whatsapp_gateway(base_url,secret_ciphertext,updated_by) VALUES('https://openwa.example.test/api','openwa-secret',$1)",
    [root.id],
  );
  await embedded.exec(
    "CREATE TABLE deployment_migrations(name text PRIMARY KEY,checksum text); INSERT INTO deployment_migrations VALUES('020-pt-lifecycle.sql','checksum-kept')",
  );
  const socket = new PGLiteSocketServer({
    db: embedded,
    host: '127.0.0.1',
    port: 55453,
    maxConnections: 5,
  });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55453/postgres',
    max: 1,
  });
  const client = await pool.connect();
  try {
    const rootBefore = (await client.query('SELECT * FROM users WHERE id=$1', [root.id])).rows[0];
    const seed = await seedValidationData(client, 'Teste!12');
    assert.equal(seed.users.length, 12);
    assert.equal((await client.query('SELECT count(*)::int total FROM units')).rows[0].total, 1);
    assert.equal(
      (await client.query('SELECT count(*)::int total FROM contractors')).rows[0].total,
      2,
    );
    assert.equal(
      (await client.query('SELECT count(*)::int total FROM approvers')).rows[0].total,
      7,
    );
    assert.equal((await client.query('SELECT unit_limit FROM companies')).rows[0].unit_limit, 1);
    for (const table of [
      'documents',
      'document_versions',
      'photos',
      'notification_outbox',
      'user_invitations',
      'invitation_deliveries',
      'contractor_registrations',
    ])
      assert.equal(
        (await client.query(`SELECT count(*)::int total FROM ${table}`)).rows[0].total,
        0,
        table,
      );
    const people = (
      await client.query(
        'SELECT u.*,s.cpf_ciphertext FROM users u JOIN user_security s ON s.user_id=u.id WHERE NOT u.platform_admin',
      )
    ).rows;
    for (const person of people) {
      assert(verifyPassword('Teste!12', person.password_hash));
      assert.equal(person.password_pending, false);
      assert(validCpf(decryptSecret(person.cpf_ciphertext, person.id, 'cpf')));
    }
    assert.equal(new Set(people.map((person) => person.password_hash)).size, 12);
    assert.deepEqual(
      (await client.query('SELECT * FROM users WHERE id=$1', [root.id])).rows[0],
      rootBefore,
    );
    await assert.rejects(seedValidationData(client, 'Teste!12'), /base contém/);
    await assert.rejects(seedValidationData(client, 'fraca'), /8 caracteres/);
    const {
      rows: [owner],
    } = await client.query('SELECT user_id id FROM company_admins');
    const {
      rows: [contractor],
    } = await client.query('SELECT id FROM contractors ORDER BY name');
    await client.query('UPDATE email_gateway SET updated_by=$1', [owner.id]);
    await client.query('UPDATE whatsapp_gateway SET updated_by=$1', [owner.id]);
    const {
      rows: [apr],
    } = await client.query(
      "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by) VALUES(gen_random_uuid(),$1,$2,$3,'APR','Documento antigo','Local',CURRENT_DATE,CURRENT_DATE,$4) RETURNING id",
      [seed.companyId, seed.unitId, contractor.id, owner.id],
    );
    const {
      rows: [pt],
    } = await client.query(
      "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,apr_id,created_by) VALUES(gen_random_uuid(),$1,$2,$3,'PT','PT antiga','Local',CURRENT_DATE,CURRENT_DATE,$4,$5) RETURNING id",
      [seed.companyId, seed.unitId, contractor.id, apr.id, owner.id],
    );
    await client.query(
      'INSERT INTO document_versions(document_id,version,snapshot) SELECT id,version,to_jsonb(d) FROM documents d',
    );
    await client.query(
      "INSERT INTO approvals(document_id,version,profile,user_id) VALUES($1,1,'Perfil antigo',$2)",
      [apr.id, owner.id],
    );
    await client.query(
      'INSERT INTO notification_outbox(document_id,version,user_id) VALUES($1,1,$2)',
      [apr.id, owner.id],
    );
    await client.query(
      "INSERT INTO photos(id,document_id,actor_id,caption,captured_at,latitude,longitude,accuracy,mime,sha256,content) VALUES(gen_random_uuid(),$1,$2,'Foto antiga',now(),0,0,1,'image/png','hash',decode('1234','hex'))",
      [pt.id, owner.id],
    );
    const {
      rows: [invitation],
    } = await client.query(
      "INSERT INTO user_invitations(user_id,unit_id,token_hash,created_by) VALUES($1,$2,'old-token',$3) RETURNING id",
      [owner.id, seed.unitId, root.id],
    );
    await client.query(
      "INSERT INTO invitation_deliveries(invitation_id,channel,recipient) VALUES($1,'email','old@example.test')",
      [invitation.id],
    );
    const {
      rows: [registration],
    } = await client.query(
      "INSERT INTO contractor_registrations(id,company_id,unit_id,email,created_by,token_hash,token_ciphertext) VALUES(gen_random_uuid(),$1,$2,'old@example.test',$3,'old-registration','ciphertext') RETURNING id",
      [seed.companyId, seed.unitId, owner.id],
    );
    await client.query(
      "INSERT INTO contractor_registration_cards(registration_id,mime,sha256,content_ciphertext) VALUES($1,'application/pdf','hash','encrypted-cnpj')",
      [registration.id],
    );
    const {
      rows: [identity],
    } = await client.query(
      "INSERT INTO executor_identity_submissions(id,company_id,unit_id,contractor_id,user_id,document_type,identity_snapshot,submitted_by) VALUES(gen_random_uuid(),$1,$2,$3,$4,'RG','{}',$4) RETURNING id",
      [seed.companyId, seed.unitId, contractor.id, owner.id],
    );
    await client.query(
      "INSERT INTO executor_identity_files(id,submission_id,mime,sha256,content_ciphertext) VALUES(gen_random_uuid(),$1,'application/pdf','hash','encrypted-rg')",
      [identity.id],
    );
    await client.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('root-session',$1,now()+interval '1 day')",
      [root.id],
    );
    await client.query('CREATE TABLE unknown_business_table(id integer)');
    await assert.rejects(cleanProductionData(client), /Schema diferente/);
    assert.equal(
      (await client.query('SELECT count(*)::int total FROM documents')).rows[0].total,
      2,
    );
    await client.query('DROP TABLE unknown_business_table');
    await client.query('UPDATE users SET active=false WHERE id=$1', [root.id]);
    await assert.rejects(cleanProductionData(client), /Superadmin ativo/);
    await client.query('UPDATE users SET active=true WHERE id=$1', [root.id]);
    await cleanProductionData(client);
    assert.deepEqual((await client.query('SELECT * FROM users')).rows, [rootBefore]);
    assert.deepEqual(
      (await client.query('SELECT secret_ciphertext,last_step FROM user_security')).rows[0],
      { secret_ciphertext: 'root-factor', last_step: '123' },
    );
    assert.equal(
      (await client.query('SELECT secret_ciphertext FROM email_gateway')).rows[0].secret_ciphertext,
      'resend-secret',
    );
    assert.equal(
      (await client.query('SELECT secret_ciphertext FROM whatsapp_gateway')).rows[0]
        .secret_ciphertext,
      'openwa-secret',
    );
    assert.equal(
      (await client.query('SELECT updated_by FROM email_gateway')).rows[0].updated_by,
      root.id,
    );
    assert.equal(
      (await client.query('SELECT checksum FROM deployment_migrations')).rows[0].checksum,
      'checksum-kept',
    );
    for (const table of [
      'companies',
      'users',
      'documents',
      'photos',
      'sessions',
      'contractor_registration_cards',
      'executor_identity_files',
    ])
      assert.equal(
        (await client.query(`SELECT count(*)::int total FROM ${table}`)).rows[0].total,
        table === 'users' ? 1 : 0,
        table,
      );
    const second = await seedValidationData(client, 'Outra!12');
    assert.equal(second.users.length, 12);
    assert.equal(
      (await client.query('SELECT count(*)::int total FROM documents')).rows[0].total,
      0,
    );
  } finally {
    client.release();
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
