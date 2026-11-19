import { db } from '@/lib/db';
import { currentUser, unitAccess, assertDocumentRead } from '@/lib/auth';
import { ACCESS_POLICY_VERSION, companyManager } from '@/lib/permissions';
import { apiError } from '@/lib/http';
import { uuid } from '@/lib/validation';
import { HttpError } from '@/lib/security';
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const { rows: units } = await db.query(
      `SELECT u.*,c.name company_name,CASE WHEN ca.user_id IS NOT NULL THEN 'admin' ELSE m.role END role,
       CASE WHEN ca.user_id IS NOT NULL THEN NULL ELSE m.contractor_id END contractor_id,(ca.user_id IS NOT NULL) company_admin
       FROM units u JOIN companies c ON c.id=u.company_id LEFT JOIN memberships m ON m.unit_id=u.id AND m.user_id=$1 AND m.active
       LEFT JOIN company_admins ca ON ca.company_id=u.company_id AND ca.user_id=$1 AND ca.active WHERE m.user_id IS NOT NULL OR ca.user_id IS NOT NULL ORDER BY c.name,u.name`,
      [user.id],
    );
    const params = new URL(request.url).searchParams;
    let unitId = params.get('unit') || units[0]?.id;
    if (params.has('document')) {
      const documentId = uuid.parse(params.get('document'));
      const {
        rows: [target],
      } = await db.query('SELECT d.* FROM documents d WHERE d.id=$1 AND d.removed_at IS NULL', [
        documentId,
      ]);
      if (!target) throw new HttpError(403, 'Documento indisponível para sua conta.');
      await assertDocumentRead(db, user, await unitAccess(user, target.unit_id), target);
      unitId = target.unit_id;
    }
    if (!unitId)
      throw new HttpError(
        403,
        'Sua conta não possui acesso ativo a uma unidade. Contate o administrador.',
      );
    const unit = await unitAccess(user, uuid.parse(unitId));
    const results = await Promise.all([
      db.query(
        "SELECT d.*,u.name author FROM documents d JOIN users u ON u.id=d.created_by WHERE d.unit_id=$1 AND d.removed_at IS NULL AND ($6::uuid IS NULL OR d.contractor_id=$6) AND ($2 <> 'executante' OR d.created_by=$3 OR (d.kind='APR' AND d.status='aprovado') OR d.data->'executors' @> $4::jsonb) AND ($2<>'aprovador' OR EXISTS(SELECT 1 FROM approvals a WHERE a.document_id=d.id AND a.version=d.version AND a.user_id=$3)) ORDER BY (d.id=$5::uuid) DESC NULLS LAST,d.updated_at DESC LIMIT 500",
        [
          unit.id,
          unit.role,
          user.id,
          JSON.stringify([{ userId: user.id }]),
          params.get('document'),
          unit.contractor_id,
        ],
      ),
      db.query(
        'SELECT c.* FROM contractors c JOIN contractor_units cu ON cu.contractor_id=c.id WHERE cu.unit_id=$1 AND ($2::uuid IS NULL OR c.id=$2) ORDER BY c.name',
        [unit.id, unit.contractor_id],
      ),
      db.query(
        `SELECT u.id,u.name,u.email,u.platform_admin,u.password_pending,COALESCE(m.phone,u.phone) phone,m.role,m.active,m.contractor_id,m.version membership_version,m.identity_verified_at,m.identity_verified_by,(s.enabled_at IS NOT NULL) authenticator_enabled,EXISTS(SELECT 1 FROM company_admins ca JOIN units un ON un.company_id=ca.company_id WHERE un.id=m.unit_id AND ca.user_id=u.id AND ca.active) company_admin,
          (SELECT jsonb_object_agg(d.channel,jsonb_build_object('status',d.status,'error',d.last_error)) FROM invitation_deliveries d
           WHERE d.invitation_id=(SELECT i.id FROM user_invitations i WHERE i.user_id=u.id AND i.unit_id=m.unit_id ORDER BY i.created_at DESC,i.id DESC LIMIT 1)) invitation_status
         FROM users u JOIN memberships m ON m.user_id=u.id LEFT JOIN user_security s ON s.user_id=u.id WHERE m.unit_id=$1 AND u.active
         AND ($4::boolean OR NOT u.platform_admin)
         AND ($2='admin' OR m.active) AND ($3::uuid IS NULL OR m.contractor_id=$3 OR (m.contractor_id IS NULL AND m.role IN ('admin','gestor','aprovador','seguranca_trabalho'))) ORDER BY u.name`,
        [unit.id, unit.role, unit.contractor_id, user.platform_admin],
      ),
      db.query('SELECT * FROM regions WHERE company_id=$1 ORDER BY name', [unit.company_id]),
      db.query(
        `SELECT a.*,u.name user_name,m.contractor_id approver_contractor_id,
          COALESCE(u.active AND m.active AND m.role IN ('admin','gestor','aprovador','seguranca_trabalho'),false) eligible
         FROM approvers a JOIN users u ON u.id=a.user_id LEFT JOIN memberships m ON m.user_id=a.user_id AND m.unit_id=$2
         WHERE a.company_id=$1 AND (a.unit_id=$2 OR a.region_id=$3)
          AND ($6::boolean OR NOT u.platform_admin)
          AND ($5='admin' OR (a.active AND u.active AND m.active AND m.role IN ('admin','gestor','aprovador','seguranca_trabalho')))
          AND ($4::uuid IS NULL OR m.contractor_id IS NULL OR m.contractor_id=$4) ORDER BY a.unit_id NULLS LAST,a.kind,a.profile`,
        [
          unit.company_id,
          unit.id,
          unit.region_id,
          unit.contractor_id,
          unit.role,
          user.platform_admin,
        ],
      ),
      db.query(
        'SELECT a.*,u.name user_name FROM approvals a JOIN documents d ON d.id=a.document_id JOIN users u ON u.id=a.user_id WHERE d.unit_id=$1 AND d.removed_at IS NULL AND a.version=d.version AND ($2::uuid IS NULL OR d.contractor_id=$2)',
        [unit.id, unit.contractor_id],
      ),
      unit.role === 'admin'
        ? db.query(
            'SELECT id,name,cnpj,details,version FROM companies WHERE $1 OR id=$2 ORDER BY name',
            [user.platform_admin, unit.company_id],
          )
        : Promise.resolve({ rows: [] }),
      unit.role === 'admin'
        ? db.query(
            `SELECT u.id,u.name,u.email,u.platform_admin,array_agg(DISTINCT un.name ORDER BY un.name) units
          FROM users u JOIN memberships m ON m.user_id=u.id JOIN units un ON un.id=m.unit_id
          WHERE un.company_id=$1 AND u.active AND ($2::boolean OR NOT u.platform_admin) GROUP BY u.id ORDER BY u.name`,
            [unit.company_id, user.platform_admin],
          )
        : Promise.resolve({ rows: [] }),
      unit.role === 'admin'
        ? db.query(
            `SELECT u.id,u.company_id,u.name,u.kind,u.region_id FROM units u WHERE u.company_id=$1
             AND ($2 OR EXISTS(SELECT 1 FROM memberships m WHERE m.unit_id=u.id AND m.user_id=$3 AND m.active)) ORDER BY u.name`,
            [unit.company_id, user.platform_admin || unit.company_admin, user.id],
          )
        : Promise.resolve({ rows: [] }),
      unit.role === 'admin'
        ? db.query(
            'SELECT c.unit_limit "limit",c.unit_limit_version version,(SELECT count(*)::int FROM units u WHERE u.company_id=c.id) used FROM companies c WHERE c.id=$1',
            [unit.company_id],
          )
        : Promise.resolve({ rows: [] }),
      db.query(
        'SELECT approval_mfa_required required,security_version version,EXISTS(SELECT 1 FROM user_security WHERE user_id=$2 AND enabled_at IS NOT NULL) enabled FROM companies WHERE id=$1',
        [unit.company_id, user.id],
      ),
      unit.role === 'admin'
        ? db.query('SELECT id,name,cnpj FROM contractors WHERE company_id=$1 ORDER BY name', [
            unit.company_id,
          ])
        : Promise.resolve({ rows: [] }),
    ]);
    const managesCompany = companyManager(user, unit);
    const documents = unit.role === 'admin_contratada' ? [] : results[0].rows;
    const ids = new Set(documents.map((d) => d.id));
    const linkedPeople = new Set(
      documents.flatMap((d) => [
        ...d.data.executors.map((p: { userId: string }) => p.userId),
        d.data.answers.companyUserId,
        d.data.answers.safetyUserId,
      ]),
    );
    const people =
      unit.role === 'admin'
        ? results[2].rows
        : results[2].rows
            .filter((p) => unit.role !== 'aprovador' || p.id === user.id || linkedPeople.has(p.id))
            .map((p) =>
              p.id === user.id
                ? p
                : {
                    id: p.id,
                    name: p.name,
                    role: p.role,
                    active: p.active,
                    contractor_id: p.contractor_id,
                    phone: unit.role === 'aprovador' || p.role === 'executante' ? '' : p.phone,
                    email: '',
                    membership_version: 0,
                    password_pending: false,
                  },
            );
    return Response.json(
      {
        user,
        accessPolicyVersion: ACCESS_POLICY_VERSION,
        units,
        unit,
        documents,
        contractors: ['aprovador', 'executante'].includes(unit.role)
          ? results[1].rows
              .filter(
                (c) => unit.role !== 'aprovador' || documents.some((d) => d.contractor_id === c.id),
              )
              .map((c) => ({ id: c.id, name: c.name, cnpj: c.cnpj, version: 0, details: {} }))
          : results[1].rows,
        people,
        regions:
          unit.role === 'admin'
            ? results[3].rows.filter((r) => managesCompany || r.id === unit.region_id)
            : [],
        approvers: ['aprovador', 'executante'].includes(unit.role) ? [] : results[4].rows,
        approvals: results[5].rows.filter((a) => ids.has(a.document_id)),
        companies: results[6].rows,
        registeredUnits: results[8].rows.filter((u) => managesCompany || u.id === unit.id),
        companyPeople: managesCompany
          ? results[7].rows
          : results[7].rows.map((p) => ({ ...p, units: [] })),
        unitQuota: results[9].rows[0] || null,
        securityPolicy: results[10].rows[0],
        authenticatorEnabled: results[10].rows[0].enabled,
        availableContractors: results[11].rows,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}
