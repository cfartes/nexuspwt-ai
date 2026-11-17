import { z } from 'zod';
import { currentUser, unitAccess } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { assertOrigin, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { uuid, documentSchema, submissionErrors } from '@/lib/validation';
import { aprProfiles, ptProfiles } from '@/lib/forms';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const { id } = await context.params;
    uuid.parse(id);
    const input = z
      .object({
        action: z.enum(['submit', 'approve', 'reject']),
        version: z.number().int().positive(),
        comment: z.string().trim().max(2000).default(''),
      })
      .parse(await request.json());
    await transaction(async (c) => {
      const {
        rows: [d],
      } = await c.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [id]);
      if (!d) throw new HttpError(404, 'Documento não encontrado.');
      const unit = await unitAccess(user, d.unit_id, undefined, c);
      if (d.version !== input.version)
        throw new HttpError(409, 'Versão desatualizada. Recarregue o documento.');
      if (input.action === 'submit') {
        if (d.created_by !== user.id && !['admin', 'gestor'].includes(unit.role))
          throw new HttpError(403, 'Sem permissão para enviar.');
        if (d.status !== 'rascunho')
          throw new HttpError(409, 'Somente rascunhos podem ser enviados.');
        const data = documentSchema.parse({
          id: d.id,
          unitId: d.unit_id,
          contractorId: d.contractor_id,
          kind: d.kind,
          title: d.title,
          location: d.location,
          startsAt: d.starts_at.toISOString().slice(0, 10),
          endsAt: d.ends_at.toISOString().slice(0, 10),
          aprId: d.apr_id,
          version: d.version,
          data: d.data,
        });
        const errors = submissionErrors(data);
        if (errors.length) throw new HttpError(400, errors.join(' '));
        // PT liberation requires a validated client policy and signed-document integration; no provisional bypass.
        if (d.kind === 'PT')
          throw new HttpError(
            422,
            'Liberação da PT ainda depende das regras de segurança do contratante e da integração de assinaturas. O preenchimento pode ser salvo como rascunho.',
          );
        const profiles = d.kind === 'APR' ? aprProfiles : ptProfiles;
        const { rows: assignments } = await c.query(
          'SELECT DISTINCT ON(profile) a.* FROM approvers a JOIN users u ON u.id=a.user_id AND u.active JOIN memberships m ON m.user_id=a.user_id AND m.unit_id=$2 WHERE a.company_id=$1 AND (a.unit_id=$2 OR a.region_id=$3) ORDER BY profile,a.unit_id NULLS LAST',
          [unit.company_id, unit.id, unit.region_id],
        );
        if (profiles.some((p) => !assignments.some((a) => a.profile === p)))
          throw new HttpError(400, 'Cadastre um aprovador para cada perfil deste documento.');
        await c.query(
          'INSERT INTO document_versions(document_id,version,snapshot) VALUES($1,$2,$3)',
          [id, d.version, JSON.stringify(d)],
        );
        for (const profile of profiles) {
          const a = assignments.find((a) => a.profile === profile);
          await c.query(
            'INSERT INTO approvals(document_id,version,profile,user_id) VALUES($1,$2,$3,$4)',
            [id, d.version, profile, a.user_id],
          );
        }
        await c.query("UPDATE documents SET status='em_aprovacao',updated_at=now() WHERE id=$1", [
          id,
        ]);
      } else {
        if (d.status !== 'em_aprovacao')
          throw new HttpError(409, 'Documento não está em aprovação.');
        if (input.action === 'reject' && !input.comment)
          throw new HttpError(400, 'Informe o motivo da rejeição.');
        const decision = input.action === 'approve' ? 'aprovado' : 'rejeitado';
        const { rowCount } = await c.query(
          'UPDATE approvals SET decision=$4,comment=$5,decided_at=now() WHERE document_id=$1 AND version=$2 AND user_id=$3 AND decision IS NULL',
          [id, d.version, user.id, decision, input.comment],
        );
        if (!rowCount) throw new HttpError(403, 'Não há aprovação pendente para você.');
        const {
          rows: [counts],
        } = await c.query(
          'SELECT count(*) FILTER(WHERE decision IS NULL)::int pending FROM approvals WHERE document_id=$1 AND version=$2',
          [id, d.version],
        );
        if (input.action === 'reject' || counts.pending === 0)
          await c.query('UPDATE documents SET status=$2,updated_at=now() WHERE id=$1', [
            id,
            input.action === 'reject' ? 'rejeitado' : 'aprovado',
          ]);
      }
      await c.query(
        'INSERT INTO audit_events(document_id,actor_id,action,details) VALUES($1,$2,$3,$4)',
        [
          id,
          user.id,
          `workflow.${input.action}`,
          JSON.stringify({ version: d.version, comment: input.comment }),
        ],
      );
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
