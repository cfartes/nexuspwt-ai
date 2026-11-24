import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { unitAccess, type User } from './auth';
import { digest, hashPassword, HttpError } from './security';
import { encryptSecret } from './integrations';
import { createInvitation } from './invitations';
import { businessPhone } from './openwa';
import { identitySnapshot } from './approval-security';
import { isContractorManager } from './contractorRoles';
import { contractorRoleValues } from './contractorRoles';
import { savePersonCpf } from './personCpf';

export const executorSubmission = z
  .object({
    action: z.enum(['register', 'resubmit']),
    unitId: z.uuid(),
    userId: z.uuid().optional(),
    name: z.string().trim().min(2).max(200).optional(),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase())
      .optional(),
    phone: z.string().max(25).optional(),
    cpf: z
      .string()
      .regex(/^\d{11}$/)
      .optional(),
    role: z.enum(contractorRoleValues).optional(),
    documentType: z.enum(['RG', 'CNH', 'Passaporte']).default('RG'),
    files: z
      .array(
        z
          .object({
            mime: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
            base64: z.string().min(16).max(7000000),
          })
          .strict(),
      )
      .max(2)
      .default([]),
  })
  .strict();

export function identityFile(file: { mime: string; base64: string }) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)) throw new HttpError(400, 'Arquivo inválido.');
  const bytes = Buffer.from(file.base64, 'base64');
  if (bytes.length < 12 || bytes.length > 5 * 1024 * 1024)
    throw new HttpError(400, 'Cada arquivo deve ter no máximo 5 MB.');
  const mime = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    ? 'image/jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : bytes.subarray(0, 5).toString('ascii') === '%PDF-'
        ? 'application/pdf'
        : null;
  if (mime !== file.mime)
    throw new HttpError(400, 'Envie somente PDF, JPG ou PNG com conteúdo válido.');
  return bytes;
}
export async function identityAccess(c: Pool | PoolClient, user: User, unitId: string) {
  const unit = await unitAccess(user, unitId, ['admin', 'gestor', 'admin_contratada'], c);
  const reviewer = ['admin', 'gestor'].includes(unit.role) && !unit.contractor_id;
  if (!reviewer && !isContractorManager(unit))
    throw new HttpError(403, 'Sem acesso à validação de executores.');
  return { unit, reviewer };
}
export async function submitExecutor(
  c: PoolClient,
  actor: User,
  input: z.infer<typeof executorSubmission>,
  selfService = false,
) {
  const { unit, reviewer } = selfService
    ? { unit: await unitAccess(actor, input.unitId, undefined, c, true), reviewer: false }
    : await identityAccess(c, actor, input.unitId);
  if (
    selfService &&
    (actor.platform_admin ||
      !unit.contractor_id ||
      input.action !== 'resubmit' ||
      input.userId !== actor.id)
  )
    throw new HttpError(403, 'Envie somente o seu próprio documento.');
  if (reviewer)
    throw new HttpError(403, 'O envio deve ser realizado pelo responsável da contratada.');
  if (input.action === 'register' && !input.cpf)
    throw new HttpError(400, 'Informe o CPF do colaborador.');
  if (!unit.identity_upload_enabled && (input.files.length || input.action === 'resubmit'))
    throw new HttpError(403, 'O envio de documentos está desativado nesta empresa.');
  if (input.action === 'resubmit' && !input.files.length)
    throw new HttpError(400, 'Envie o arquivo do documento.');
  const bytes = input.files.map(identityFile);
  await c.query('SELECT id FROM units WHERE id=$1 FOR UPDATE', [unit.id]);
  const fresh = selfService
    ? { unit: await unitAccess(actor, unit.id, undefined, c, true), reviewer: false }
    : await identityAccess(c, actor, unit.id);
  if (fresh.reviewer || fresh.unit.contractor_id !== unit.contractor_id)
    throw new HttpError(403, 'Seu acesso foi alterado. Atualize a tela.');
  if (fresh.unit.identity_upload_enabled !== unit.identity_upload_enabled)
    throw new HttpError(409, 'Configuração alterada. Atualize a tela.');
  let person;
  if (input.action === 'register') {
    if (!input.name || !input.email || !input.phone)
      throw new HttpError(400, 'Informe nome, e-mail e telefone do executor.');
    const phone = businessPhone(input.phone);
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`person:${input.email}`]);
    const {
      rows: [existing],
    } = await c.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [input.email]);
    if (existing) {
      const { rowCount } = await c.query(
        'SELECT 1 FROM memberships WHERE user_id=$1 AND contractor_id=$2',
        [existing.id, unit.contractor_id],
      );
      if (existing.platform_admin || !existing.active || !rowCount)
        throw new HttpError(409, 'E-mail já utilizado em outro cadastro.');
      person = existing;
      const { rowCount: linked } = await c.query(
        'SELECT 1 FROM memberships WHERE user_id=$1 AND unit_id=$2',
        [person.id, unit.id],
      );
      if (linked)
        throw new HttpError(409, 'Executor já cadastrado nesta unidade. Use reenviar documento.');
    } else {
      const {
        rows: [created],
      } = await c.query(
        'INSERT INTO users(name,email,phone,password_hash,password_pending) VALUES($1,$2,$3,$4,true) RETURNING *',
        [input.name, input.email, phone, hashPassword(randomBytes(32).toString('hex'))],
      );
      person = created;
    }
    await c.query(
      'INSERT INTO memberships(user_id,unit_id,role,contractor_id,phone,identity_document_required) VALUES($1,$2,$5,$3,$4,true)',
      [person.id, unit.id, unit.contractor_id, phone, input.role || 'executante'],
    );
    await savePersonCpf(c, person.id, input.cpf!);
  } else {
    if (!input.userId) throw new HttpError(400, 'Selecione o executor.');
    const {
      rows: [existing],
    } = await c.query(
      'SELECT u.* FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.unit_id=$2 AND m.contractor_id=$3 AND m.active AND u.active AND NOT u.platform_admin FOR UPDATE OF m,u',
      [input.userId, unit.id, unit.contractor_id],
    );
    if (!existing) throw new HttpError(403, 'Executor indisponível.');
    person = existing;
  }
  if (!input.files.length) {
    if (person.password_pending) await createInvitation(c, actor.id, person.id, unit.id);
    await c.query(
      "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'executor.cadastrado',$2)",
      [
        actor.id,
        JSON.stringify({ companyId: unit.company_id, unitId: unit.id, userId: person.id }),
      ],
    );
    return { id: null, userId: person.id };
  }
  const {
    rows: [membership],
  } = await c.query(
    'SELECT COALESCE(m.phone,u.phone) phone,m.contractor_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.unit_id=$2 FOR UPDATE OF m',
    [person.id, unit.id],
  );
  const id = randomUUID();
  await c.query(
    'INSERT INTO executor_identity_submissions(id,company_id,unit_id,contractor_id,user_id,document_type,identity_snapshot,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      id,
      unit.company_id,
      unit.id,
      unit.contractor_id,
      person.id,
      input.documentType,
      JSON.stringify(identitySnapshot({ ...person, ...membership })),
      actor.id,
    ],
  );
  for (const [i, b] of bytes.entries()) {
    const fileId = randomUUID();
    await c.query(
      'INSERT INTO executor_identity_files(id,submission_id,mime,sha256,content_ciphertext) VALUES($1,$2,$3,$4,$5)',
      [
        fileId,
        id,
        input.files[i].mime,
        digest(b),
        encryptSecret(b.toString('base64'), fileId, 'identity-document'),
      ],
    );
  }
  await c.query(
    'UPDATE memberships SET identity_verified_at=NULL,identity_verified_by=NULL,identity_snapshot=NULL,version=version+1 WHERE user_id=$1 AND unit_id=$2',
    [person.id, unit.id],
  );
  if (input.action === 'register' && person.password_pending)
    await createInvitation(c, actor.id, person.id, unit.id);
  await c.query(
    "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'executor.documento_enviado',$2)",
    [
      actor.id,
      JSON.stringify({
        companyId: unit.company_id,
        unitId: unit.id,
        userId: person.id,
        id,
        kind: input.documentType,
      }),
    ],
  );
  return { id };
}
export async function reviewExecutor(
  c: PoolClient,
  actor: User,
  input: {
    unitId: string;
    id: string;
    version: number;
    decision: 'approved' | 'rejected';
    reason: string;
  },
) {
  const { unit, reviewer } = await identityAccess(c, actor, input.unitId);
  if (!reviewer)
    throw new HttpError(403, 'Somente o admin ou gestor interno da unidade pode validar.');
  if (!unit.identity_upload_enabled)
    throw new HttpError(403, 'A funcionalidade de documentos está desativada.');
  await c.query('SELECT id FROM units WHERE id=$1 FOR UPDATE', [unit.id]);
  const fresh = await identityAccess(c, actor, unit.id);
  if (!fresh.reviewer) throw new HttpError(403, 'Seu acesso foi alterado. Atualize a tela.');
  const {
    rows: [submission],
  } = await c.query(
    'SELECT s.*,u.name,u.email,COALESCE(m.phone,u.phone) phone,m.contractor_id current_contractor FROM executor_identity_submissions s JOIN users u ON u.id=s.user_id AND u.active JOIN memberships m ON m.user_id=s.user_id AND m.unit_id=s.unit_id AND m.active WHERE s.id=$1 AND s.unit_id=$2 AND s.company_id=$3 FOR UPDATE OF s,m',
    [input.id, unit.id, unit.company_id],
  );
  if (!submission || submission.user_id === actor.id || submission.submitted_by === actor.id)
    throw new HttpError(403, 'Conferência deve ser feita por outro responsável da unidade.');
  const {
    rows: [latest],
  } = await c.query(
    'SELECT id FROM executor_identity_submissions WHERE user_id=$1 AND company_id=$2 AND contractor_id=$3 ORDER BY submitted_at DESC,id DESC LIMIT 1',
    [submission.user_id, unit.company_id, submission.contractor_id],
  );
  if (
    latest.id !== submission.id ||
    submission.status !== 'pending' ||
    submission.version !== input.version
  )
    throw new HttpError(409, 'Documento alterado ou já analisado. Atualize a fila.');
  const snapshot = identitySnapshot(submission);
  if (
    submission.current_contractor !== submission.contractor_id ||
    Object.entries(snapshot).some(([key, value]) => submission.identity_snapshot[key] !== value)
  )
    throw new HttpError(409, 'Dados do executor alterados. Solicite novo envio.');
  await c.query(
    'UPDATE executor_identity_submissions SET status=$2,reason=$3,reviewed_by=$4,reviewed_at=now(),version=version+1 WHERE id=$1',
    [submission.id, input.decision, input.reason, actor.id],
  );
  if (input.decision === 'approved')
    await c.query(
      'UPDATE memberships SET identity_verified_at=now(),identity_verified_by=$3,identity_snapshot=$4,version=version+1 WHERE user_id=$1 AND unit_id=$2',
      [submission.user_id, unit.id, actor.id, JSON.stringify(identitySnapshot(submission))],
    );
  await c.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
    actor.id,
    `executor.documento_${input.decision}`,
    JSON.stringify({
      companyId: unit.company_id,
      unitId: unit.id,
      userId: submission.user_id,
      id: submission.id,
      reason: input.reason,
    }),
  ]);
}
export async function assertExecutorsValidated(
  c: Pool | PoolClient,
  unitId: string,
  executors: { userId: string }[],
) {
  const {
    rows: [policy],
  } = await c.query<{ enabled: boolean }>(
    'SELECT co.identity_upload_enabled enabled FROM companies co JOIN units u ON u.company_id=co.id WHERE u.id=$1',
    [unitId],
  );
  if (!policy?.enabled) return;
  const { rows: people } = await c.query<{
    id: string;
    contractor_id: string | null;
    name: string;
    email: string;
    status: string | null;
    identity_snapshot: { name: string; email: string; contractorId: string } | null;
  }>(
    `SELECT u.id,u.name,u.email,m.contractor_id,s.status,s.identity_snapshot FROM memberships m JOIN users u ON u.id=m.user_id AND u.active
     JOIN units un ON un.id=m.unit_id LEFT JOIN LATERAL(SELECT es.status,es.identity_snapshot FROM executor_identity_submissions es
       WHERE es.user_id=m.user_id AND es.company_id=un.company_id AND es.contractor_id=m.contractor_id ORDER BY es.submitted_at DESC,es.id DESC LIMIT 1) s ON true
     WHERE m.unit_id=$1 AND m.active AND m.user_id=ANY($2::uuid[])`,
    [unitId, executors.map((person) => person.userId)],
  );
  const invalid =
    people.length !== new Set(executors.map((person) => person.userId)).size ||
    people.some(
      (person) =>
        person.contractor_id &&
        (person.status !== 'approved' ||
          person.identity_snapshot?.name !== person.name ||
          person.identity_snapshot?.email !== person.email ||
          person.identity_snapshot?.contractorId !== person.contractor_id),
    );
  if (invalid)
    throw new HttpError(
      422,
      'Há colaborador com documento pendente, recusado ou cadastro alterado. Solicite a validação da unidade.',
    );
}
