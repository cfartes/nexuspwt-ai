import { currentUser, unitAccess, assertContractorAccess } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { assertOrigin, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { documentSchema } from '@/lib/validation';
import { isDeepStrictEqual } from 'node:util';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const d = documentSchema.parse(await request.json());
    const result = await transaction(async (c) => {
      // Keep deletion/access changes from invalidating associations while a document is saved.
      await c.query('SELECT id FROM units WHERE id=$1 FOR KEY SHARE', [d.unitId]);
      const unit = await unitAccess(
        user,
        d.unitId,
        ['admin', 'gestor', 'aprovador', 'executante'],
        c,
      );
      assertContractorAccess(unit, d.contractorId);
      // Serialize creates and retries by client-generated UUID; synchronization is idempotent.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [d.id]);
      const {
        rows: [existing],
      } = await c.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [d.id]);
      if (existing && existing.unit_id !== unit.id)
        throw new HttpError(403, 'Documento indisponível.');
      if (existing?.removed_at)
        throw new HttpError(409, 'APR removida. Não é possível alterar este documento.');
      if (existing) assertContractorAccess(unit, existing.contractor_id);
      if (
        existing?.kind === 'PT' &&
        (existing.contractor_id !== d.contractorId || existing.apr_id !== d.aprId)
      ) {
        const { rowCount } = await c.query('SELECT 1 FROM photos WHERE document_id=$1 LIMIT 1', [
          d.id,
        ]);
        if (rowCount)
          throw new HttpError(
            409,
            'PT com evidências não pode mudar de terceirizada ou APR. Crie uma nova PT.',
          );
      }
      if (existing && existing.created_by !== user.id && !['admin', 'gestor'].includes(unit.role))
        throw new HttpError(403, 'Somente o autor ou gestor pode editar.');
      if (existing && existing.status === 'em_aprovacao')
        throw new HttpError(409, 'Documento em aprovação. Não pode ser alterado.');
      await c.query('SELECT id FROM contractors WHERE id=$1 FOR KEY SHARE', [d.contractorId]);
      const { rowCount: linked } = await c.query(
        'SELECT 1 FROM contractor_units WHERE contractor_id=$1 AND unit_id=$2 FOR KEY SHARE',
        [d.contractorId, unit.id],
      );
      if (!linked) throw new HttpError(400, 'Terceirizada não autorizada nesta unidade.');
      let aprVersion: number | null = null;
      if (d.kind === 'PT') {
        const {
          rows: [apr],
        } = await c.query(
          "SELECT * FROM documents WHERE id=$1 AND unit_id=$2 AND kind='APR' AND removed_at IS NULL FOR SHARE",
          [d.aprId, unit.id],
        );
        if (!apr) throw new HttpError(400, 'APR precisa pertencer à mesma unidade.');
        const preserveLink = existing?.apr_id === d.aprId;
        if (!preserveLink && apr.status !== 'aprovado')
          throw new HttpError(400, 'Selecione uma APR aprovada para vincular a PT.');
        aprVersion = preserveLink ? existing.apr_version : apr.version;
        const {
          rows: [archived],
        } = await c.query(
          'SELECT snapshot FROM document_versions WHERE document_id=$1 AND version=$2',
          [d.aprId, aprVersion],
        );
        if (!archived)
          throw new HttpError(
            409,
            'A APR vinculada não possui uma versão arquivada. Selecione uma APR aprovada.',
          );
        if (archived.snapshot.contractor_id !== d.contractorId)
          throw new HttpError(400, 'APR precisa pertencer à mesma terceirizada.');
        if (
          d.startsAt < archived.snapshot.starts_at.slice(0, 10) ||
          d.endsAt > archived.snapshot.ends_at.slice(0, 10)
        )
          throw new HttpError(400, 'Datas da PT fora do período previsto na APR.');
      }
      for (const executor of d.data.executors) {
        const { rowCount } = await c.query(
          'SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.unit_id=$2 AND u.active AND m.active AND (m.contractor_id IS NULL OR m.contractor_id=$3) FOR KEY SHARE OF u',
          [executor.userId, unit.id, d.contractorId],
        );
        if (!rowCount) throw new HttpError(400, 'Executante sem acesso à unidade.');
      }
      const payload = JSON.stringify(d.data);
      if (existing) {
        if (existing.kind !== d.kind)
          throw new HttpError(400, 'Não é possível trocar o tipo do documento.');
        const same =
          existing.title === d.title &&
          existing.location === d.location &&
          existing.contractor_id === d.contractorId &&
          existing.apr_id === d.aprId &&
          isDeepStrictEqual(existing.data, JSON.parse(payload)) &&
          existing.starts_at.toISOString().slice(0, 10) === d.startsAt &&
          existing.ends_at.toISOString().slice(0, 10) === d.endsAt;
        if (same && existing.status === 'rascunho') return existing;
        if (existing.version !== d.version)
          throw new HttpError(
            409,
            'O documento foi alterado em outro dispositivo. Recarregue e revise os dados antes de salvar.',
          );
        if (existing.status === 'aprovado')
          throw new HttpError(
            409,
            'Documento aprovado é imutável. Use Criar revisão para revisar a APR.',
          );
        const {
          rows: [updated],
        } = await c.query(
          "UPDATE documents SET title=$2,location=$3,starts_at=$4,ends_at=$5,contractor_id=$6,apr_id=$7,apr_version=$8,data=$9,version=version+1,status='rascunho',updated_at=now() WHERE id=$1 RETURNING *",
          [
            d.id,
            d.title,
            d.location,
            d.startsAt,
            d.endsAt,
            d.contractorId,
            d.aprId,
            aprVersion,
            payload,
          ],
        );
        await c.query('INSERT INTO audit_events(document_id,actor_id,action) VALUES($1,$2,$3)', [
          d.id,
          user.id,
          'rascunho.atualizado',
        ]);
        return updated;
      }
      const {
        rows: [created],
      } = await c.query(
        'INSERT INTO documents(id,company_id,unit_id,contractor_id,kind,title,location,starts_at,ends_at,apr_id,apr_version,data,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
        [
          d.id,
          unit.company_id,
          unit.id,
          d.contractorId,
          d.kind,
          d.title,
          d.location,
          d.startsAt,
          d.endsAt,
          d.aprId,
          aprVersion,
          payload,
          user.id,
        ],
      );
      await c.query('INSERT INTO audit_events(document_id,actor_id,action) VALUES($1,$2,$3)', [
        d.id,
        user.id,
        'rascunho.criado',
      ]);
      return created;
    });
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}
