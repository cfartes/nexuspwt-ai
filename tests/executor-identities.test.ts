import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import type { User } from '../src/lib/auth';
import { contractorContact } from '../src/lib/contractor-access';
import { contractorDetails } from '../src/lib/contractors';
import {
  executorSubmission,
  identityFile,
  submitExecutor,
  reviewExecutor,
  assertExecutorsValidated,
} from '../src/lib/executor-identities';
import { decryptSecret } from '../src/lib/integrations';
import { requiresLoginMfa, sessionEvidence } from '../src/lib/session-security';

test('contratada cadastra somente sua equipe; documentos privados, revisão interna, reenvio e guarda de cinco anos', async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'b'.repeat(64);
  const embedded = await PGlite.create();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await embedded.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const insert = async (sql: string, args: unknown[] = []) =>
    (await embedded.query<{ id: string }>(sql, args)).rows[0].id;
  const company = await insert("INSERT INTO companies(name) VALUES('Cliente') RETURNING id");
  const unit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade A','CDD') RETURNING id",
    [company],
  );
  const otherUnit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade B','CDD') RETURNING id",
    [company],
  );
  const adminId = await insert(
    "INSERT INTO users(name,email,password_hash) VALUES('Admin','admin@identity.test','dummy') RETURNING id",
  );
  const gestorId = await insert(
    "INSERT INTO users(name,email,password_hash) VALUES('Gestor','gestor@identity.test','dummy') RETURNING id",
  );
  await embedded.query(
    "INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$3,'admin'),($2,$3,'gestor'),($1,$4,'admin')",
    [adminId, gestorId, unit, otherUnit],
  );
  const contractor = await insert(
    "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Contratada','11111111111111') RETURNING id",
    [company],
  );
  await embedded.query('INSERT INTO contractor_units VALUES($1,$2,$3),($1,$2,$4)', [
    company,
    contractor,
    unit,
    otherUnit,
  ]);
  const socket = new PGLiteSocketServer({
    db: embedded,
    host: '127.0.0.1',
    port: 55448,
    maxConnections: 5,
  });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55448/postgres',
    max: 1,
  });
  const actor = (id: string) => ({ id, platform_admin: false }) as User;
  const tx = async <T>(run: (c: pg.PoolClient) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await run(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  const status = (n: number) => (e: unknown) => (e as { status: number }).status === n;
  try {
    const details = contractorDetails.parse({
      contactName: 'Responsável',
      email: 'contact@identity.test',
      phone: '5511999999999',
    });
    await assert.rejects(
      tx((c) =>
        contractorContact(c, actor(adminId), unit, contractor, contractorDetails.parse({})),
      ),
      status(400),
    );
    await tx((c) => contractorContact(c, actor(adminId), unit, contractor, details));
    await tx((c) => contractorContact(c, actor(adminId), otherUnit, contractor, details));
    const {
      rows: [contact],
    } = await pool.query("SELECT * FROM users WHERE email='contact@identity.test'");
    assert(contact.password_pending);
    assert.equal(
      (
        await pool.query("SELECT 1 FROM memberships WHERE user_id=$1 AND role='admin_contratada'", [
          contact.id,
        ])
      ).rowCount,
      2,
    );
    // Setup reruns all migrations; an older role migration must preserve the new profile.
    await pool.query(await readFile(new URL('../db/012-safety-role.sql', import.meta.url), 'utf8'));
    await pool.query(
      await readFile(new URL('../db/016-contractor-executors.sql', import.meta.url), 'utf8'),
    );
    const file = {
      mime: 'application/pdf' as const,
      base64: Buffer.from('%PDF-1.4\nDummy identity fixture, not a real document').toString(
        'base64',
      ),
    };
    await pool.query('UPDATE companies SET identity_upload_enabled=true WHERE id=$1', [company]);
    await pool.query('UPDATE users SET password_pending=false WHERE id=$1', [contact.id]);
    const contactProof = await tx((client) =>
      submitExecutor(
        client,
        actor(contact.id),
        executorSubmission.parse({
          action: 'resubmit',
          unitId: unit,
          userId: contact.id,
          documentType: 'RG',
          files: [file],
        }),
        true,
      ),
    );
    assert(contactProof.id);
    await tx((client) =>
      reviewExecutor(client, actor(adminId), {
        unitId: unit,
        id: contactProof.id,
        version: 1,
        decision: 'approved',
        reason: 'Responsável conferido presencialmente',
      }),
    );
    assert.throws(() => identityFile({ ...file, mime: 'image/png' }), status(400));
    assert(
      !executorSubmission.safeParse({
        action: 'register',
        unitId: unit,
        documentType: 'RG',
        files: [],
        role: 'admin',
      }).success,
    );
    const input = executorSubmission.parse({
      action: 'register',
      unitId: unit,
      name: 'Executor A',
      email: 'executor@identity.test',
      phone: '5511888888888',
      documentType: 'RG',
      files: [file],
    });
    const submission = await tx((c) => submitExecutor(c, actor(contact.id), input));
    assert(submission.id);
    const {
      rows: [executor],
    } = await pool.query("SELECT id FROM users WHERE email='executor@identity.test'");
    await assert.rejects(
      assertExecutorsValidated(pool, unit, [{ userId: executor.id }]),
      status(422),
    );
    await assert.rejects(
      tx((c) => submitExecutor(c, actor(contact.id), input)),
      status(409),
    );
    const decision = {
      unitId: unit,
      id: submission.id,
      version: 1,
      decision: 'approved' as const,
      reason: 'Documento e vínculo conferidos presencialmente',
    };
    await assert.rejects(
      tx((c) => reviewExecutor(c, actor(contact.id), decision)),
      status(403),
    );
    await tx((c) => reviewExecutor(c, actor(gestorId), decision));
    await assertExecutorsValidated(pool, unit, [{ userId: executor.id }]);
    await assert.rejects(
      tx((c) => reviewExecutor(c, actor(gestorId), decision)),
      status(409),
    );
    const replacement = await tx((c) =>
      submitExecutor(
        c,
        actor(contact.id),
        executorSubmission.parse({
          action: 'resubmit',
          unitId: unit,
          userId: executor.id,
          documentType: 'CNH',
          files: [file],
        }),
      ),
    );
    assert(replacement.id);
    await assert.rejects(
      assertExecutorsValidated(pool, unit, [{ userId: executor.id }]),
      status(422),
    );
    await tx((c) =>
      reviewExecutor(c, actor(adminId), {
        ...decision,
        id: replacement.id,
        decision: 'rejected',
        reason: 'Imagem ilegível, enviar novo documento',
      }),
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int n FROM executor_identity_files')).rows[0].n,
      3,
      'versão anterior é preservada',
    );
    const { rows: files } = await pool.query('SELECT * FROM executor_identity_files');
    assert(
      files.every(
        (f) => new Date(f.retain_until).getTime() > Date.now() + 4.99 * 365.25 * 86400000,
      ),
    );
    assert.equal(
      decryptSecret(files[0].content_ciphertext, files[0].id, 'identity-document'),
      file.base64,
    );
    assert(!files[0].content_ciphertext.includes(file.base64));
    await assert.rejects(
      tx((c) => reviewExecutor(c, actor(gestorId), { ...decision, unitId: otherUnit })),
      status(403),
    );
    assert.equal(await requiresLoginMfa(pool, contact.id), false);
    await pool.query('UPDATE companies SET approval_mfa_required=true WHERE id=$1', [company]);
    assert.equal(await requiresLoginMfa(pool, contact.id), true);
    assert.throws(() => sessionEvidence(actor(contact.id)), status(401));
    const proof = sessionEvidence({
      ...actor(contact.id),
      session_authenticated_at: new Date().toISOString(),
      session_mfa_verified_at: new Date().toISOString(),
      session_factor_enabled_at: new Date().toISOString(),
    });
    assert.equal(proof.method, 'password_totp');
  } finally {
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
