import { currentUser, unitAccess, assertContractorAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiError } from '@/lib/http';
import { HttpError } from '@/lib/security';
import { uuid } from '@/lib/validation';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    const { id } = await context.params;
    uuid.parse(id);
    const {
      rows: [document],
    } = await db.query('SELECT * FROM documents WHERE id=$1', [id]);
    if (!document) throw new HttpError(404, 'Documento não encontrado.');
    const unit = await unitAccess(user, document.unit_id);
    assertContractorAccess(unit, document.contractor_id);
    if (
      unit.role === 'executante' &&
      document.created_by !== user.id &&
      !(document.kind === 'APR' && document.status === 'aprovado') &&
      !document.data.executors.some((e: { userId: string }) => e.userId === user.id)
    )
      throw new HttpError(403, 'Sem acesso ao histórico deste documento.');
    const { rows: versions } = await db.query(
      `
      SELECT v.version,v.created_at,
        CASE WHEN bool_or(a.decision='rejeitado') THEN 'rejeitado'
          WHEN count(a.id)>0 AND bool_and(a.decision IS NOT NULL AND a.decision='aprovado') THEN 'aprovado'
          ELSE 'em_aprovacao' END status
      FROM document_versions v LEFT JOIN approvals a ON a.document_id=v.document_id AND a.version=v.version
      WHERE v.document_id=$1 AND ($2::uuid IS NULL OR v.snapshot->>'contractor_id'=$2::text) GROUP BY v.version,v.created_at ORDER BY v.version DESC`,
      [id, unit.contractor_id],
    );
    const { rows: events } = await db.query(
      "SELECT e.action,e.details,e.occurred_at,u.name actor FROM audit_events e JOIN users u ON u.id=e.actor_id WHERE e.document_id=$1 AND ($2::uuid IS NULL OR e.details->>'version'=ANY($3::text[])) ORDER BY e.occurred_at DESC,e.id DESC",
      [
        id,
        unit.contractor_id,
        [...versions.map((v) => String(v.version)), String(document.version)],
      ],
    );
    return Response.json({ versions, events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
