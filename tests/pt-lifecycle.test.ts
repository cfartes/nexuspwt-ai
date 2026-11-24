import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { changePtLifecycle, type PtAction } from '../src/lib/pt-lifecycle';
import { assertDocumentRead, type User } from '../src/lib/auth';
import { ptClock, ptEndError } from '../src/lib/pt-calendar';

await test('PT: término válido, sem ultrapassar a meia-noite e sem horário retroativo', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  assert.equal(ptClock(now), '09:00');
  assert.equal(ptEndError('09:01', now), null);
  for (const time of ['', '09:00', '08:59', '24:00', '10:60', '2026-11-25T10:00'])
    assert(ptEndError(time, now));
  assert.equal(ptClock(new Date('2026-11-25T03:00:00Z')), '00:00');
  assert(ptEndError('00:01', new Date('2026-11-25T02:59:00Z')));
});

await test('PT: encerramento com foto, reabertura e prorrogação exigem responsável interno, dia atual e nova versão', async () => {
  const embedded = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort())
    await embedded.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const {
    rows: [company],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO companies(name) VALUES('Empresa PT') RETURNING id",
  );
  const {
    rows: [unit],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade','CDD') RETURNING id",
    [company.id],
  );
  const {
    rows: [contractor],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Contratada','12345678000195') RETURNING id",
    [company.id],
  );
  await embedded.query(
    'INSERT INTO contractor_units(company_id,contractor_id,unit_id) VALUES($1,$2,$3)',
    [company.id, contractor.id, unit.id],
  );
  const {
    rows: [person],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO users(name,email,password_hash) VALUES('Gestor','gestor@pt.test','unused') RETURNING id",
  );
  const actor = { id: person.id, platform_admin: false } as User;
  const {
    rows: [apr],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,created_by,status) VALUES(gen_random_uuid(),$1,$2,$3,'APR','APR teste','Local','2026-11-24','2026-11-24',$4,'aprovado') RETURNING id",
    [company.id, unit.id, contractor.id, person.id],
  );
  const {
    rows: [pt],
  } = await embedded.query<{ id: string }>(
    "INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,apr_id,created_by,status,data) VALUES(gen_random_uuid(),$1,$2,$3,'PT','PT teste','Local','2026-11-24','2026-11-24',$4,$5,'aprovado',$6) RETURNING id",
    [
      company.id,
      unit.id,
      contractor.id,
      apr.id,
      person.id,
      JSON.stringify({
        answers: { 'general.endsAt': '10:00' },
        executors: [],
        types: [],
        ppe: [],
        risks: [],
      }),
    ],
  );
  const socket = new PGLiteSocketServer({
    db: embedded,
    host: '127.0.0.1',
    port: 55452,
    maxConnections: 5,
  });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55452/postgres',
    max: 1,
  });
  const now = new Date('2026-11-24T12:00:00Z');
  const run = async (
    action: PtAction,
    endTime = '',
    role = 'gestor',
    external = false,
    at = now,
    reason = 'Conferido pela unidade',
  ) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const {
        rows: [document],
      } = await client.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [pt.id]);
      await changePtLifecycle(
        client,
        actor,
        { role, contractor_id: external ? contractor.id : null },
        document,
        action,
        reason,
        endTime,
        at,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  const status = (code: number) => (error: unknown) =>
    (error as { status: number }).status === code;
  try {
    await assert.rejects(run('close', '', 'executante'), status(403));
    await assert.rejects(run('close', '', 'gestor', true), status(403));
    await assert.rejects(
      run('close', '', 'gestor', false, new Date('2026-11-25T12:00:00Z')),
      status(409),
    );
    await assert.rejects(run('close', '', 'gestor', false, now, 'x'), status(400));
    await assert.rejects(run('close'), /fotográfica/);
    await pool.query(
      'INSERT INTO document_versions(document_id,version,snapshot) SELECT id,version,to_jsonb(d) FROM documents d WHERE id=$1',
      [pt.id],
    );
    await pool.query(
      "INSERT INTO approvals(document_id,version,profile,user_id,decision) VALUES($1,1,'Responsável pela área',$2,'aprovado')",
      [pt.id, actor.id],
    );
    await pool.query(
      "INSERT INTO photos(id,document_id,actor_id,caption,captured_at,latitude,longitude,accuracy,mime,sha256,content) VALUES(gen_random_uuid(),$1,$2,'Conclusão',now(),0,0,1,'image/png','hash',decode('1234','hex'))",
      [pt.id, actor.id],
    );
    await run('close');
    let document = (await pool.query('SELECT * FROM documents WHERE id=$1', [pt.id])).rows[0];
    assert.equal(document.status, 'encerrado');
    assert.equal(document.version, 2);
    assert.equal(document.data.answers['s22.finishedAt'], '09:00');
    await assertDocumentRead(pool, actor, { role: 'aprovador', contractor_id: null }, document);
    await assert.rejects(run('reopen', '08:00'), status(400));
    await run('reopen', '11:00');
    document = (await pool.query('SELECT * FROM documents WHERE id=$1', [pt.id])).rows[0];
    assert.equal(document.status, 'rascunho');
    assert.equal(document.version, 3);
    assert.equal(document.data.answers['s22.finishedAt'], undefined);
    await assert.rejects(
      assertDocumentRead(pool, actor, { role: 'aprovador', contractor_id: null }, document),
      status(403),
    );
    await assert.rejects(run('close'), status(409));
    await assert.rejects(run('extend', '10:59'), status(400));
    await run('extend', '11:30');
    await pool.query("UPDATE documents SET status='aprovado' WHERE id=$1", [pt.id]);
    await run('extend', '12:00', 'seguranca_trabalho');
    document = (await pool.query('SELECT * FROM documents WHERE id=$1', [pt.id])).rows[0];
    assert.equal(document.version, 5);
    assert.equal(document.status, 'rascunho');
    assert.equal(document.data.answers['general.endsAt'], '12:00');
    const closed = (
      await pool.query(
        'SELECT snapshot FROM document_versions WHERE document_id=$1 AND version=2',
        [pt.id],
      )
    ).rows[0];
    assert.equal(closed.snapshot.status, 'encerrado');
    assert.equal(closed.snapshot.data.answers['s22.finishedAt'], '09:00');
    assert.equal(
      (
        await pool.query('SELECT count(*)::int total FROM audit_events WHERE document_id=$1', [
          pt.id,
        ])
      ).rows[0].total,
      4,
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM photos WHERE document_id=$1', [pt.id]))
        .rows[0].total,
      1,
    );
  } finally {
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
