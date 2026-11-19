import { cookies } from 'next/headers';
import { db } from './db';
import { digest, HttpError } from './security';
import type { Pool, PoolClient } from 'pg';
export type User = {
  id: string;
  name: string;
  email: string;
  platform_admin: boolean;
  session_expires_at: string;
};
export async function currentUser(): Promise<User> {
  const token = (await cookies()).get('nexus_session')?.value;
  if (!token) throw new HttpError(401, 'Entre na sua conta para continuar.');
  const {
    rows: [user],
  } = await db.query(
    'SELECT u.id,u.name,u.email,u.platform_admin,s.expires_at session_expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND NOT u.password_pending',
    [digest(token)],
  );
  if (!user) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
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
    `SELECT u.*,c.name company_name,CASE WHEN ca.user_id IS NOT NULL THEN 'admin' ELSE m.role END role,
      CASE WHEN ca.user_id IS NOT NULL THEN NULL ELSE m.contractor_id END contractor_id,(ca.user_id IS NOT NULL) company_admin
      FROM units u JOIN companies c ON c.id=u.company_id
      LEFT JOIN memberships m ON m.unit_id=u.id AND m.user_id=$2 AND m.active
      LEFT JOIN company_admins ca ON ca.company_id=u.company_id AND ca.user_id=$2 AND ca.active
      WHERE u.id=$1 AND (m.user_id IS NOT NULL OR ca.user_id IS NOT NULL)`,
    [unitId, user.id],
  );
  if (!unit || (roles && !roles.includes(unit.role)))
    throw new HttpError(403, 'Sem permissão nesta unidade.');
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
