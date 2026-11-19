import type { PoolClient } from 'pg';
import type { User } from './auth';
import { randomBytes } from 'node:crypto';
import { hashPassword, HttpError } from './security';
import { saveMembership } from './memberships';
import { createInvitation } from './invitations';
import { businessPhone } from './openwa';
import type { ContractorDetails } from './contractors';

export async function contractorContact(
  c: PoolClient,
  actor: User,
  unitId: string,
  contractorId: string,
  details: ContractorDetails,
) {
  const { rowCount: managed } = await c.query(
    "SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id AND u.active WHERE m.unit_id=$1 AND m.contractor_id=$2 AND m.role='admin_contratada' AND m.active",
    [unitId, contractorId],
  );
  if (managed) return;
  if (!details.contactName || !details.email || !details.phone)
    throw new HttpError(
      400,
      'Informe nome, e-mail e telefone do responsável da contratada para enviar o convite.',
    );
  const email = details.email.trim().toLowerCase();
  const phone = businessPhone(details.phone);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`person:${email}`]);
  const {
    rows: [existing],
  } = await c.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email]);
  let person = existing;
  if (existing) {
    const { rowCount } = await c.query(
      'SELECT 1 FROM memberships WHERE user_id=$1 AND contractor_id=$2',
      [existing.id, contractorId],
    );
    if (!existing.active || existing.platform_admin || !rowCount)
      throw new HttpError(
        409,
        'E-mail do responsável já utilizado em outro cadastro. Revise o contato antes de conceder acesso.',
      );
    const {
      rows: [local],
    } = await c.query(
      'SELECT role,active,contractor_id FROM memberships WHERE user_id=$1 AND unit_id=$2',
      [existing.id, unitId],
    );
    if (local && local.contractor_id !== contractorId)
      throw new HttpError(409, 'O responsável já possui outro vínculo nesta unidade.');
    if (local?.active && local.role === 'admin_contratada') return;
  } else {
    const {
      rows: [created],
    } = await c.query(
      'INSERT INTO users(name,email,phone,password_hash,password_pending) VALUES($1,$2,$3,$4,true) RETURNING *',
      [details.contactName, email, phone, hashPassword(randomBytes(32).toString('hex'))],
    );
    person = created;
  }
  await saveMembership(c, actor, unitId, person.id, {
    role: 'admin_contratada',
    contractorId,
    phone,
  });
  if (person.password_pending) await createInvitation(c, actor.id, person.id, unitId);
}
