import type { PoolClient } from 'pg';
import { type User, unitAccess } from './auth';
import { HttpError } from './security';

export async function saveMembership(
  client: PoolClient,
  actor: User,
  unitId: string,
  userId: string,
  input: {
    role: string;
    contractorId: string | null;
    active?: boolean;
    phone?: string;
    version?: number;
  },
) {
  // Serialize membership changes so two administrators cannot remove the last access concurrently.
  await client.query('SELECT id FROM units WHERE id=$1 FOR UPDATE', [unitId]);
  const actorUnit = await unitAccess(actor, unitId, ['admin'], client);
  const { rowCount: existingCompanyAdmin } = await client.query(
    'SELECT 1 FROM company_admins WHERE company_id=$1 AND user_id=$2 AND active',
    [actorUnit.company_id, userId],
  );
  if (
    (input.role === 'admin_empresa' || existingCompanyAdmin) &&
    !actor.platform_admin &&
    !actorUnit.company_admin
  )
    throw new HttpError(403, 'Somente o Admin da empresa pode gerenciar este perfil.');
  if (input.role === 'admin_empresa' && input.contractorId)
    throw new HttpError(400, 'Admin da empresa deve pertencer à equipe própria.');
  const requestedRole = input.role;
  const storedRole = input.role === 'admin_empresa' ? 'admin' : input.role;
  if (storedRole === 'admin_contratada' && !input.contractorId)
    throw new HttpError(400, 'Responsável da contratada exige vínculo com a contratada.');
  const {
    rows: [account],
  } = await client.query('SELECT active,platform_admin FROM users WHERE id=$1', [userId]);
  if (account?.platform_admin && !actor.platform_admin)
    throw new HttpError(403, 'Conta indisponível para administração nesta empresa.');
  if (!account?.active)
    throw new HttpError(
      409,
      'A conta foi excluída ou desativada na plataforma e não pode receber vínculos.',
    );
  const {
    rows: [existing],
  } = await client.query('SELECT * FROM memberships WHERE user_id=$1 AND unit_id=$2 FOR UPDATE', [
    userId,
    unitId,
  ]);
  if (input.version !== undefined && (!existing || existing.version !== input.version))
    throw new HttpError(409, 'O acesso foi alterado. Recarregue antes de salvar.');
  if (input.role === 'admin' && input.contractorId)
    throw new HttpError(400, 'Administrador da unidade deve pertencer à equipe própria.');
  if (input.contractorId) {
    const { rowCount } = await client.query(
      'SELECT 1 FROM contractor_units WHERE contractor_id=$1 AND unit_id=$2',
      [input.contractorId, unitId],
    );
    if (!rowCount) throw new HttpError(400, 'Terceirizada não autorizada nesta unidade.');
  }
  const active = input.active ?? true;
  if (actor.id === userId && !active)
    throw new HttpError(400, 'Peça a outro administrador para desativar seu acesso nesta unidade.');
  if (input.contractorId) {
    const { rowCount } = await client.query(
      'SELECT 1 FROM approvers a JOIN units u ON u.region_id=a.region_id WHERE u.id=$1 AND a.user_id=$2 AND a.active',
      [unitId, userId],
    );
    if (rowCount)
      throw new HttpError(
        409,
        'Aprovador regional precisa permanecer na equipe própria. Ajuste a atribuição regional antes de vincular uma terceirizada.',
      );
  }
  if (existingCompanyAdmin && (requestedRole !== 'admin_empresa' || !active)) {
    const { rowCount: others } = await client.query(
      'SELECT 1 FROM company_admins ca JOIN users u ON u.id=ca.user_id AND u.active AND NOT u.password_pending WHERE ca.company_id=$1 AND ca.user_id<>$2 AND ca.active',
      [actorUnit.company_id, userId],
    );
    if (!others && !actor.platform_admin)
      throw new HttpError(409, 'Defina outro Admin da empresa antes de remover este perfil.');
  }
  if (existing?.active && existing.role === 'admin' && (!active || storedRole !== 'admin')) {
    const {
      rows: [count],
    } = await client.query(
      "SELECT count(*)::int total FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.unit_id=$1 AND m.active AND m.role='admin' AND u.active AND NOT u.password_pending AND m.user_id<>$2",
      [unitId, userId],
    );
    if (count.total === 0)
      throw new HttpError(409, 'A unidade precisa manter pelo menos um administrador ativo.');
  }
  const {
    rows: [saved],
  } = await client.query(
    `INSERT INTO memberships(user_id,unit_id,role,contractor_id,active,phone) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(user_id,unit_id) DO UPDATE SET role=EXCLUDED.role,contractor_id=EXCLUDED.contractor_id,active=EXCLUDED.active,phone=EXCLUDED.phone,version=memberships.version+1,identity_verified_at=NULL,identity_verified_by=NULL,identity_snapshot=NULL RETURNING *`,
    [
      userId,
      unitId,
      storedRole,
      input.contractorId,
      active,
      input.phone === undefined ? (existing?.phone ?? null) : input.phone,
    ],
  );
  if (requestedRole === 'admin_empresa' && active)
    await client.query(
      'INSERT INTO company_admins(company_id,user_id) VALUES($1,$2) ON CONFLICT(company_id,user_id) DO UPDATE SET active=true',
      [actorUnit.company_id, userId],
    );
  else if (existingCompanyAdmin)
    await client.query(
      'UPDATE company_admins SET active=false WHERE company_id=$1 AND user_id=$2',
      [actorUnit.company_id, userId],
    );
  if (
    storedRole === 'executante' &&
    input.contractorId &&
    (!existing || existing.contractor_id !== input.contractorId)
  )
    await client.query(
      'UPDATE memberships SET identity_document_required=true WHERE user_id=$1 AND unit_id=$2',
      [userId, unitId],
    );
  await client.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
    actor.id,
    'acesso.atualizado',
    JSON.stringify({
      unitId,
      userId,
      role: saved.role,
      companyAdmin: requestedRole === 'admin_empresa' && active,
      active: saved.active,
      contractorId: saved.contractor_id,
      version: saved.version,
      phoneChanged: input.phone !== undefined && input.phone !== existing?.phone,
    }),
  ]);
  return saved;
}
