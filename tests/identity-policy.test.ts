import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { unitAccess, type User } from '../src/lib/auth';
import { saveIdentityPolicy } from '../src/lib/identityPolicy';
import { personalIdentityState, readIdentityPolicy } from '../src/lib/identityPolicyRepository';
import {
  executorSubmission,
  submitExecutor,
  reviewExecutor,
  assertExecutorsValidated,
} from '../src/lib/executor-identities';
import { assertDecisionIdentity } from '../src/lib/approval-security';

void test('upload opcional por empresa: padrão desligado, todos os perfis, isolamento, reutilização e desativação sem apagar arquivos', async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'd'.repeat(64);
  const embedded = await PGlite.create();
  for (const filename of (await readdir(new URL('../db/', import.meta.url)))
    .filter((filename) => filename.endsWith('.sql'))
    .sort())
    await embedded.exec(await readFile(new URL('../db/' + filename, import.meta.url), 'utf8'));
  const insert = async (statement: string, parameters: unknown[] = []): Promise<string> =>
    (await embedded.query<{ id: string }>(statement, parameters)).rows[0].id;
  const company = await insert("INSERT INTO companies(name) VALUES('Empresa A') RETURNING id");
  const otherCompany = await insert("INSERT INTO companies(name) VALUES('Empresa B') RETURNING id");
  const firstUnit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'A1','CDD') RETURNING id",
    [company],
  );
  const secondUnit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'A2','CDD') RETURNING id",
    [company],
  );
  const otherUnit = await insert(
    "INSERT INTO units(company_id,name,kind) VALUES($1,'B1','CDD') RETURNING id",
    [otherCompany],
  );
  const contractor = await insert(
    "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Contratada A','11111111111111') RETURNING id",
    [company],
  );
  const otherContractor = await insert(
    "INSERT INTO contractors(company_id,name,cnpj) VALUES($1,'Contratada B','22222222222222') RETURNING id",
    [otherCompany],
  );
  await embedded.query('INSERT INTO contractor_units VALUES($1,$2,$3),($1,$2,$4),($5,$6,$7)', [
    company,
    contractor,
    firstUnit,
    secondUnit,
    otherCompany,
    otherContractor,
    otherUnit,
  ]);
  const createPerson = async (role: string, external: boolean): Promise<User> => {
    const id = await insert(
      "INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,'5511999999999','dummy') RETURNING id",
      [
        role + (external ? ' externo' : ' interno'),
        role + (external ? '-external' : '-internal') + '@policy.test',
      ],
    );
    await embedded.query(
      'INSERT INTO memberships(user_id,unit_id,role,contractor_id) VALUES($1,$2,$3,$4),($1,$5,$3,$4)',
      [id, firstUnit, role, external ? contractor : null, secondUnit],
    );
    return {
      id,
      name: role,
      email: role + '@policy.test',
      platform_admin: false,
      session_expires_at: '',
    };
  };
  const companyAdmin = await createPerson('admin', false);
  const reviewer = await createPerson('gestor', false);
  await embedded.query('INSERT INTO company_admins(company_id,user_id) VALUES($1,$2)', [
    company,
    companyAdmin.id,
  ]);
  const externalPeople: User[] = [];
  for (const role of [
    'admin_contratada',
    'executante',
    'aprovador',
    'gestor',
    'seguranca_trabalho',
  ])
    externalPeople.push(await createPerson(role, true));
  const socket = new PGLiteSocketServer({
    db: embedded,
    host: '127.0.0.1',
    port: 55449,
    maxConnections: 5,
  });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55449/postgres',
    max: 1,
  });
  const transaction = async <T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  const status =
    (expected: number) =>
    (error: unknown): boolean =>
      (error as { status: number }).status === expected;
  const file = {
    mime: 'application/pdf' as const,
    base64: Buffer.from('%PDF-1.4\nDummy identity, not a real document').toString('base64'),
  };
  try {
    assert.deepEqual(await readIdentityPolicy(pool, company), { enabled: false, version: 1 });
    for (const person of externalPeople) await unitAccess(person, firstUnit, undefined, pool);
    const noDocument = await transaction((client) =>
      submitExecutor(
        client,
        externalPeople[0],
        executorSubmission.parse({
          action: 'register',
          unitId: firstUnit,
          name: 'Opcional',
          email: 'optional@policy.test',
          phone: '5511999999999',
        }),
      ),
    );
    assert.equal(noDocument.id, null);
    await assert.rejects(
      transaction((client) =>
        saveIdentityPolicy(client, reviewer, { unitId: firstUnit, enabled: true, version: 1 }),
      ),
      status(403),
    );
    await transaction((client) =>
      saveIdentityPolicy(client, companyAdmin, { unitId: firstUnit, enabled: true, version: 1 }),
    );
    await assert.rejects(
      transaction((client) =>
        saveIdentityPolicy(client, companyAdmin, { unitId: firstUnit, enabled: false, version: 1 }),
      ),
      status(409),
    );
    await assert.rejects(
      transaction((client) =>
        saveIdentityPolicy(client, companyAdmin, { unitId: otherUnit, enabled: false, version: 1 }),
      ),
      status(403),
    );
    for (const person of externalPeople) {
      await assert.rejects(unitAccess(person, firstUnit, undefined, pool), status(403));
      assert.equal(
        (await personalIdentityState(pool, person.id, company, contractor, true)).status,
        'missing',
      );
      const submission = await transaction((client) =>
        submitExecutor(
          client,
          person,
          executorSubmission.parse({
            action: 'resubmit',
            unitId: firstUnit,
            userId: person.id,
            documentType: 'Passaporte',
            files: [file],
          }),
          true,
        ),
      );
      assert(submission.id);
      await assert.rejects(
        transaction((client) =>
          reviewExecutor(client, person, {
            unitId: firstUnit,
            id: submission.id,
            version: 1,
            decision: 'approved',
            reason: 'Tentativa de autovalidação',
          }),
        ),
        status(403),
      );
      await transaction((client) =>
        reviewExecutor(client, reviewer, {
          unitId: firstUnit,
          id: submission.id,
          version: 1,
          decision: 'approved',
          reason: 'Conferência humana pela unidade',
        }),
      );
      assert.equal(
        (await personalIdentityState(pool, person.id, company, contractor, true)).required,
        false,
      );
      await unitAccess(person, secondUnit, undefined, pool);
      await assertExecutorsValidated(pool, secondUnit, [{ userId: person.id }]);
      const proof = await transaction((client) =>
        assertDecisionIdentity(client, person, secondUnit, {
          method: 'password',
          enabledAt: null,
          authenticatedAt: new Date().toISOString(),
        }),
      );
      assert.equal(proof.verifiedBy, reviewer.id);
    }
    const firstPerson = externalPeople[0];
    await pool.query(
      "INSERT INTO memberships(user_id,unit_id,role,contractor_id) VALUES($1,$2,'admin_contratada',$3)",
      [firstPerson.id, otherUnit, otherContractor],
    );
    assert.equal(
      (await personalIdentityState(pool, firstPerson.id, otherCompany, otherContractor, true))
        .required,
      true,
    );
    await assert.rejects(
      transaction((client) =>
        submitExecutor(
          client,
          firstPerson,
          executorSubmission.parse({
            action: 'resubmit',
            unitId: firstUnit,
            userId: externalPeople[1].id,
            documentType: 'RG',
            files: [file],
          }),
          true,
        ),
      ),
      status(403),
    );
    const replacement = await transaction((client) =>
      submitExecutor(
        client,
        firstPerson,
        executorSubmission.parse({
          action: 'resubmit',
          unitId: secondUnit,
          userId: firstPerson.id,
          documentType: 'CNH',
          files: [file],
        }),
        true,
      ),
    );
    assert(replacement.id);
    await assert.rejects(unitAccess(firstPerson, firstUnit, undefined, pool), status(403));
    await transaction((client) =>
      saveIdentityPolicy(client, companyAdmin, { unitId: firstUnit, enabled: false, version: 2 }),
    );
    await unitAccess(firstPerson, firstUnit, undefined, pool);
    await assertExecutorsValidated(pool, firstUnit, [{ userId: firstPerson.id }]);
    const {
      rows: [stored],
    } = await pool.query<{ count: number }>(
      'SELECT count(*)::int count FROM executor_identity_files',
    );
    assert.equal(stored.count, 6);
    assert.equal(
      (await personalIdentityState(pool, firstPerson.id, company, contractor, false)).status,
      'disabled',
    );
    await pool.query(
      await readFile(new URL('../db/018-identity-upload-policy.sql', import.meta.url), 'utf8'),
    );
    assert.deepEqual(await readIdentityPolicy(pool, company), { enabled: false, version: 3 });
  } finally {
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
