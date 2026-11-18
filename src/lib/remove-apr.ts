import type { PoolClient } from 'pg';
import { unitAccess, type User } from './auth';
import { HttpError } from './security';
export async function removeApr(c: PoolClient, user: User, id: string, version: number) {
  const {
    rows: [target],
  } = await c.query('SELECT unit_id FROM documents WHERE id=$1', [id]);
  if (!target) throw new HttpError(404, 'APR não encontrada.');
  await c.query('SELECT id FROM units WHERE id=$1 FOR KEY SHARE', [target.unit_id]);
  await unitAccess(user, target.unit_id, ['admin'], c);
  const {
    rows: [d],
  } = await c.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [id]);
  if (d.kind !== 'APR') throw new HttpError(400, 'Esta operação permite remover somente APR.');
  if (d.removed_at) throw new HttpError(409, 'Esta APR já foi removida.');
  if (d.version !== version)
    throw new HttpError(409, 'APR alterada. Atualize a lista antes de remover.');
  const { rowCount } = await c.query('SELECT 1 FROM documents WHERE apr_id=$1 LIMIT 1', [id]);
  if (rowCount)
    throw new HttpError(409, 'Não é possível remover a APR: existem PTs vinculadas a ela.');
  await c.query('UPDATE documents SET removed_at=now(),removed_by=$2 WHERE id=$1', [id, user.id]);
  await c.query(
    `UPDATE notification_outbox SET status='cancelled',last_error='APR removida.',updated_at=now()
    WHERE id IN (SELECT id FROM notification_outbox WHERE document_id=$1 AND status IN ('pending','blocked') FOR UPDATE SKIP LOCKED)`,
    [id],
  );
  await c.query(
    'INSERT INTO audit_events(document_id,actor_id,action,details) VALUES($1,$2,$3,$4)',
    [
      id,
      user.id,
      'apr.removida',
      JSON.stringify({ version: d.version, unitId: d.unit_id, number: d.number }),
    ],
  );
}
