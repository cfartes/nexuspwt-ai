import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { validCsrf, csrfCookieName } from '../src/lib/csrf';
import { readJsonBody } from '../src/lib/http';
import { enforceRequestLimit, requestIdentity } from '../src/lib/requestLimits';
import { digest } from '../src/lib/security';
import { fetchApi } from '../src/lib/fetchApi';

await test('cliente CSRF: não repete erro de rede/servidor e só refaz recusa anterior à operação', async () => {
  let csrf = 'c'.repeat(64),
    expired = false,
    offline = false,
    posts = 0;
  const replacement = mock.method(
    globalThis,
    'fetch',
    async (input: unknown, options?: RequestInit) => {
      if (input === '/api/csrf') return Response.json({ token: csrf });
      posts++;
      if (offline) throw new TypeError('offline');
      if (expired && new Headers(options?.headers).get('X-Nexus-CSRF') !== csrf)
        return Response.json(
          { code: 'CSRF_REQUIRED' },
          { status: 403, headers: { 'X-Nexus-CSRF-Required': '1' } },
        );
      return Response.json({ ok: true }, { status: expired ? 200 : 503 });
    },
  );
  try {
    assert.equal((await fetchApi('/api/documents', { method: 'POST' })).status, 503);
    assert.equal(posts, 1);
    expired = true;
    csrf = 'd'.repeat(64);
    assert.equal((await fetchApi('/api/documents', { method: 'POST' })).status, 200);
    assert.equal(posts, 3);
    offline = true;
    await assert.rejects(fetchApi('/api/documents', { method: 'POST' }), /offline/);
    assert.equal(posts, 4);
    await assert.rejects(
      fetchApi('https://foreign.example/api/documents', { method: 'POST' }),
      /Destino/,
    );
    assert.equal(posts, 4);
  } finally {
    replacement.mock.restore();
  }
});

await test('CSRF e corpo: cookie separado, comparação exata e limite real sem Content-Length', async () => {
  const token = 'a'.repeat(64);
  assert(validCsrf(token, token));
  assert(!validCsrf(token, 'b'.repeat(64)));
  assert(!validCsrf(undefined, token));
  assert(!validCsrf(token, 'x'));
  assert.equal(csrfCookieName(true), '__Host-nexus_csrf');
  assert.equal(csrfCookieName(false), 'nexus_csrf');
  assert.deepEqual(
    await readJsonBody(new Request('http://local/', { method: 'POST', body: '{"ok":true}' })),
    { ok: true },
  );
  await assert.rejects(
    readJsonBody(
      new Request('http://local/', { method: 'POST', body: new Uint8Array(16 * 1024 * 1024) }),
    ),
    /15 MB/,
  );
});

await test('SaaS: RLS impede consultas cruzadas sem filtros; roles sem DDL/bypass e orçamento persistente', async () => {
  const embedded = await PGlite.create();
  for (const filename of (await readdir(new URL('../db/', import.meta.url)))
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await embedded.exec(await readFile(new URL('../db/' + filename, import.meta.url), 'utf8'));
  const socket = new PGLiteSocketServer({ db: embedded, host: '127.0.0.1', port: 55455 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55455/postgres',
    max: 1,
  });
  const client = await pool.connect();
  try {
    const companyA = crypto.randomUUID(),
      companyB = crypto.randomUUID(),
      unitA = crypto.randomUUID(),
      unitB = crypto.randomUUID();
    const contractorA = crypto.randomUUID(),
      contractorOther = crypto.randomUUID(),
      contractorB = crypto.randomUUID();
    const executor = crypto.randomUUID(),
      admin = crypto.randomUUID(),
      colleague = crypto.randomUUID();
    const ownDocument = crypto.randomUUID(),
      otherDocument = crypto.randomUUID(),
      foreignDocument = crypto.randomUUID();
    await client.query("INSERT INTO companies(id,name) VALUES($1,'A'),($2,'B')", [
      companyA,
      companyB,
    ]);
    await client.query(
      "INSERT INTO units(id,company_id,name,kind) VALUES($1,$2,'A','CDD'),($3,$4,'B','CDD')",
      [unitA, companyA, unitB, companyB],
    );
    await client.query(
      "INSERT INTO contractors(id,company_id,name,cnpj) VALUES($1,$2,'A1','1'),($3,$2,'A2','2'),($4,$5,'B1','3')",
      [contractorA, companyA, contractorOther, contractorB, companyB],
    );
    await client.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES($1,'Executor','executor@fixture.test','hash'),($2,'Admin','admin@fixture.test','hash'),($3,'Colega','colega@fixture.test','hash')",
      [executor, admin, colleague],
    );
    await client.query(
      'INSERT INTO contractor_units(company_id,contractor_id,unit_id) VALUES($1,$2,$3),($1,$4,$3),($5,$6,$7)',
      [companyA, contractorA, unitA, contractorOther, companyB, contractorB, unitB],
    );
    await client.query(
      "INSERT INTO memberships(user_id,unit_id,role,contractor_id) VALUES($1,$2,'executante',$3),($4,$2,'admin',NULL),($5,$2,'executante',$3)",
      [executor, unitA, contractorA, admin, colleague],
    );
    await client.query('INSERT INTO company_admins(company_id,user_id) VALUES($1,$2)', [
      companyA,
      admin,
    ]);
    await client.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",
      [digest('a'.repeat(64)), executor, digest('b'.repeat(64)), admin],
    );
    for (const [id, company, unit, contractor] of [
      [ownDocument, companyA, unitA, contractorA],
      [otherDocument, companyA, unitA, contractorOther],
      [foreignDocument, companyB, unitB, contractorB],
    ])
      await client.query(
        "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,'APR','Fixture','Local',current_date,current_date,$5)",
        [id, company, unit, contractor, executor],
      );
    for (const userId of [executor, colleague]) {
      const submission = crypto.randomUUID();
      await client.query(
        "INSERT INTO executor_identity_submissions(id,company_id,unit_id,contractor_id,user_id,document_type,identity_snapshot,submitted_by) VALUES($1,$2,$3,$4,$5,'RG','{}',$5)",
        [submission, companyA, unitA, contractorA, userId],
      );
      await client.query(
        "INSERT INTO executor_identity_files(id,submission_id,mime,sha256,content_ciphertext) VALUES($1,$2,'application/pdf','hash','private-fixture')",
        [crypto.randomUUID(), submission],
      );
    }
    await client.query(
      "INSERT INTO document_versions(document_id,version,snapshot) SELECT id,1,to_jsonb(d)||jsonb_build_object('contractor_id',$2::text) FROM documents d WHERE id=$1",
      [otherDocument, contractorA],
    );
    await client.query('UPDATE documents SET version=2 WHERE id=$1', [otherDocument]);
    await client.query(
      "INSERT INTO audit_events(actor_id,company_id,action) VALUES($1,$2,'fixture'),($1,$3,'fixture')",
      [admin, companyA, companyB],
    );
    await client.query(
      "INSERT INTO audit_events(actor_id,document_id,action) VALUES($1,$2,'document.fixture')",
      [admin, ownDocument],
    );
    await client.query('SET ROLE nexus_app');
    await client.query("SELECT set_config('nexus.session_token',$1,false)", ['a'.repeat(64)]);
    assert.deepEqual((await client.query('SELECT id FROM documents')).rows, [{ id: ownDocument }]);
    const oldPrint = (
      await client.query('SELECT ptw_print_document($1,1) payload', [otherDocument])
    ).rows[0].payload;
    assert.equal(oldPrint.contractor_id, contractorA);
    assert.equal(oldPrint.version, 1);
    assert.equal(
      (await client.query('SELECT ptw_print_document($1,NULL) payload', [otherDocument])).rows[0]
        .payload,
      null,
    );
    assert.equal((await client.query('SELECT * FROM executor_identity_files')).rowCount, 1);
    assert.equal((await client.query('SELECT * FROM audit_events')).rowCount, 1);
    assert.equal(
      (await client.query("UPDATE documents SET title='tentativa' WHERE id=$1", [foreignDocument]))
        .rowCount,
      0,
    );
    await assert.rejects(
      client.query('UPDATE documents SET company_id=$1,unit_id=$2,contractor_id=$3 WHERE id=$4', [
        companyB,
        unitB,
        contractorB,
        ownDocument,
      ]),
      /row-level security/,
    );
    await assert.rejects(
      client.query('CREATE TABLE runtime_forbidden(id integer)'),
      /permission denied/,
    );
    await assert.rejects(client.query('CREATE TEMP TABLE users(id integer)'), /permission denied/);
    await assert.rejects(client.query('TRUNCATE documents'), /permission denied/);
    await client.query("SELECT set_config('nexus.session_token',$1,false)", [
      digest('b'.repeat(64)),
    ]);
    assert.equal(
      (await client.query('SELECT * FROM documents')).rowCount,
      0,
      'Hash armazenado não pode ser usado como prova de sessão',
    );
    await client.query("SELECT set_config('nexus.session_token',$1,false)", ['b'.repeat(64)]);
    assert.equal((await client.query('SELECT * FROM documents')).rowCount, 2);
    assert.equal((await client.query('SELECT * FROM audit_events')).rowCount, 2);
    await client.query("SELECT set_config('nexus.session_token','',false)");
    assert.equal((await client.query('SELECT * FROM documents')).rowCount, 0);
    assert.equal((await client.query('SELECT * FROM executor_identity_files')).rowCount, 0);
    await client.query('RESET ROLE');
    await client.query('SET ROLE nexus_worker');
    assert.equal((await client.query('SELECT id FROM documents')).rowCount, 3);
    await assert.rejects(client.query('SELECT data FROM documents'), /permission denied/);
    await assert.rejects(client.query("UPDATE documents SET title='worker'"), /permission denied/);
    await assert.rejects(
      client.query('SELECT * FROM executor_identity_files'),
      /permission denied/,
    );
    await assert.rejects(client.query('SELECT password_hash FROM users'), /permission denied/);
    await assert.rejects(
      client.query("UPDATE password_recoveries SET token_hash='forbidden'"),
      /permission denied/,
    );
    await client.query('RESET ROLE');
    const requestToken = 'f'.repeat(64);
    await client.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [digest(requestToken), executor],
    );
    assert.equal(await requestIdentity(requestToken, client), executor);
    assert.equal(await requestIdentity('0'.repeat(64), client), 'anonymous');
    for (let count = 0; count < 2; count++) await enforceRequestLimit('fixture', 'test', 2, client);
    await assert.rejects(
      enforceRequestLimit('fixture', 'test', 2, client),
      (error: unknown) => error instanceof Error && 'status' in error && error.status === 429,
    );
    await client.query("UPDATE request_limits SET window_at=now()-interval '2 minutes'");
    await enforceRequestLimit('fixture', 'test', 2, client);
  } finally {
    client.release();
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
