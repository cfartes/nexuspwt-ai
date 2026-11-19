import type { PoolClient } from 'pg';
import { unitAccess, type User } from './auth';
import { saveMembership } from './memberships';
import { HttpError } from './security';

export type RegistrationKind =
  'company' | 'region' | 'unit' | 'contractor' | 'user' | 'approver' | 'account';
export async function deleteRegistration(
  c: PoolClient,
  actor: User,
  input: { unitId: string; kind: RegistrationKind; id: string; version?: number },
) {
  const unit = await unitAccess(actor, input.unitId, ['admin'], c);
  let name = '';
  const stale = () => {
    throw new HttpError(409, 'O cadastro foi alterado. Atualize a lista antes de excluir.');
  };
  const missing = () => {
    throw new HttpError(404, 'Cadastro não encontrado neste contexto.');
  };
  try {
    switch (input.kind) {
      case 'account': {
        if (!actor.platform_admin)
          throw new HttpError(403, 'Somente o superadmin pode excluir usuários da plataforma.');
        if (input.id === actor.id)
          throw new HttpError(409, 'Não é possível excluir sua própria conta.');
        await c.query(
          'SELECT un.id FROM units un JOIN memberships m ON m.unit_id=un.id WHERE m.user_id=$1 ORDER BY un.id FOR UPDATE OF un',
          [input.id],
        );
        await unitAccess(actor, unit.id, ['admin'], c);
        const {
          rows: [row],
        } = await c.query(
          `SELECT u.id,u.name,u.active FROM users u WHERE u.id=$1
          AND EXISTS(SELECT 1 FROM memberships m JOIN units un ON un.id=m.unit_id WHERE m.user_id=u.id AND un.company_id=$2) FOR UPDATE OF u`,
          [input.id, unit.company_id],
        );
        if (!row) missing();
        if (!row.active) throw new HttpError(409, 'Esta conta já foi excluída ou desativada.');
        name = row.name;
        const { rowCount: pending } = await c.query(
          `SELECT 1 FROM approvals a JOIN documents d ON d.id=a.document_id WHERE a.user_id=$1
          AND d.removed_at IS NULL AND d.status='em_aprovacao' AND a.version=d.version AND a.decision IS NULL
          UNION ALL SELECT 1 FROM approvers WHERE user_id=$1 AND active LIMIT 1`,
          [input.id],
        );
        if (pending)
          throw new HttpError(
            409,
            'Substitua as aprovações pendentes e as atribuições ativas antes de excluir o usuário da plataforma.',
          );
        const { rowCount: lastAdmin } = await c.query(
          `SELECT 1 FROM memberships m WHERE m.user_id=$1 AND m.active AND m.role='admin'
          AND NOT EXISTS(SELECT 1 FROM memberships other JOIN users u ON u.id=other.user_id AND u.active AND NOT u.password_pending
            WHERE other.unit_id=m.unit_id AND other.user_id<>$1 AND other.active AND other.role='admin')`,
          [input.id],
        );
        if (lastAdmin)
          throw new HttpError(
            409,
            'O usuário é o único administrador ativo de uma unidade. Defina outro administrador antes de excluir.',
          );
        await c.query('UPDATE users SET active=false WHERE id=$1', [input.id]);
        await c.query('UPDATE company_admins SET active=false WHERE user_id=$1', [input.id]);
        await c.query('UPDATE memberships SET active=false,version=version+1 WHERE user_id=$1', [
          input.id,
        ]);
        await c.query('DELETE FROM sessions WHERE user_id=$1', [input.id]);
        await c.query(
          `UPDATE notification_outbox SET status='cancelled',last_error='Usuário excluído da plataforma.',updated_at=now()
          WHERE id IN (SELECT id FROM notification_outbox WHERE user_id=$1 AND status IN ('pending','blocked') FOR UPDATE SKIP LOCKED)`,
          [input.id],
        );
        await c.query(
          'UPDATE user_invitations SET consumed_at=now(),token_ciphertext=NULL WHERE user_id=$1 AND consumed_at IS NULL',
          [input.id],
        );
        await c.query(
          `UPDATE invitation_deliveries d SET status='cancelled',last_error='Usuário excluído da plataforma.' FROM user_invitations i
          WHERE i.id=d.invitation_id AND i.user_id=$1 AND d.status IN ('pending','blocked')`,
          [input.id],
        );
        break;
      }
      case 'company': {
        if (!actor.platform_admin)
          throw new HttpError(403, 'Somente o superadmin pode excluir empresas.');
        const {
          rows: [row],
        } = await c.query('SELECT * FROM companies WHERE id=$1 FOR UPDATE', [input.id]);
        if (!row) missing();
        name = row.name;
        if (input.version !== undefined && input.version !== row.version) stale();
        const { rowCount } = await c.query(
          "SELECT 1 FROM company_integrations WHERE company_id=$1 AND service='whatsapp' AND COALESCE(settings->>'sessionId','')<>''",
          [input.id],
        );
        if (rowCount)
          throw new HttpError(
            409,
            'A empresa possui uma sessão de WhatsApp vinculada. Encerre e remova o vínculo antes de excluir a empresa.',
          );
        await c.query('DELETE FROM company_integrations WHERE company_id=$1', [input.id]);
        await c.query('DELETE FROM company_admins WHERE company_id=$1', [input.id]);
        await c.query('DELETE FROM companies WHERE id=$1', [input.id]);
        break;
      }
      case 'region': {
        const {
          rows: [row],
        } = await c.query('SELECT * FROM regions WHERE id=$1 AND company_id=$2 FOR UPDATE', [
          input.id,
          unit.company_id,
        ]);
        if (!row) missing();
        name = row.name;
        await c.query('DELETE FROM regions WHERE id=$1', [input.id]);
        break;
      }
      case 'unit': {
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `user-unit-delete:${actor.id}`,
        ]);
        const {
          rows: [row],
        } = await c.query('SELECT * FROM units WHERE id=$1 AND company_id=$2 FOR UPDATE', [
          input.id,
          unit.company_id,
        ]);
        if (!row) missing();
        name = row.name;
        if (!actor.platform_admin) await unitAccess(actor, input.id, ['admin'], c);
        if (input.id === unit.id) {
          const { rowCount } = await c.query(
            'SELECT 1 FROM memberships WHERE user_id=$1 AND unit_id<>$2 AND active',
            [actor.id, input.id],
          );
          if (!rowCount)
            throw new HttpError(
              409,
              'Crie ou obtenha acesso a outra unidade antes de excluir a unidade ativa.',
            );
        }
        const { rowCount: members } = await c.query(
          'SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id AND u.active WHERE m.unit_id=$1 AND m.user_id<>$2',
          [input.id, actor.id],
        );
        if (members)
          throw new HttpError(
            409,
            'A unidade possui outros usuários vinculados. Remova esses acessos antes de excluir.',
          );
        await c.query('DELETE FROM memberships WHERE unit_id=$1', [input.id]);
        await c.query('DELETE FROM units WHERE id=$1', [input.id]);
        break;
      }
      case 'contractor': {
        const {
          rows: [row],
        } = await c.query(
          `SELECT co.* FROM contractors co JOIN contractor_units cu ON cu.contractor_id=co.id
          WHERE co.id=$1 AND co.company_id=$2 AND cu.unit_id=$3 FOR UPDATE OF co`,
          [input.id, unit.company_id, unit.id],
        );
        if (!row) missing();
        if (row.version !== input.version) stale();
        name = row.name;
        const { rowCount: history } = await c.query(
          `SELECT 1 FROM documents d WHERE d.unit_id=$2 AND (d.contractor_id=$1
          OR EXISTS(SELECT 1 FROM document_versions v WHERE v.document_id=d.id AND v.snapshot->>'contractor_id'=$1::text))`,
          [input.id, unit.id],
        );
        if (history)
          throw new HttpError(
            409,
            'Esta contratada possui APR/PT ou revisão histórica nesta unidade e não pode ser excluída.',
          );
        await c.query('DELETE FROM contractor_units WHERE contractor_id=$1 AND unit_id=$2', [
          input.id,
          unit.id,
        ]);
        const { rowCount: references } = await c.query(
          `SELECT 1 FROM contractor_units WHERE contractor_id=$1
          UNION ALL SELECT 1 FROM documents WHERE contractor_id=$1
          UNION ALL SELECT 1 FROM document_versions WHERE snapshot->>'contractor_id'=$1::text LIMIT 1`,
          [input.id],
        );
        if (!references && (actor.platform_admin || unit.company_admin))
          await c.query('DELETE FROM contractors WHERE id=$1', [input.id]);
        break;
      }
      case 'approver': {
        const {
          rows: [row],
        } = await c.query(
          'SELECT * FROM approvers WHERE id=$1 AND company_id=$2 AND (unit_id=$3 OR region_id=$4) FOR UPDATE',
          [input.id, unit.company_id, unit.id, unit.region_id],
        );
        if (!row) missing();
        if (row.version !== input.version) stale();
        if (row.region_id && !actor.platform_admin && !unit.company_admin)
          throw new HttpError(403, 'Somente o superadmin pode excluir uma atribuição regional.');
        name = `${row.kind} · ${row.profile}`;
        await c.query('DELETE FROM approvers WHERE id=$1', [input.id]);
        break;
      }
      case 'user': {
        await c.query('SELECT id FROM units WHERE id=$1 FOR UPDATE', [unit.id]);
        await unitAccess(actor, unit.id, ['admin'], c);
        const {
          rows: [row],
        } = await c.query(
          `SELECT u.id,u.name,u.platform_admin,m.role,m.active,m.contractor_id,m.phone,m.version FROM users u
          JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.unit_id=$2 FOR UPDATE OF u,m`,
          [input.id, unit.id],
        );
        if (!row) missing();
        if (row.platform_admin && !actor.platform_admin)
          throw new HttpError(
            403,
            'Somente o superadmin pode excluir o acesso de uma conta da plataforma.',
          );
        if (row.version !== input.version) stale();
        name = row.name;
        if (input.id === actor.id)
          throw new HttpError(409, 'Não é possível excluir seu próprio acesso.');
        const { rowCount: pending } = await c.query(
          `SELECT 1 FROM approvals a JOIN documents d ON d.id=a.document_id WHERE a.user_id=$1 AND d.unit_id=$2
          AND d.removed_at IS NULL AND d.status='em_aprovacao' AND a.version=d.version AND a.decision IS NULL
          UNION ALL SELECT 1 FROM approvers WHERE user_id=$1 AND active AND (unit_id=$2 OR region_id=$3) LIMIT 1`,
          [input.id, unit.id, unit.region_id],
        );
        if (pending)
          throw new HttpError(
            409,
            'Substitua as aprovações pendentes e ajuste as atribuições de aprovador antes de excluir este acesso.',
          );
        await saveMembership(c, actor, unit.id, input.id, {
          role: row.role,
          contractorId: row.contractor_id,
          phone: row.phone,
          version: row.version,
          active: false,
        });
        await c.query(
          'UPDATE user_invitations SET consumed_at=now(),token_ciphertext=NULL WHERE user_id=$1 AND unit_id=$2 AND consumed_at IS NULL',
          [input.id, unit.id],
        );
        await c.query(
          `UPDATE invitation_deliveries d SET status='cancelled',last_error='Acesso excluído.' FROM user_invitations i
          WHERE i.id=d.invitation_id AND i.user_id=$1 AND i.unit_id=$2 AND d.status IN ('pending','blocked')`,
          [input.id, unit.id],
        );
        await c.query('DELETE FROM memberships WHERE user_id=$1 AND unit_id=$2', [
          input.id,
          unit.id,
        ]);
        const { rowCount: otherUnits } = await c.query(
          'SELECT 1 FROM memberships WHERE user_id=$1',
          [input.id],
        );
        if (!otherUnits) {
          const { rowCount: executorHistory } = await c.query(
            `SELECT 1 FROM documents WHERE data->'executors' @> $1::jsonb
            UNION ALL SELECT 1 FROM document_versions WHERE snapshot->'data'->'executors' @> $1::jsonb LIMIT 1`,
            [JSON.stringify([{ userId: input.id }])],
          );
          if (executorHistory)
            throw new HttpError(
              409,
              'O usuário consta como executante em documentos ou revisões históricas. Desative o acesso para preservar o registro.',
            );
          await c.query('DELETE FROM sessions WHERE user_id=$1', [input.id]);
          await c.query(
            'DELETE FROM login_attempts WHERE email=(SELECT email FROM users WHERE id=$1)',
            [input.id],
          );
          await c.query(
            'DELETE FROM invitation_deliveries WHERE invitation_id IN (SELECT id FROM user_invitations WHERE user_id=$1)',
            [input.id],
          );
          await c.query('DELETE FROM user_invitations WHERE user_id=$1', [input.id]);
          await c.query('DELETE FROM users WHERE id=$1', [input.id]);
        }
        break;
      }
    }
  } catch (error) {
    if ((error as { code?: string }).code === '23503')
      throw new HttpError(
        409,
        {
          company:
            'A empresa possui unidades, regionais ou contratadas. Exclua os cadastros dependentes primeiro.',
          region:
            'A regional está vinculada a unidades ou aprovadores. Ajuste esses vínculos antes de excluir.',
          unit: 'A unidade possui documentos, convites, contratadas ou aprovadores vinculados. Remova os vínculos permitidos antes de excluir.',
          contractor:
            'A contratada possui usuários vinculados nesta unidade. Ajuste os vínculos antes de excluir.',
          user: 'A conta possui histórico ou vínculos que precisam ser preservados. Desative o acesso em Editar acesso.',
          approver: 'A atribuição possui vínculos que impedem a exclusão.',
          account: 'A conta possui vínculos que impedem a exclusão.',
        }[input.kind],
      );
    throw error;
  }
  await c.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
    actor.id,
    'cadastro.excluido',
    JSON.stringify({
      kind: input.kind,
      id: input.id,
      name,
      unitId: input.kind === 'unit' ? input.id : unit.id,
      companyId: input.kind === 'company' ? input.id : unit.company_id,
    }),
  ]);
}
