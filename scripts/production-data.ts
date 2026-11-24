import pg, { type PoolClient } from 'pg';
import { pathToFileURL } from 'node:url';
import { hashPassword } from '../src/lib/security';
import { newPassword } from '../src/lib/password-policy';
import { companyDetails } from '../src/lib/companies';
import { contractorDetails } from '../src/lib/contractors';
import { savePersonCpf } from '../src/lib/personCpf';
import { aprProfiles, ptProfiles } from '../src/lib/forms';

const businessTables = [
  'approvals',
  'audit_events',
  'photos',
  'notification_outbox',
  'document_versions',
  'documents',
  'invitation_deliveries',
  'user_invitations',
  'contractor_registration_cards',
  'contractor_registrations',
  'executor_identity_files',
  'executor_identity_submissions',
  'approvers',
  'company_admins',
  'memberships',
  'company_integrations',
  'contractor_units',
  'contractors',
  'units',
  'regions',
  'companies',
  'sessions',
  'login_attempts',
];
const preservedTables = [
  'users',
  'user_security',
  'email_gateway',
  'whatsapp_gateway',
  'deployment_migrations',
];

async function maintenance<T>(client: PoolClient, run: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL search_path=public');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nexus-schema'))");
    const tables = (
      await client.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      )
    ).rows.map((row) => row.tablename);
    if (
      tables.some((name) => ![...businessTables, ...preservedTables].includes(name)) ||
      [
        ...businessTables,
        ...preservedTables.filter((name) => name !== 'deployment_migrations'),
      ].some((name) => !tables.includes(name))
    )
      throw new Error(
        'Schema diferente do esperado. Nenhum dado foi alterado. Atualize o app e revise as tabelas.',
      );
    await client.query(
      `LOCK TABLE ${[...businessTables, ...preservedTables.filter((name) => tables.includes(name))].join(',')} IN ACCESS EXCLUSIVE MODE`,
    );
    const result = await run();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function superadmins(client: PoolClient) {
  const { rows } = await client.query<{ id: string; email: string }>(
    'SELECT id,email FROM users WHERE platform_admin AND active AND NOT password_pending ORDER BY created_at,id',
  );
  if (!rows.length)
    throw new Error('Não existe Superadmin ativo com senha definida. Operação cancelada.');
  return rows;
}

export async function cleanProductionData(client: PoolClient) {
  return maintenance(client, async () => {
    const roots = await superadmins(client);
    await client.query(`TRUNCATE TABLE ${businessTables.join(',')} RESTART IDENTITY`);
    for (const table of ['email_gateway', 'whatsapp_gateway'])
      await client.query(
        `UPDATE ${table} SET updated_by=$1 WHERE updated_by NOT IN (SELECT id FROM users WHERE platform_admin)`,
        [roots[0].id],
      );
    await client.query(
      'DELETE FROM user_security WHERE user_id IN (SELECT id FROM users WHERE NOT platform_admin)',
    );
    await client.query('DELETE FROM users WHERE NOT platform_admin');
    return { superadmins: roots.map((row) => row.email) };
  });
}

function cpfFor(index: number) {
  let cpf = '900000' + String(index).padStart(3, '0');
  for (const length of [9, 10]) {
    const remainder =
      ([...cpf].reduce((sum, digit, position) => sum + Number(digit) * (length + 1 - position), 0) *
        10) %
      11;
    cpf += remainder === 10 ? '0' : String(remainder);
  }
  return cpf;
}
function cnpjFor(index: number) {
  let cnpj = '9000000' + index + '0001';
  for (const weights of [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ]) {
    const remainder =
      [...cnpj].reduce((sum, digit, position) => sum + Number(digit) * weights[position], 0) % 11;
    cnpj += remainder < 2 ? '0' : String(11 - remainder);
  }
  return cnpj;
}

export async function seedValidationData(client: PoolClient, password: string) {
  newPassword.parse(password);
  return maintenance(client, async () => {
    const roots = await superadmins(client);
    if (
      (
        await client.query(
          'SELECT 1 FROM companies UNION ALL SELECT 1 FROM users WHERE NOT platform_admin LIMIT 1',
        )
      ).rowCount
    )
      throw new Error(
        'A base contém cadastros. A carga de validação exige base limpa e não sobrescreve dados.',
      );
    const address = {
      cep: '01001000',
      street: 'Praça da Sé',
      number: '100',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    };
    const ownerEmail = 'admin.empresa@validacao.example.test';
    const {
      rows: [company],
    } = await client.query<{ id: string }>(
      'INSERT INTO companies(name,cnpj,details,unit_limit) VALUES($1,$2,$3,1) RETURNING id',
      [
        'Empresa Validação Nexus (FICTÍCIA)',
        cnpjFor(1),
        JSON.stringify(
          companyDetails.parse({
            ...address,
            tradeName: 'Validação Nexus',
            contactName: 'Admin Empresa Validação',
            email: ownerEmail,
            phone: '5511000000000',
            municipalityCode: '3550308',
            billingEmail: ownerEmail,
          }),
        ),
      ],
    );
    const {
      rows: [region],
    } = await client.query<{ id: string }>(
      "INSERT INTO regions(company_id,name) VALUES($1,'Regional Validação') RETURNING id",
      [company.id],
    );
    const {
      rows: [unit],
    } = await client.query<{ id: string }>(
      "INSERT INTO units(company_id,region_id,name,kind) VALUES($1,$2,'Unidade Validação','CDD') RETURNING id",
      [company.id, region.id],
    );
    for (const root of roots)
      await client.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
        root.id,
        unit.id,
      ]);
    const users: { name: string; email: string; role: string; cpf: string }[] = [];
    let index = 0;
    const person = async (
      name: string,
      alias: string,
      role: string,
      contractorId: string | null = null,
    ) => {
      const email = alias + '@validacao.example.test';
      const {
        rows: [account],
      } = await client.query<{ id: string }>(
        'INSERT INTO users(name,email,phone,password_hash,password_pending) VALUES($1,$2,$3,$4,false) RETURNING id',
        [name, email, '5511000000000', hashPassword(password)],
      );
      await client.query(
        'INSERT INTO memberships(user_id,unit_id,role,contractor_id,phone) VALUES($1,$2,$3,$4,$5)',
        [account.id, unit.id, role, contractorId, '5511000000000'],
      );
      const cpf = cpfFor(++index);
      await savePersonCpf(client, account.id, cpf);
      users.push({ name, email, role: contractorId ? role + ' (contratada)' : role, cpf });
      return account.id;
    };
    const owner = await person('Admin Empresa Validação', 'admin.empresa', 'admin');
    await client.query('INSERT INTO company_admins(company_id,user_id) VALUES($1,$2)', [
      company.id,
      owner,
    ]);
    const localAdmin = await person('Admin Unidade Validação', 'admin.unidade', 'admin');
    const manager = await person('Gestor Interno Validação', 'gestor', 'gestor');
    const safety = await person('Segurança Interna Validação', 'seguranca', 'seguranca_trabalho');
    const approver = await person('Aprovador Validação', 'aprovador', 'aprovador');
    await person('Executor Interno Validação', 'executor', 'executante');
    let contractorManager = '',
      contractorSafety = '';
    for (const [number, code] of ['alpha', 'beta'].entries()) {
      const contactName = 'Gestor Contratada ' + code;
      const {
        rows: [contractor],
      } = await client.query<{ id: string }>(
        'INSERT INTO contractors(company_id,name,cnpj,details) VALUES($1,$2,$3,$4) RETURNING id',
        [
          company.id,
          'Contratada ' + code.toUpperCase() + ' (FICTÍCIA)',
          cnpjFor(number + 2),
          JSON.stringify(
            contractorDetails.parse({
              ...address,
              tradeName: 'Validação ' + code,
              contactName,
              email: `gestor.${code}@validacao.example.test`,
              phone: '5511000000000',
            }),
          ),
        ],
      );
      await client.query(
        'INSERT INTO contractor_units(company_id,contractor_id,unit_id) VALUES($1,$2,$3)',
        [company.id, contractor.id, unit.id],
      );
      const externalManager = await person(contactName, 'gestor.' + code, 'gestor', contractor.id);
      const externalSafety = await person(
        'Segurança Contratada ' + code,
        'seguranca.' + code,
        'seguranca_trabalho',
        contractor.id,
      );
      await person('Executor Contratada ' + code, 'executor.' + code, 'executante', contractor.id);
      if (number === 0) {
        contractorManager = externalManager;
        contractorSafety = externalSafety;
      }
    }
    for (const [kind, profiles, assignments] of [
      ['APR', aprProfiles, [contractorManager, contractorSafety, safety, manager]],
      ['PT', ptProfiles, [localAdmin, manager, approver]],
    ] as const)
      for (const [position, profile] of profiles.entries())
        await client.query(
          'INSERT INTO approvers(company_id,unit_id,kind,profile,user_id) VALUES($1,$2,$3,$4,$5)',
          [company.id, unit.id, kind, profile, assignments[position]],
        );
    await client.query(
      "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'manutencao.validacao_criada',$2)",
      [
        roots[0].id,
        JSON.stringify({
          unitId: unit.id,
          reason: 'Carga de cadastros fictícios, sem documentos e sem envios.',
        }),
      ],
    );
    return { companyId: company.id, unitId: unit.id, users };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let client: PoolClient | undefined;
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
    if (!['clean', 'seed'].includes(process.argv[2])) throw new Error('Informe clean ou seed.');
    if (process.argv[2] === 'clean' && process.argv[3] !== '--confirmar-limpeza')
      throw new Error('Confirmação da limpeza ausente.');
    client = await pool.connect();
    const result =
      process.argv[2] === 'clean'
        ? await cleanProductionData(client)
        : await seedValidationData(client, process.env.PTW_VALIDATION_PASSWORD || '');
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error(
      'Operação não concluída. Confira se o app está atualizado, se há Superadmin ativo e se a base está limpa para a carga. Senha de validação: mínimo 8 caracteres, maiúscula e símbolo.',
    );
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
