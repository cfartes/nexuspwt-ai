import { z } from 'zod';
import { currentUser, unitAccess, assertContractorAccess } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { assertOrigin, digest, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { uuid, documentSchema, submissionErrors } from '@/lib/validation';
import { aprProfiles, ptProfiles } from '@/lib/forms';
import { aprResponsibles } from '@/lib/apr-responsibles';
import { authenticateDecision, assertDecisionIdentity } from '@/lib/approval-security';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const { id } = await context.params;
    uuid.parse(id);
    const input = z
      .object({
        action: z.enum(['submit', 'approve', 'reject', 'revise']),
        version: z.number().int().positive(),
        comment: z.string().trim().max(2000).default(''),
        password: z.string().max(256).default(''),
        code: z
          .string()
          .regex(/^$|^\d{6}$/)
          .default(''),
      })
      .parse(await request.json());
    let proof: Awaited<ReturnType<typeof authenticateDecision>> | undefined;
    if (['approve', 'reject'].includes(input.action)) {
      const {
        rows: [policy],
      } = await db.query(
        'SELECT c.approval_mfa_required FROM documents d JOIN units un ON un.id=d.unit_id JOIN companies c ON c.id=un.company_id JOIN memberships m ON m.unit_id=un.id AND m.user_id=$2 AND m.active WHERE d.id=$1',
        [id, user.id],
      );
      if (!policy) throw new HttpError(403, 'Documento indisponível.');
      proof = await authenticateDecision(
        db,
        user,
        input.password,
        input.code,
        policy.approval_mfa_required && !user.platform_admin ? 'totp' : 'password',
      );
    }
    await transaction(async (c) => {
      let verification: Record<string, unknown> | undefined;
      const {
        rows: [d],
      } = await c.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [id]);
      if (!d) throw new HttpError(404, 'Documento não encontrado.');
      const unit = await unitAccess(user, d.unit_id, undefined, c);
      assertContractorAccess(unit, d.contractor_id);
      if (d.removed_at)
        throw new HttpError(409, 'APR removida. Não é possível executar ações neste documento.');
      if (d.version !== input.version)
        throw new HttpError(409, 'Versão desatualizada. Recarregue o documento.');
      if (input.action === 'revise') {
        if (unit.role === 'aprovador')
          throw new HttpError(403, 'Aprovador possui acesso somente para consulta e decisão.');
        if (
          d.created_by !== user.id &&
          !['admin', 'gestor', 'seguranca_trabalho'].includes(unit.role)
        )
          throw new HttpError(403, 'Somente o autor ou gestor pode criar uma revisão.');
        if (d.kind !== 'APR' || d.status !== 'aprovado')
          throw new HttpError(409, 'Somente uma APR aprovada pode originar uma nova revisão.');
        if (input.comment.length < 3) throw new HttpError(400, 'Informe o motivo da revisão.');
        // Preserve the approved snapshot before reopening; linked PTs keep their original version.
        await c.query(
          'INSERT INTO document_versions(document_id,version,snapshot) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, d.version, JSON.stringify(d)],
        );
        await c.query(
          "UPDATE documents SET version=version+1,status='rascunho',updated_at=now() WHERE id=$1",
          [id],
        );
      } else if (input.action === 'submit') {
        if (unit.role === 'aprovador')
          throw new HttpError(403, 'Aprovador possui acesso somente para consulta e decisão.');
        if (
          d.created_by !== user.id &&
          !['admin', 'gestor', 'seguranca_trabalho'].includes(unit.role)
        )
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
        const selected = await aprResponsibles(c, data, true);
        const { rows: assignments } = await c.query(
          "SELECT DISTINCT ON(profile) a.* FROM approvers a JOIN users u ON u.id=a.user_id AND u.active JOIN memberships m ON m.user_id=a.user_id AND m.unit_id=$2 AND m.active AND m.role IN ('admin','gestor','aprovador','seguranca_trabalho') WHERE a.company_id=$1 AND a.active AND (a.unit_id=$2 OR a.region_id=$3) AND (m.contractor_id IS NULL OR m.contractor_id=$4) ORDER BY profile,a.unit_id NULLS LAST",
          [unit.company_id, unit.id, unit.region_id, d.contractor_id],
        );
        for (const person of selected) {
          const configured = assignments.findIndex((a) => a.profile === person.profile);
          if (configured >= 0) assignments.splice(configured, 1);
          assignments.push(person);
        }
        if (profiles.some((p) => !assignments.some((a) => a.profile === p)))
          throw new HttpError(400, 'Cadastre um aprovador para cada perfil deste documento.');
        // Congela os contatos do cadastro na versão submetida, sem alterar versões anteriores.
        d.data = data.data;
        await c.query('UPDATE documents SET data=$2 WHERE id=$1', [id, JSON.stringify(d.data)]);
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
        await c.query(
          `INSERT INTO notification_outbox(document_id,version,user_id)
          SELECT DISTINCT document_id,version,user_id FROM approvals WHERE document_id=$1 AND version=$2
          ON CONFLICT DO NOTHING`,
          [id, d.version],
        );
        await c.query("UPDATE documents SET status='em_aprovacao',updated_at=now() WHERE id=$1", [
          id,
        ]);
      } else {
        if (!['admin', 'gestor', 'aprovador', 'seguranca_trabalho'].includes(unit.role))
          throw new HttpError(403, 'Seu perfil não permite registrar decisões de aprovação.');
        if (d.status !== 'em_aprovacao')
          throw new HttpError(409, 'Documento não está em aprovação.');
        if (input.action === 'reject' && !input.comment)
          throw new HttpError(400, 'Informe o motivo da rejeição.');
        verification = await assertDecisionIdentity(c, user, d.unit_id, proof!);
        const {
          rows: [archive],
        } = await c.query(
          'SELECT snapshot::text snapshot FROM document_versions WHERE document_id=$1 AND version=$2',
          [id, d.version],
        );
        if (!archive) throw new HttpError(409, 'Versão arquivada não encontrada.');
        verification.snapshotHash = digest(archive.snapshot);
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
          JSON.stringify({
            version: input.action === 'revise' ? d.version + 1 : d.version,
            ...(input.action === 'revise' ? { previousVersion: d.version } : {}),
            comment: input.comment,
            ...(verification ? { verification } : {}),
          }),
        ],
      );
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
