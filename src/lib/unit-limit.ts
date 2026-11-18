import type { PoolClient } from 'pg';
import type { User } from './auth';
import { HttpError } from './security';
async function lockedQuota(c: PoolClient, companyId: string) {
  const {
    rows: [company],
  } = await c.query<{ unit_limit: number; unit_limit_version: number }>(
    'SELECT unit_limit,unit_limit_version FROM companies WHERE id=$1 FOR UPDATE',
    [companyId],
  );
  if (!company) throw new HttpError(404, 'Empresa não encontrada.');
  // Count after acquiring the company lock so concurrent creations see committed usage.
  const {
    rows: [usage],
  } = await c.query<{ used: number }>('SELECT count(*)::int used FROM units WHERE company_id=$1', [
    companyId,
  ]);
  return { ...company, used: usage.used };
}
export async function assertUnitCapacity(c: PoolClient, companyId: string) {
  const quota = await lockedQuota(c, companyId);
  if (quota.used >= quota.unit_limit)
    throw new HttpError(
      409,
      `Limite de ${quota.unit_limit} unidade(s) da empresa atingido. Solicite a ampliação ao superadmin.`,
    );
}
export async function setUnitLimit(
  c: PoolClient,
  user: User,
  companyId: string,
  limit: number,
  version: number,
) {
  if (!user.platform_admin)
    throw new HttpError(403, 'Somente o superadmin pode alterar o limite de unidades.');
  const quota = await lockedQuota(c, companyId);
  if (quota.unit_limit_version !== version)
    throw new HttpError(409, 'O limite foi alterado. Recarregue as configurações antes de salvar.');
  if (limit < quota.used)
    throw new HttpError(
      409,
      `A empresa já possui ${quota.used} unidade(s). O limite não pode ser menor que essa quantidade.`,
    );
  await c.query(
    'UPDATE companies SET unit_limit=$2,unit_limit_version=unit_limit_version+1 WHERE id=$1',
    [companyId, limit],
  );
  await c.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
    user.id,
    'empresa.limite_unidades_alterado',
    JSON.stringify({
      companyId,
      previousLimit: quota.unit_limit,
      limit,
      used: quota.used,
      version: version + 1,
    }),
  ]);
}
