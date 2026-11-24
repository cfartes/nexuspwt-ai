import type { PoolClient } from 'pg';
import { unitAccess, type User } from './auth';
import { HttpError } from './security';
import { canRemovePt } from './permissions';
export async function removeDocument(c: PoolClient, user: User, id: string, version: number) {
  const {
    rows: [target],
  } = await c.query('SELECT unit_id,kind FROM documents WHERE id=$1', [id]);
  if (!target) throw new HttpError(404, 'Documento não encontrado.');
  await c.query('SELECT id FROM units WHERE id=$1 FOR KEY SHARE', [target.unit_id]);
  const unit = await unitAccess(
    user,
    target.unit_id,
    target.kind === 'PT' ? undefined : ['admin'],
    c,
  );
  const {
    rows: [d],
  } = await c.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [id]);
  if (d.kind === 'PT' && !canRemovePt(user, unit, d))
    throw new HttpError(
      403,
      'Somente o autor ou o administrador responsável pode excluir uma PT em rascunho. Fora do rascunho, somente o Superadmin.',
    );
  if (d.removed_at) throw new HttpError(409, `Esta ${d.kind} já foi removida.`);
  if (d.version !== version)
    throw new HttpError(409, `${d.kind} alterada. Atualize a lista antes de remover.`);
  if (d.kind === 'APR') {
    const { rowCount } = await c.query('SELECT 1 FROM documents WHERE apr_id=$1 LIMIT 1', [id]);
    if (rowCount)
      throw new HttpError(409, 'Não é possível remover a APR: existem PTs vinculadas a ela.');
  }
  await c.query('UPDATE documents SET removed_at=now(),removed_by=$2 WHERE id=$1', [id, user.id]);
  await c.query(
    `UPDATE notification_outbox SET status='cancelled',last_error=$2,updated_at=now()
    WHERE id IN (SELECT id FROM notification_outbox WHERE document_id=$1 AND status IN ('pending','blocked') FOR UPDATE SKIP LOCKED)`,
    [id, `${d.kind} removida.`],
  );
  await c.query(
    'INSERT INTO audit_events(document_id,actor_id,action,details) VALUES($1,$2,$3,$4)',
    [
      id,
      user.id,
      d.kind === 'PT' ? 'pt.removida' : 'apr.removida',
      JSON.stringify({ version: d.version, unitId: d.unit_id, number: d.number }),
    ],
  );
}
