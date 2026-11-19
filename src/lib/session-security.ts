import type { User } from './auth';
import { HttpError } from './security';
import type { Pool, PoolClient } from 'pg';

export async function requiresLoginMfa(c: Pool | PoolClient, userId: string) {
  const { rowCount } = await c.query(
    `SELECT 1 FROM companies co WHERE co.approval_mfa_required AND
    (EXISTS(SELECT 1 FROM company_admins ca WHERE ca.company_id=co.id AND ca.user_id=$1 AND ca.active)
    OR EXISTS(SELECT 1 FROM memberships m JOIN units un ON un.id=m.unit_id WHERE un.company_id=co.id AND m.user_id=$1 AND m.active)) LIMIT 1`,
    [userId],
  );
  return !!rowCount;
}
export function sessionEvidence(user: User) {
  if (!user.session_authenticated_at)
    throw new HttpError(401, 'Entre novamente para confirmar sua sessão.');
  return {
    method: user.session_mfa_verified_at ? 'password_totp' : 'password',
    enabledAt: user.session_factor_enabled_at
      ? new Date(user.session_factor_enabled_at).toISOString()
      : null,
    authenticatedAt: new Date(
      user.session_mfa_verified_at || user.session_authenticated_at,
    ).toISOString(),
  };
}
