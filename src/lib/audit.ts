import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { unitAccess, type User } from './auth';
import { canViewAudit } from './permissions';
import { HttpError } from './security';

export const auditFilters = z
  .object({
    unit: z.uuid().optional(),
    actor: z.uuid().optional(),
    action: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_.]{0,99}$/)
      .optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    before: z
      .string()
      .refine((v) => /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n)
      .optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, 'PerÃ­odo invÃ¡lido.');

// Return an allowlist, never raw audit JSON that could later contain credentials or CPF.
export const auditDetailFields = [
  'name',
  'kind',
  'targetId',
  'id',
  'userId',
  'contractorId',
  'registrationId',
  'role',
  'active',
  'companyAdmin',
  'version',
  'previousVersion',
  'previousEndTime',
  'endTime',
  'profile',
  'previousUserId',
  'comment',
  'reason',
  'method',
  'required',
  'credentialChanged',
  'service',
  'provider',
  'status',
  'enabled',
  'previousLimit',
  'limit',
  'used',
  'phoneChanged',
  'duplicateRiskConfirmed',
] as const;

async function auditScope(
  client: Pool | PoolClient,
  user: User,
  contextUnitId: string,
  filters: z.infer<typeof auditFilters>,
) {
  const unit = await unitAccess(user, contextUnitId, ['admin'], client);
  if (!canViewAudit(unit)) throw new HttpError(403, 'Auditoria restrita ao Admin da Empresa.');
  const company = unit.company_id;
  if (filters.unit) {
    const { rowCount } = await client.query(
      'SELECT 1 FROM units WHERE id=$1 AND company_id=$2 UNION ALL SELECT 1 FROM audit_events WHERE unit_id=$1 AND company_id=$2 LIMIT 1',
      [filters.unit, company],
    );
    if (!rowCount) throw new HttpError(403, 'Unidade indisponÃ­vel nesta empresa.');
  }
  return unit;
}

export type AuditEvent = {
  id: string;
  occurred_at: Date | string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  company_id: string;
  company_name: string;
  unit_id: string | null;
  unit_name: string | null;
  document_id: string | null;
  document_kind: string | null;
  document_number: string | null;
  details: Record<string, string | number | boolean>;
};

async function readAuditEvents(
  client: Pool | PoolClient,
  company: string,
  filters: z.infer<typeof auditFilters>,
  limit: number,
): Promise<AuditEvent[]> {
  const { rows } = await client.query<AuditEvent>(
    `SELECT e.id::text,e.occurred_at,e.action,e.actor_id,e.actor_name,e.company_id,co.name company_name,e.unit_id,e.unit_name,
      e.document_id,d.kind document_kind,d.number document_number,e.details
     FROM audit_events e JOIN companies co ON co.id=e.company_id
     LEFT JOIN documents d ON d.id=e.document_id AND d.company_id=e.company_id
     WHERE e.company_id=$1 AND ($2::uuid IS NULL OR e.unit_id=$2)
       AND ($3::uuid IS NULL OR e.actor_id=$3) AND ($4::text IS NULL OR e.action=$4)
       AND ($5::date IS NULL OR e.occurred_at>=($5::date::timestamp AT TIME ZONE 'America/Sao_Paulo'))
       AND ($6::date IS NULL OR e.occurred_at<(($6::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
       AND ($7::bigint IS NULL OR e.id<$7) ORDER BY e.id DESC LIMIT $8`,
    [
      company,
      filters.unit ?? null,
      filters.actor ?? null,
      filters.action ?? null,
      filters.from ?? null,
      filters.to ?? null,
      filters.before ?? null,
      limit,
    ],
  );
  return rows.map((e) => ({
    ...e,
    details: Object.fromEntries(
      auditDetailFields.flatMap((key) => {
        const value = e.details[key];
        return ['string', 'number', 'boolean'].includes(typeof value) ? [[key, value]] : [];
      }),
    ),
  }));
}

export async function companyAuditExport(
  client: PoolClient,
  user: User,
  contextUnitId: string,
  filters: z.infer<typeof auditFilters>,
) {
  const unit = await auditScope(client, user, contextUnitId, filters);
  async function* events() {
    let before: string | undefined;
    while (true) {
      const batch = await readAuditEvents(client, unit.company_id, { ...filters, before }, 500);
      for (const event of batch) yield event;
      if (batch.length < 500) return;
      before = batch.at(-1)!.id;
    }
  }
  return {
    companyName: unit.company_name as string,
    companyId: unit.company_id as string,
    events: events(),
  };
}

export async function companyAudit(
  client: Pool | PoolClient,
  user: User,
  contextUnitId: string,
  filters: z.infer<typeof auditFilters>,
) {
  const unit = await auditScope(client, user, contextUnitId, filters);
  const company = unit.company_id;
  const rows = await readAuditEvents(client, company, filters, 51);
  const [units, actors, actions] = await Promise.all([
    client.query(
      `SELECT id,name FROM units WHERE company_id=$1 UNION
      SELECT DISTINCT e.unit_id id,COALESCE(e.unit_name,'Unidade removida') name FROM audit_events e
      WHERE e.company_id=$1 AND e.unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM units u WHERE u.id=e.unit_id)
      ORDER BY name,id`,
      [company],
    ),
    client.query(
      `SELECT DISTINCT ON(actor_id) actor_id id,actor_name name FROM audit_events
      WHERE company_id=$1 AND actor_id IS NOT NULL ORDER BY actor_id,id DESC`,
      [company],
    ),
    client.query('SELECT DISTINCT action FROM audit_events WHERE company_id=$1 ORDER BY action', [
      company,
    ]),
  ]);
  const events = rows.slice(0, 50);
  return {
    events,
    units: units.rows,
    actors: actors.rows,
    actions: actions.rows.map((a) => a.action),
    nextCursor: rows.length > 50 ? events.at(-1)!.id : null,
  };
}
