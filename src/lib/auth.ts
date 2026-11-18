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
    'SELECT u.*,c.name company_name,m.role,m.contractor_id FROM units u JOIN companies c ON c.id=u.company_id JOIN memberships m ON m.unit_id=u.id WHERE u.id=$1 AND m.user_id=$2 AND m.active',
    [unitId, user.id],
  );
  if (!unit || (roles && !roles.includes(unit.role)))
    throw new HttpError(403, 'Sem permissão nesta unidade.');
  return unit;
}
export function assertContractorAccess(
  unit: { contractor_id: string | null },
  contractorId: string,
) {
  if (unit.contractor_id && unit.contractor_id !== contractorId)
    throw new HttpError(403, 'Documento indisponível para a terceirizada vinculada ao seu acesso.');
}
