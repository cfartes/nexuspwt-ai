import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { unitAccess, type User } from './auth';
import { contractorDetails } from './contractors';
import { contractorRoleValues } from './contractorRoles';
import { digest, hashPassword, HttpError } from './security';
import { decryptSecret, encryptSecret } from './integrations';
import { validCpf } from './approval-security';
import { savePersonCpf } from './personCpf';
import { businessPhone } from './openwa';
import { identityFile } from './executor-identities';
import { createInvitation, invitationLink } from './invitations';

const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const contractorRegistrationData = z
  .object({
    name: z.string().trim().min(2).max(200),
    cnpj: z.string().regex(/^\d{14}$/, 'Informe CNPJ com 14 dígitos.'),
    details: contractorDetails,
    people: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(200),
            cpf: z.string().refine(validCpf, 'CPF inválido.'),
            email,
            phone: z.string().min(8).max(25),
            role: z.enum(contractorRoleValues),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((data, context) => {
    if (!data.details.contactName || !data.details.email || !data.details.phone)
      context.addIssue({ code: 'custom', message: 'Informe o contato responsável completo.' });
    for (const field of ['cep', 'street', 'number', 'district', 'city', 'state'] as const)
      if (!data.details[field])
        context.addIssue({ code: 'custom', message: `Preencha o endereço: ${field}.` });
    if (!data.people.some((person) => person.email === data.details.email.toLowerCase()))
      context.addIssue({
        code: 'custom',
        message: 'Inclua o responsável na lista de colaboradores, com CPF e perfil.',
      });
    if (!data.people.some((person) => person.role === 'gestor'))
      context.addIssue({ code: 'custom', message: 'Selecione pelo menos um Gestor Contratada.' });
    if (
      new Set(data.people.map((person) => person.email)).size !== data.people.length ||
      new Set(data.people.map((person) => person.cpf)).size !== data.people.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Não repita e-mail ou CPF entre colaboradores.',
      });
  });
export type ContractorRegistrationData = z.infer<typeof contractorRegistrationData>;
export const registrationCard = z
  .object({
    mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    base64: z.string().max(7000000),
  })
  .strict();
export type RegistrationRow = {
  id: string;
  company_id: string;
  unit_id: string;
  email: string;
  created_by: string;
  token_ciphertext: string;
  expires_at: Date;
  status: 'invited' | 'submitted' | 'changes_requested' | 'approved';
  payload_ciphertext: string | null;
  card_ciphertext: string | null;
  card_mime: string | null;
  card_hash: string | null;
  card_retain_until: Date | null;
  version: number;
  reason: string | null;
  delivery_status: string;
  delivery_error: string | null;
};
export async function registrationAccess(client: Pool | PoolClient, actor: User, unitId: string) {
  const unit = await unitAccess(actor, unitId, ['admin', 'gestor'], client);
  if (unit.contractor_id)
    throw new HttpError(403, 'Somente a equipe interna pode convidar e conferir contratadas.');
  return unit;
}
export function registrationPayload(row: RegistrationRow): ContractorRegistrationData | null {
  return row.payload_ciphertext
    ? contractorRegistrationData.parse(
        JSON.parse(decryptSecret(row.payload_ciphertext, row.id, 'contractor-registration')),
      )
    : null;
}
export function registrationLink(token: string): string {
  return invitationLink(token).replace('/definir-senha#', '/cadastro-contratada#');
}
export async function inviteContractor(
  client: PoolClient,
  actor: User,
  unitId: string,
  recipient: string,
) {
  await registrationAccess(client, actor, unitId);
  const address = email.parse(recipient);
  await client.query('SELECT id FROM units WHERE id=$1 FOR UPDATE', [unitId]);
  const unit = await registrationAccess(client, actor, unitId);
  const { rowCount } = await client.query(
    "SELECT 1 FROM contractor_registrations WHERE unit_id=$1 AND email=$2 AND status<>'approved' AND expires_at>now()",
    [unitId, address],
  );
  if (rowCount)
    throw new HttpError(
      409,
      'Já existe convite aberto para esse e-mail. Consulte a solicitação para reenviar.',
    );
  const id = randomUUID(),
    token = randomBytes(32).toString('hex');
  registrationLink(token);
  await client.query(
    'INSERT INTO contractor_registrations(id,company_id,unit_id,email,created_by,token_hash,token_ciphertext) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      id,
      unit.company_id,
      unitId,
      address,
      actor.id,
      digest(token),
      encryptSecret(token, id, 'contractor-registration-token'),
    ],
  );
  await registrationAudit(client, actor.id, 'contratada.convite_cadastro', unitId, id);
  return { id };
}
export async function registrationByToken(
  client: Pool | PoolClient,
  token: string,
  lock = false,
): Promise<RegistrationRow> {
  if (!/^[a-f\d]{64}$/.test(token)) throw new HttpError(403, 'Link inválido ou expirado.');
  const {
    rows: [row],
  } = await client.query<RegistrationRow>(
    `SELECT * FROM contractor_registrations WHERE token_hash=$1 AND expires_at>now()${lock ? ' FOR UPDATE' : ''}`,
    [digest(token)],
  );
  if (!row)
    throw new HttpError(
      403,
      'Link inválido ou expirado. Solicite novo envio ao responsável da unidade.',
    );
  return row;
}
export async function submitContractorRegistration(
  client: PoolClient,
  token: string,
  version: number,
  input: ContractorRegistrationData,
  card?: z.infer<typeof registrationCard>,
) {
  const row = await registrationByToken(client, token, true);
  if (!['invited', 'changes_requested'].includes(row.status) || row.version !== version)
    throw new HttpError(409, 'Solicitação já enviada ou alterada. Consulte a situação pelo link.');
  const data = contractorRegistrationData.parse(input);
  if (data.details.email.toLowerCase() !== row.email)
    throw new HttpError(400, 'O e-mail do responsável deve ser o mesmo que recebeu o convite.');
  data.details.email = row.email;
  data.details.phone = businessPhone(data.details.phone);
  for (const person of data.people) person.phone = businessPhone(person.phone);
  const bytes = card ? identityFile(card) : null;
  if (bytes && card)
    await client.query(
      'INSERT INTO contractor_registration_cards(registration_id,mime,sha256,content_ciphertext) VALUES($1,$2,$3,$4)',
      [
        row.id,
        card.mime,
        digest(bytes),
        encryptSecret(bytes.toString('base64'), row.id, 'contractor-registration-card'),
      ],
    );
  await client.query(
    "UPDATE contractor_registrations SET payload_ciphertext=$2,status='submitted',submitted_at=now(),reason=NULL,version=version+1,card_ciphertext=COALESCE($3,card_ciphertext),card_mime=COALESCE($4,card_mime),card_hash=COALESCE($5,card_hash),card_retain_until=CASE WHEN $3::text IS NULL THEN card_retain_until ELSE now()+interval '5 years' END WHERE id=$1",
    [
      row.id,
      encryptSecret(JSON.stringify(data), row.id, 'contractor-registration'),
      bytes
        ? encryptSecret(bytes.toString('base64'), row.id, 'contractor-registration-card')
        : null,
      card?.mime ?? null,
      bytes ? digest(bytes) : null,
    ],
  );
  await registrationAudit(client, null, 'contratada.cadastro_enviado', row.unit_id, row.id);
}
async function registrationAudit(
  client: PoolClient,
  actorId: string | null,
  action: string,
  unitId: string,
  id: string,
) {
  await client.query(
    "INSERT INTO audit_events(actor_id,action,details,actor_name) VALUES($1,$2,$3,CASE WHEN $1::uuid IS NULL THEN 'Contratada por link de cadastro' ELSE NULL END)",
    [actorId, action, JSON.stringify({ unitId, registrationId: id })],
  );
}
export async function reviewContractorRegistration(
  client: PoolClient,
  actor: User,
  unitId: string,
  id: string,
  version: number,
  action: 'approve' | 'changes',
  reason: string,
) {
  await registrationAccess(client, actor, unitId);
  await client.query('SELECT id FROM units WHERE id=$1 FOR UPDATE', [unitId]);
  const unit = await registrationAccess(client, actor, unitId);
  const {
    rows: [row],
  } = await client.query<RegistrationRow>(
    'SELECT * FROM contractor_registrations WHERE id=$1 AND unit_id=$2 FOR UPDATE',
    [id, unitId],
  );
  if (!row || row.status !== 'submitted' || row.version !== version)
    throw new HttpError(409, 'Solicitação indisponível ou já conferida. Atualize a lista.');
  if (reason.trim().length < 5) throw new HttpError(400, 'Registre o resultado da conferência.');
  if (action === 'changes') {
    await client.query(
      "UPDATE contractor_registrations SET status='changes_requested',reason=$2,version=version+1,reviewed_by=$3,reviewed_at=now(),expires_at=now()+interval '7 days',delivery_status='pending',available_at=now() WHERE id=$1",
      [id, reason, actor.id],
    );
    await registrationAudit(client, actor.id, 'contratada.cadastro_devolvido', unitId, id);
    return;
  }
  const data = registrationPayload(row);
  if (!data) throw new HttpError(409, 'Cadastro ainda não enviado.');
  const {
    rows: [contractor],
  } = await client.query<{ id: string }>(
    'INSERT INTO contractors(company_id,name,cnpj,details) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,cnpj) DO UPDATE SET name=contractors.name RETURNING id',
    [unit.company_id, data.name, data.cnpj, data.details],
  );
  await client.query(
    'INSERT INTO contractor_units(company_id,contractor_id,unit_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [unit.company_id, contractor.id, unitId],
  );
  for (const person of [...data.people].sort((a, b) => a.email.localeCompare(b.email))) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['person:' + person.email]);
    let account = (
      await client.query<{
        id: string;
        platform_admin: boolean;
        active: boolean;
        password_pending: boolean;
      }>('SELECT id,platform_admin,active,password_pending FROM users WHERE email=$1 FOR UPDATE', [
        person.email,
      ])
    ).rows[0];
    if (account) {
      const { rowCount } = await client.query(
        'SELECT 1 FROM memberships WHERE user_id=$1 AND contractor_id=$2',
        [account.id, contractor.id],
      );
      if (!account.active || account.platform_admin || !rowCount)
        throw new HttpError(
          409,
          'Um e-mail informado já pertence a outro cadastro. Solicite correção antes de aprovar.',
        );
    } else {
      account = (
        await client.query<{
          id: string;
          platform_admin: boolean;
          active: boolean;
          password_pending: boolean;
        }>(
          'INSERT INTO users(name,email,phone,password_hash,password_pending) VALUES($1,$2,$3,$4,true) RETURNING id,platform_admin,active,password_pending',
          [person.name, person.email, person.phone, hashPassword(randomBytes(32).toString('hex'))],
        )
      ).rows[0];
    }
    await savePersonCpf(client, account.id, person.cpf);
    const local = (
      await client.query<{ contractor_id: string | null; role: string }>(
        'SELECT contractor_id,role FROM memberships WHERE user_id=$1 AND unit_id=$2 FOR UPDATE',
        [account.id, unitId],
      )
    ).rows[0];
    if (local && (local.contractor_id !== contractor.id || local.role !== person.role))
      throw new HttpError(
        409,
        'Um colaborador já possui outro perfil nesta unidade. Revise o cadastro existente.',
      );
    await client.query(
      'INSERT INTO memberships(user_id,unit_id,role,contractor_id,phone) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,unit_id) DO UPDATE SET active=true,phone=EXCLUDED.phone,version=memberships.version+1',
      [account.id, unitId, person.role, contractor.id, person.phone],
    );
    if (account.password_pending) await createInvitation(client, actor.id, account.id, unitId);
  }
  await client.query(
    "UPDATE contractor_registrations SET status='approved',contractor_id=$2,reviewed_by=$3,reviewed_at=now(),reason=$4,version=version+1,delivery_status=CASE WHEN delivery_status IN ('pending','blocked') THEN 'cancelled' ELSE delivery_status END WHERE id=$1",
    [id, contractor.id, actor.id, reason],
  );
  await registrationAudit(client, actor.id, 'contratada.cadastro_aprovado', unitId, id);
}
