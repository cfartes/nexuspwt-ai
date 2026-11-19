import { cookies } from 'next/headers';
import { db } from './db';
import { digest, HttpError } from './security';
import type { Pool, PoolClient } from 'pg';
import { requiresLoginMfa } from './session-security';
export type User = {
  id: string;
  name: string;
  email: string;
  platform_admin: boolean;
  session_expires_at: string;
  session_authenticated_at?: string;
  session_mfa_verified_at?: string | null;
  session_factor_enabled_at?: string | null;
};
export async function currentUser(): Promise<User> {
  const token = (await cookies()).get('nexus_session')?.value;
  if (!token) throw new HttpError(401, 'Entre na sua conta para continuar.');
  const {
    rows: [user],
  } = await db.query(
    `UPDATE sessions s SET last_seen_at=now() FROM users u WHERE u.id=s.user_id AND s.token_hash=$1 AND s.expires_at>now()
      AND s.last_seen_at>now()-interval '30 minutes' AND u.active AND NOT u.password_pending
      RETURNING u.id,u.name,u.email,u.platform_admin,s.expires_at session_expires_at,s.authenticated_at session_authenticated_at,
      s.mfa_verified_at session_mfa_verified_at,s.factor_enabled_at session_factor_enabled_at`,
    [digest(token)],
  );
  if (!user) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  if (
    !user.platform_admin &&
    !user.session_mfa_verified_at &&
    (await requiresLoginMfa(db, user.id))
  )
    throw new HttpError(401, 'A empresa exige MFA. Entre novamente com o autenticador.');
  return user;
}
export async function unitAccess(
  user: User,
  unitId: string,
  roles?: string[],
  client: Pool | PoolClient = db,
) {
  const {
    rows: [unit],
  } = await client.query(
    `SELECT u.*,c.name company_name,c.approval_mfa_required,CASE WHEN ca.user_id IS NOT NULL THEN 'admin' ELSE m.role END role,
      CASE WHEN ca.user_id IS NOT NULL THEN NULL ELSE m.contractor_id END contractor_id,(ca.user_id IS NOT NULL) company_admin
      FROM units u JOIN companies c ON c.id=u.company_id
      LEFT JOIN memberships m ON m.unit_id=u.id AND m.user_id=$2 AND m.active
      LEFT JOIN company_admins ca ON ca.company_id=u.company_id AND ca.user_id=$2 AND ca.active
      WHERE u.id=$1 AND (m.user_id IS NOT NULL OR ca.user_id IS NOT NULL)`,
    [unitId, user.id],
  );
  if (!unit || (roles && !roles.includes(unit.role)))
    throw new HttpError(403, 'Sem permissão nesta unidade.');
  if (unit.approval_mfa_required && !user.platform_admin && !user.session_mfa_verified_at)
    throw new HttpError(401, 'Entre novamente com o autenticador para acessar esta empresa.');
  return unit;
}
export async function assertDocumentRead(
  client: Pool | PoolClient,
  user: User,
  unit: { role: string; contractor_id: string | null },
  document: {
    id: string;
    contractor_id: string;
    created_by: string;
    kind: string;
    status: string;
    version: number;
    data: { executors: { userId: string }[] };
  },
  approved = false,
) {
  assertContractorAccess(unit, document.contractor_id);
  if (unit.role === 'admin_contratada')
    throw new HttpError(403, 'Este perfil administra somente os executores da contratada.');
  if (unit.role === 'aprovador') {
    const { rowCount } = await client.query(
      'SELECT 1 FROM approvals WHERE document_id=$1 AND version=$2 AND user_id=$3',
      [document.id, document.version, user.id],
    );
    if (!rowCount) throw new HttpError(403, 'Documento não atribuído a você.');
  }
  if (
    unit.role === 'executante' &&
    document.created_by !== user.id &&
    !(document.kind === 'APR' && (approved || document.status === 'aprovado')) &&
    !document.data.executors.some((e) => e.userId === user.id)
  )
    throw new HttpError(403, 'Documento indisponível para seu acesso.');
}
export function assertContractorAccess(
  unit: { contractor_id: string | null },
  contractorId: string,
) {
  if (unit.contractor_id && unit.contractor_id !== contractorId)
    throw new HttpError(403, 'Documento indisponível para a terceirizada vinculada ao seu acesso.');
}
