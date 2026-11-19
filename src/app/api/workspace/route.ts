import { db } from '@/lib/db';
import { currentUser, unitAccess } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { uuid } from '@/lib/validation';
import { HttpError } from '@/lib/security';
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const { rows: units } = await db.query(
      'SELECT u.*,c.name company_name,m.role,m.contractor_id FROM memberships m JOIN units u ON u.id=m.unit_id JOIN companies c ON c.id=u.company_id WHERE m.user_id=$1 AND m.active ORDER BY c.name,u.name',
      [user.id],
    );
    const params = new URL(request.url).searchParams;
    let unitId = params.get('unit') || units[0]?.id;
    if (params.has('document')) {
      const documentId = uuid.parse(params.get('document'));
      const {
        rows: [target],
      } = await db.query(
        'SELECT d.unit_id FROM documents d JOIN memberships m ON m.unit_id=d.unit_id WHERE d.id=$1 AND d.removed_at IS NULL AND m.user_id=$2 AND m.active AND (m.contractor_id IS NULL OR m.contractor_id=d.contractor_id)',
        [documentId, user.id],
      );
      if (!target) throw new HttpError(403, 'Documento indisponível para sua conta.');
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
        "SELECT d.*,u.name author FROM documents d JOIN users u ON u.id=d.created_by WHERE d.unit_id=$1 AND d.removed_at IS NULL AND ($6::uuid IS NULL OR d.contractor_id=$6) AND ($2 <> 'executante' OR d.created_by=$3 OR (d.kind='APR' AND d.status='aprovado') OR d.data->'executors' @> $4::jsonb) ORDER BY (d.id=$5::uuid) DESC NULLS LAST,d.updated_at DESC LIMIT 500",
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
        `SELECT u.id,u.name,u.email,u.password_pending,COALESCE(m.phone,u.phone) phone,m.role,m.active,m.contractor_id,m.version membership_version,
          (SELECT jsonb_object_agg(d.channel,jsonb_build_object('status',d.status,'error',d.last_error)) FROM invitation_deliveries d
           WHERE d.invitation_id=(SELECT i.id FROM user_invitations i WHERE i.user_id=u.id AND i.unit_id=m.unit_id ORDER BY i.created_at DESC,i.id DESC LIMIT 1)) invitation_status
         FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.unit_id=$1 AND u.active
         AND ($2='admin' OR m.active) AND ($3::uuid IS NULL OR m.contractor_id=$3 OR (m.contractor_id IS NULL AND m.role IN ('admin','gestor','aprovador'))) ORDER BY u.name`,
        [unit.id, unit.role, unit.contractor_id],
      ),
      db.query('SELECT * FROM regions WHERE company_id=$1 ORDER BY name', [unit.company_id]),
      db.query(
        `SELECT a.*,u.name user_name,m.contractor_id approver_contractor_id,
          COALESCE(u.active AND m.active AND m.role IN ('admin','gestor','aprovador'),false) eligible
         FROM approvers a JOIN users u ON u.id=a.user_id LEFT JOIN memberships m ON m.user_id=a.user_id AND m.unit_id=$2
         WHERE a.company_id=$1 AND (a.unit_id=$2 OR a.region_id=$3)
          AND ($5='admin' OR (a.active AND u.active AND m.active AND m.role IN ('admin','gestor','aprovador')))
          AND ($4::uuid IS NULL OR m.contractor_id IS NULL OR m.contractor_id=$4) ORDER BY a.unit_id NULLS LAST,a.kind,a.profile`,
        [unit.company_id, unit.id, unit.region_id, unit.contractor_id, unit.role],
      ),
      db.query(
        'SELECT a.*,u.name user_name FROM approvals a JOIN documents d ON d.id=a.document_id JOIN users u ON u.id=a.user_id WHERE d.unit_id=$1 AND d.removed_at IS NULL AND a.version=d.version AND ($2::uuid IS NULL OR d.contractor_id=$2)',
        [unit.id, unit.contractor_id],
      ),
      unit.role === 'admin' && user.platform_admin
        ? db.query('SELECT id,name,cnpj,details,version FROM companies ORDER BY name')
        : Promise.resolve({ rows: [] }),
      unit.role === 'admin'
        ? db.query(
            `SELECT u.id,u.name,u.email,array_agg(DISTINCT un.name ORDER BY un.name) units
          FROM users u JOIN memberships m ON m.user_id=u.id JOIN units un ON un.id=m.unit_id
          WHERE un.company_id=$1 AND u.active GROUP BY u.id ORDER BY u.name`,
            [unit.company_id],
          )
        : Promise.resolve({ rows: [] }),
      unit.role === 'admin'
        ? db.query(
            `SELECT u.id,u.company_id,u.name,u.kind,u.region_id FROM units u WHERE u.company_id=$1
             AND ($2 OR EXISTS(SELECT 1 FROM memberships m WHERE m.unit_id=u.id AND m.user_id=$3 AND m.active)) ORDER BY u.name`,
            [unit.company_id, user.platform_admin, user.id],
          )
        : Promise.resolve({ rows: [] }),
      unit.role === 'admin'
        ? db.query(
            'SELECT c.unit_limit "limit",c.unit_limit_version version,(SELECT count(*)::int FROM units u WHERE u.company_id=c.id) used FROM companies c WHERE c.id=$1',
            [unit.company_id],
          )
        : Promise.resolve({ rows: [] }),
    ]);
    return Response.json(
      {
        user,
        units,
        unit,
        documents: results[0].rows,
        contractors: results[1].rows,
        people: results[2].rows,
        regions: results[3].rows,
        approvers: results[4].rows,
        approvals: results[5].rows,
        companies: results[6].rows,
        registeredUnits: results[8].rows,
        companyPeople: results[7].rows,
        unitQuota: results[9].rows[0] || null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}
