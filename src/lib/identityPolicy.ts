import type { PoolClient } from 'pg';
import { unitAccess, type User } from './auth';
import { companyManager } from './permissions';
import { HttpError } from './security';
import { updateIdentityPolicy } from './identityPolicyRepository';

export async function saveIdentityPolicy(
  client: PoolClient,
  actor: User,
  input: { unitId: string; enabled: boolean; version: number },
): Promise<void> {
  const unit = await unitAccess(actor, input.unitId, ['admin'], client);
  if (!companyManager(actor, unit))
    throw new HttpError(403, 'Configuração restrita ao Admin da Empresa.');
  if (!(await updateIdentityPolicy(client, unit.company_id, input.enabled, input.version)))
    throw new HttpError(409, 'Configuração alterada. Atualize a tela antes de salvar.');
  await client.query(
    "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'empresa.documentos_configurados',$2)",
    [
      actor.id,
      JSON.stringify({
        companyId: unit.company_id,
        enabled: input.enabled,
        version: input.version + 1,
      }),
    ],
  );
}
