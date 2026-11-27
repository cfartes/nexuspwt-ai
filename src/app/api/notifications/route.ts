import { z } from 'zod';
import { currentUser, unitAccess, assertContractorAccess } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { uuid } from '@/lib/validation';
import { assertOrigin, HttpError } from '@/lib/security';
import { apiError, readJsonBody } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const user = await currentUser(),
      unitId = uuid.parse(new URL(request.url).searchParams.get('unit'));
    const unit = await unitAccess(user, unitId);
    const { rows } = await db.query(
      `SELECT n.id,n.document_id,n.version,n.status,n.attempts,n.created_at,n.updated_at,n.sent_at,n.last_error,n.recipient_hint,
      d.kind,d.number,u.name recipient FROM notification_outbox n JOIN documents d ON d.id=n.document_id JOIN users u ON u.id=n.user_id
      WHERE d.unit_id=$1 AND ($4::uuid IS NULL OR d.contractor_id=$4) AND ($2=ANY(ARRAY['admin','gestor']) OR n.user_id=$3) ORDER BY n.created_at DESC,n.id DESC LIMIT 100`,
      [unit.id, unit.role, user.id, unit.contractor_id],
    );
    return Response.json(
      { notifications: rows, canRetry: ['admin', 'gestor'].includes(unit.role) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const input = z
      .object({ id: uuid, unitId: uuid, confirmDuplicateRisk: z.boolean().default(false) })
      .strict()
      .parse(await readJsonBody(request));
    const unit = await unitAccess(user, input.unitId, ['admin', 'gestor']);
    await transaction(async (c) => {
      const {
        rows: [job],
      } = await c.query(
        `SELECT n.*,d.unit_id,d.contractor_id,d.version current_version,d.status document_status FROM notification_outbox n
        JOIN documents d ON d.id=n.document_id WHERE n.id=$1 AND d.unit_id=$2 AND d.removed_at IS NULL FOR UPDATE OF n`,
        [input.id, input.unitId],
      );
      if (!job) throw new HttpError(404, 'Notificação não encontrada nesta unidade.');
      assertContractorAccess(unit, job.contractor_id);
      if (!['blocked', 'uncertain'].includes(job.status))
        throw new HttpError(409, 'Esta notificação não está disponível para nova tentativa.');
      if (job.status === 'uncertain' && !input.confirmDuplicateRisk)
        throw new HttpError(
          409,
          'Confira o painel do OpenWA e confirme o risco de duplicidade antes de reenviar.',
        );
      if (job.current_version !== job.version || job.document_status !== 'em_aprovacao')
        throw new HttpError(409, 'A solicitação não está mais pendente nesta versão.');
      const { rowCount } = await c.query(
        'SELECT 1 FROM approvals WHERE document_id=$1 AND version=$2 AND user_id=$3 AND decision IS NULL',
        [job.document_id, job.version, job.user_id],
      );
      if (!rowCount) throw new HttpError(409, 'O destinatário não possui uma aprovação pendente.');
      await c.query(
        "UPDATE notification_outbox SET status='pending',available_at=now(),last_error=NULL,updated_at=now() WHERE id=$1",
        [job.id],
      );
      await c.query(
        'INSERT INTO audit_events(document_id,actor_id,action,details) VALUES($1,$2,$3,$4)',
        [
          job.document_id,
          user.id,
          'notificacao.reenvio_solicitado',
          JSON.stringify({
            notificationId: job.id,
            previousStatus: job.status,
            duplicateRiskConfirmed: input.confirmDuplicateRisk,
          }),
        ],
      );
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
