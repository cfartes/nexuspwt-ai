import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { encryptSecret, decryptSecret } from '../src/lib/integrations';
import { type User, unitAccess } from '../src/lib/auth';
import {
  contractorRegistrationData,
  inviteContractor,
  registrationByToken,
  registrationPayload,
  reviewContractorRegistration,
  submitContractorRegistration,
} from '../src/lib/contractorRegistration';
import { processContractorRegistrationInvite } from '../src/lib/contractorRegistrationDelivery';
import { aprResponsibles } from '../src/lib/apr-responsibles';
import { identityAccess } from '../src/lib/executor-identities';
import { allowedMenus, personRoleLabel } from '../src/lib/permissions';
import { documentSchema } from '../src/lib/validation';

await test('contratada por convite: sem acesso antes da conferência, três perfis, CPF privado, arquivos, isolamento e provisionamento atômico', async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'c'.repeat(64);
  process.env.APP_URL = 'https://nexus.example';
  const embedded = new PGlite();
  for (const file of (await readdir(new URL('../db/', import.meta.url)))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    await embedded.exec(await readFile(new URL('../db/' + file, import.meta.url), 'utf8'));
  const socket = new PGLiteSocketServer({ db: embedded, host: '127.0.0.1', port: 55451 });
  await socket.start();
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55451/postgres',
    max: 2,
  });
  const insert = async (sql: string, values: unknown[] = []) =>
    (await pool.query<{ id: string }>(sql, values)).rows[0].id;
  const transaction = async <T>(callback: (client: pg.PoolClient) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  const request = mock.method(globalThis, 'fetch', async () =>
    Response.json({ id: 'simulated-email' }),
  );
  try {
    const company = await insert("INSERT INTO companies(name) VALUES('Contratante') RETURNING id");
    const unit = await insert(
      "INSERT INTO units(company_id,name,kind) VALUES($1,'U1','CDD') RETURNING id",
      [company],
    );
    const secondUnit = await insert(
      "INSERT INTO units(company_id,name,kind) VALUES($1,'U2','CDD') RETURNING id",
      [company],
    );
    const actorId = await insert(
      "INSERT INTO users(name,email,password_hash) VALUES('Gestor interno','gestor@internal.test','hash') RETURNING id",
    );
    await pool.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'gestor')", [
      actorId,
      unit,
    ]);
    const actor: User = {
      id: actorId,
      name: 'Gestor interno',
      email: 'gestor@internal.test',
      platform_admin: false,
      session_expires_at: new Date(Date.now() + 3600000).toISOString(),
    };
    const { id } = await transaction((client) =>
      inviteContractor(client, actor, unit, 'responsavel@contractor.test'),
    );
    const invitation = (
      await pool.query<{ token_ciphertext: string }>(
        'SELECT token_ciphertext FROM contractor_registrations WHERE id=$1',
        [id],
      )
    ).rows[0];
    const token = decryptSecret(invitation.token_ciphertext, id, 'contractor-registration-token');
    assert(!invitation.token_ciphertext.includes(token));
    await assert.rejects(registrationByToken(pool, 'bad-token'), /Link inválido/);
    await assert.rejects(
      transaction((client) => inviteContractor(client, actor, unit, 'responsavel@contractor.test')),
      /Já existe/,
    );
    assert.equal(await processContractorRegistrationInvite(pool), true);
    assert.equal(request.mock.callCount(), 0);
    await pool.query(
      'INSERT INTO email_gateway(singleton,sender,secret_ciphertext,updated_by) VALUES(true,$1,$2,$3)',
      ['acesso@verified.test', encryptSecret('re_test', 'platform', 'resend'), actorId],
    );
    await pool.query('UPDATE contractor_registrations SET available_at=now() WHERE id=$1', [id]);
    assert.equal(await processContractorRegistrationInvite(pool), true);
    assert.equal(request.mock.callCount(), 1);
    assert.equal(
      (await pool.query('SELECT delivery_status FROM contractor_registrations WHERE id=$1', [id]))
        .rows[0].delivery_status,
      'sent',
    );
    assert.equal(await processContractorRegistrationInvite(pool), false);
    const data = contractorRegistrationData.parse({
      name: 'Contratada externa',
      cnpj: '12345678000195',
      details: {
        contactName: 'Responsável externo',
        email: 'responsavel@contractor.test',
        phone: '11988887777',
        cep: '01001000',
        street: 'Praça da Sé',
        number: '1',
        district: 'Sé',
        city: 'São Paulo',
        state: 'SP',
      },
      people: [
        {
          name: 'Gestor externo',
          cpf: '52998224725',
          email: 'responsavel@contractor.test',
          phone: '11988887777',
          role: 'gestor',
        },
        {
          name: 'Segurança externa',
          cpf: '11144477735',
          email: 'seguranca@contractor.test',
          phone: '11988887776',
          role: 'seguranca_trabalho',
        },
        {
          name: 'Executor externo',
          cpf: '12345678909',
          email: 'executor@contractor.test',
          phone: '11988887775',
          role: 'executante',
        },
      ],
    });
    assert(
      !contractorRegistrationData.safeParse({
        ...data,
        people: [{ ...data.people[0], role: 'admin' }],
      }).success,
    );
    assert(
      !contractorRegistrationData.safeParse({
        ...data,
        people: [{ ...data.people[0], cpf: '00000000000' }],
      }).success,
    );
    const card = {
      mime: 'application/pdf' as const,
      base64: Buffer.from('%PDF-1.7\nCartao de teste').toString('base64'),
    };
    await assert.rejects(
      transaction((client) =>
        submitContractorRegistration(client, token, 1, {
          ...data,
          details: { ...data.details, email: 'other@contractor.test' },
          people: data.people.map((person, index) =>
            index === 0 ? { ...person, email: 'other@contractor.test' } : person,
          ),
        }),
      ),
      /mesmo que recebeu/,
    );
    await assert.rejects(
      transaction((client) =>
        submitContractorRegistration(client, token, 1, data, { ...card, mime: 'image/jpeg' }),
      ),
      /conteúdo válido/,
    );
    await transaction((client) => submitContractorRegistration(client, token, 1, data, card));
    const submitted = await registrationByToken(pool, token);
    assert.equal(submitted.status, 'submitted');
    assert(!submitted.payload_ciphertext?.includes(data.people[0].cpf));
    assert.equal(registrationPayload(submitted)?.people[0].role, 'gestor');
    assert.equal((await pool.query('SELECT count(*)::int total FROM users')).rows[0].total, 1);
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM contractor_units')).rows[0].total,
      0,
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM user_invitations')).rows[0].total,
      0,
    );
    await assert.rejects(
      transaction((client) =>
        reviewContractorRegistration(client, actor, secondUnit, id, 2, 'approve', 'Conferido'),
      ),
      /permissão/,
    );
    await transaction((client) =>
      reviewContractorRegistration(
        client,
        actor,
        unit,
        id,
        2,
        'changes',
        'Corrigir endereço informado',
      ),
    );
    await transaction((client) => submitContractorRegistration(client, token, 3, data, card));
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM contractor_registration_cards')).rows[0]
        .total,
      2,
    );
    await assert.rejects(
      transaction((client) =>
        reviewContractorRegistration(client, actor, unit, id, 2, 'approve', 'Conferido'),
      ),
      /já conferida/,
    );
    await transaction((client) =>
      reviewContractorRegistration(
        client,
        actor,
        unit,
        id,
        4,
        'approve',
        'CNPJ e colaboradores conferidos',
      ),
    );
    const approved = await registrationByToken(pool, token);
    assert.equal(approved.status, 'approved');
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM user_invitations')).rows[0].total,
      3,
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM invitation_deliveries')).rows[0].total,
      6,
    );
    const employees = (
      await pool.query<{ id: string; role: string; contractor_id: string; cpf_ciphertext: string }>(
        'SELECT u.id,m.role,m.contractor_id,s.cpf_ciphertext FROM users u JOIN memberships m ON m.user_id=u.id JOIN user_security s ON s.user_id=u.id WHERE m.contractor_id IS NOT NULL ORDER BY u.email',
      )
    ).rows;
    assert.deepEqual(employees.map((person) => person.role).sort(), [
      'executante',
      'gestor',
      'seguranca_trabalho',
    ]);
    const manager = employees.find((person) => person.role === 'gestor')!;
    const safety = employees.find((person) => person.role === 'seguranca_trabalho')!;
    assert(!manager.cpf_ciphertext.includes(data.people[0].cpf));
    const external = { ...actor, id: manager.id, platform_admin: false };
    const access = await unitAccess(external, unit, undefined, pool);
    assert(allowedMenus(external, access).includes('team'));
    assert(!allowedMenus(external, access).includes('settings'));
    assert.equal(personRoleLabel('gestor', manager.contractor_id), 'Gestor Contratada');
    await assert.rejects(
      transaction((client) => inviteContractor(client, external, unit, 'other@test.test')),
      /equipe interna/,
    );
    await transaction(async (client) => {
      assert.equal((await identityAccess(client, external, unit)).reviewer, false);
      await aprResponsibles(
        client,
        documentSchema.parse({
          id: crypto.randomUUID(),
          title: 'Serviço teste',
          location: 'Área teste',
          startsAt: '2026-11-24',
          endsAt: '2026-11-25',
          aprId: null,
          version: 0,
          kind: 'APR',
          unitId: unit,
          contractorId: manager.contractor_id,
          data: {
            answers: { companyUserId: manager.id, safetyUserId: safety.id },
            types: [],
            ppe: [],
            risks: [],
            executors: [],
          },
        }),
        true,
      );
    });
    await assert.rejects(
      transaction((client) => submitContractorRegistration(client, token, 5, data)),
      /já enviada/,
    );
    const conflicting = await transaction((client) =>
      inviteContractor(client, actor, unit, actor.email),
    );
    const conflictingRow = (
      await pool.query<{ token_ciphertext: string }>(
        'SELECT token_ciphertext FROM contractor_registrations WHERE id=$1',
        [conflicting.id],
      )
    ).rows[0];
    const conflictingToken = decryptSecret(
      conflictingRow.token_ciphertext,
      conflicting.id,
      'contractor-registration-token',
    );
    await transaction((client) =>
      submitContractorRegistration(client, conflictingToken, 1, {
        ...data,
        cnpj: '98765432000199',
        details: { ...data.details, email: actor.email },
        people: [{ ...data.people[0], email: actor.email, cpf: '93541134780' }],
      }),
    );
    await assert.rejects(
      transaction((client) =>
        reviewContractorRegistration(
          client,
          actor,
          unit,
          conflicting.id,
          2,
          'approve',
          'Cadastro conferido',
        ),
      ),
      /outro cadastro/,
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM contractors')).rows[0].total,
      1,
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM contractor_units')).rows[0].total,
      1,
    );
    assert.equal((await registrationByToken(pool, conflictingToken)).status, 'submitted');
    // Existing accounts retain their passwords when the same contractor is approved in another unit.
    await pool.query('UPDATE users SET password_pending=false');
    await pool.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
      actorId,
      secondUnit,
    ]);
    const second = await transaction((client) =>
      inviteContractor(client, actor, secondUnit, 'responsavel@contractor.test'),
    );
    const secondRow = (
      await pool.query<{ token_ciphertext: string }>(
        'SELECT token_ciphertext FROM contractor_registrations WHERE id=$1',
        [second.id],
      )
    ).rows[0];
    const secondToken = decryptSecret(
      secondRow.token_ciphertext,
      second.id,
      'contractor-registration-token',
    );
    await transaction((client) => submitContractorRegistration(client, secondToken, 1, data));
    await transaction((client) =>
      reviewContractorRegistration(
        client,
        actor,
        secondUnit,
        second.id,
        2,
        'approve',
        'Vínculo com segunda unidade conferido',
      ),
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM contractors')).rows[0].total,
      1,
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int total FROM contractor_units')).rows[0].total,
      2,
    );
    assert.equal((await pool.query('SELECT count(*)::int total FROM users')).rows[0].total, 4);
  } finally {
    request.mock.restore();
    await pool.end();
    await socket.stop();
    await embedded.close();
  }
});
