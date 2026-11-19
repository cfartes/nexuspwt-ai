import type { PoolClient } from 'pg';
import { type User, unitAccess } from './auth';
import { HttpError } from './security';

export async function eligibleApprover(
  client: PoolClient,
  userId: string,
  unitId: string,
  regional = false,
  contractorId?: string,
) {
  const {
    rows: [member],
  } = await client.query(
    `SELECT m.contractor_id FROM memberships m JOIN users u ON u.id=m.user_id AND u.active
    WHERE m.user_id=$1 AND m.unit_id=$2 AND m.active AND m.role IN ('admin','gestor','aprovador','seguranca_trabalho')`,
    [userId, unitId],
  );
  if (!member)
    throw new HttpError(
      400,
      'Vincule o novo aprovador à unidade com acesso ativo e perfil habilitado.',
    );
  if (regional && member.contractor_id)
    throw new HttpError(400, 'Aprovador regional deve pertencer à equipe própria.');
  if (contractorId && member.contractor_id && member.contractor_id !== contractorId)
    throw new HttpError(400, 'O aprovador não possui acesso à terceirizada deste documento.');
}
export async function grantRegionalAccess(client: PoolClient, userId: string, regionId: string) {
  await client.query(
    `INSERT INTO memberships(user_id,unit_id,role)
    SELECT $1::uuid,id,'aprovador' FROM units WHERE region_id=$2
    AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.unit_id=units.id AND m.user_id=$1)
    ON CONFLICT DO NOTHING`,
    [userId, regionId],
  );
}
export async function updateApprover(
  client: PoolClient,
  actor: User,
  unitId: string,
  input: { id: string; version: number; userId: string; active: boolean; reason: string },
) {
  const unit = await unitAccess(actor, unitId, ['admin'], client);
  const {
    rows: [assignment],
  } = await client.query(
    `SELECT * FROM approvers WHERE id=$1 AND company_id=$2
    AND (unit_id=$3 OR region_id=$4) FOR UPDATE`,
    [input.id, unit.company_id, unitId, unit.region_id],
  );
  if (!assignment) throw new HttpError(404, 'Atribuição não encontrada nesta unidade ou regional.');
  if (assignment.region_id && !actor.platform_admin && !unit.company_admin)
    throw new HttpError(
      403,
      'Atribuições regionais são gerenciadas pelo administrador da plataforma.',
    );
  if (assignment.version !== input.version)
    throw new HttpError(409, 'A atribuição foi alterada. Recarregue antes de salvar.');
  if (input.active) {
    await eligibleApprover(client, input.userId, unitId, !!assignment.region_id);
    if (assignment.region_id) await grantRegionalAccess(client, input.userId, assignment.region_id);
  } else if (input.userId !== assignment.user_id)
    throw new HttpError(400, 'Para desativar, mantenha o responsável atual.');
  await client.query('UPDATE approvers SET user_id=$2,active=$3,version=version+1 WHERE id=$1', [
    input.id,
    input.userId,
    input.active,
  ]);
  await client.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
    actor.id,
    'aprovador.configuracao_atualizada',
    JSON.stringify({
      unitId,
      assignmentId: assignment.id,
      kind: assignment.kind,
      profile: assignment.profile,
      regionId: assignment.region_id,
      previousUserId: assignment.user_id,
      userId: input.userId,
      active: input.active,
      version: assignment.version + 1,
      reason: input.reason,
    }),
  ]);
}
export async function reassignApproval(
  client: PoolClient,
  actor: User,
  unitId: string,
  input: { id: string; assignmentVersion: number; userId: string; reason: string },
) {
  await unitAccess(actor, unitId, ['admin'], client);
  const {
    rows: [target],
  } = await client.query(
    'SELECT a.document_id FROM approvals a JOIN documents d ON d.id=a.document_id WHERE a.id=$1 AND d.unit_id=$2',
    [input.id, unitId],
  );
  if (!target) throw new HttpError(404, 'Aprovação não encontrada nesta unidade.');
  // Lock the document first, matching the decision endpoint; a decided approval cannot be reassigned.
  const {
    rows: [document],
  } = await client.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [target.document_id]);
  const {
    rows: [approval],
  } = await client.query('SELECT * FROM approvals WHERE id=$1 FOR UPDATE', [input.id]);
  if (
    document.removed_at ||
    document.status !== 'em_aprovacao' ||
    document.version !== approval.version ||
    approval.decision
  )
    throw new HttpError(
      409,
      'Somente aprovações ainda pendentes na versão atual podem ser substituídas.',
    );
  if (approval.assignment_version !== input.assignmentVersion)
    throw new HttpError(409, 'O responsável foi alterado. Recarregue antes de substituir.');
  if (approval.user_id === input.userId) throw new HttpError(400, 'Escolha um novo aprovador.');
  await eligibleApprover(client, input.userId, unitId, false, document.contractor_id);
  const {
    rows: [prior],
  } = await client.query(
    'SELECT EXISTS(SELECT 1 FROM approvals WHERE document_id=$1 AND version=$2 AND user_id=$3 AND decision IS NULL) pending',
    [document.id, document.version, input.userId],
  );
  await client.query(
    'UPDATE approvals SET user_id=$2,assignment_version=assignment_version+1 WHERE id=$1',
    [approval.id, input.userId],
  );
  await client.query(
    `UPDATE notification_outbox SET status='cancelled',last_error='Responsável substituído pelo administrador.',updated_at=now()
    WHERE id IN (SELECT n.id FROM notification_outbox n WHERE n.document_id=$1 AND n.version=$2 AND n.user_id=$3 AND n.status IN ('pending','blocked')
      AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.document_id=n.document_id AND a.version=n.version AND a.user_id=n.user_id AND a.decision IS NULL)
      FOR UPDATE SKIP LOCKED)`,
    [document.id, document.version, approval.user_id],
  );
  await client.query(
    `INSERT INTO notification_outbox(document_id,version,user_id) VALUES($1,$2,$3)
    ON CONFLICT(document_id,version,user_id) DO UPDATE SET status='pending',available_at=now(),last_error=NULL,updated_at=now()
    WHERE $4=false AND notification_outbox.status IN ('sent','blocked','cancelled')`,
    [document.id, document.version, input.userId, prior.pending],
  );
  await client.query(
    'INSERT INTO audit_events(document_id,actor_id,action,details) VALUES($1,$2,$3,$4)',
    [
      document.id,
      actor.id,
      'aprovacao.responsavel_substituido',
      JSON.stringify({
        version: document.version,
        profile: approval.profile,
        previousUserId: approval.user_id,
        userId: input.userId,
        assignmentVersion: approval.assignment_version + 1,
        comment: input.reason,
      }),
    ],
  );
}
