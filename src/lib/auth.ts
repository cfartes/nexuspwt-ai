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
    'SELECT u.id,u.name,u.email,u.platform_admin,s.expires_at session_expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active',
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
    'SELECT u.*,m.role FROM units u JOIN memberships m ON m.unit_id=u.id WHERE u.id=$1 AND m.user_id=$2',
    [unitId, user.id],
  );
  if (!unit || (roles && !roles.includes(unit.role)))
    throw new HttpError(403, 'Sem permissão nesta unidade.');
  return unit;
}
