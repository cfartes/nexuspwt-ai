import { db } from '@/lib/db';
import { currentUser, unitAccess } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { uuid } from '@/lib/validation';
import { HttpError } from '@/lib/security';
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const { rows: units } = await db.query(
      'SELECT u.*,c.name company_name,m.role FROM memberships m JOIN units u ON u.id=m.unit_id JOIN companies c ON c.id=u.company_id WHERE m.user_id=$1 ORDER BY c.name,u.name',
      [user.id],
    );
    const params = new URL(request.url).searchParams;
    let unitId = params.get('unit') || units[0]?.id;
    if (params.has('document')) {
      const documentId = uuid.parse(params.get('document'));
      const {
        rows: [target],
      } = await db.query(
        'SELECT d.unit_id FROM documents d JOIN memberships m ON m.unit_id=d.unit_id WHERE d.id=$1 AND m.user_id=$2',
        [documentId, user.id],
      );
      if (!target) throw new HttpError(403, 'Documento indisponível para sua conta.');
      unitId = target.unit_id;
    }
    if (!unitId)
      return Response.json({
        user,
        units,
        documents: [],
        contractors: [],
        people: [],
        regions: [],
        approvers: [],
      });
    const unit = await unitAccess(user, uuid.parse(unitId));
    const results = await Promise.all([
      db.query(
        "SELECT d.*,u.name author FROM documents d JOIN users u ON u.id=d.created_by WHERE d.unit_id=$1 AND ($2 <> 'executante' OR d.created_by=$3 OR (d.kind='APR' AND d.status='aprovado') OR d.data->'executors' @> $4::jsonb) ORDER BY (d.id=$5::uuid) DESC NULLS LAST,d.updated_at DESC LIMIT 500",
        [
          unit.id,
          unit.role,
          user.id,
          JSON.stringify([{ userId: user.id }]),
          params.get('document'),
        ],
      ),
      db.query(
        'SELECT c.* FROM contractors c JOIN contractor_units cu ON cu.contractor_id=c.id WHERE cu.unit_id=$1 ORDER BY c.name',
        [unit.id],
      ),
      db.query(
        'SELECT u.id,u.name,u.email,u.phone,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.unit_id=$1 AND u.active ORDER BY u.name',
        [unit.id],
      ),
      db.query('SELECT * FROM regions WHERE company_id=$1 ORDER BY name', [unit.company_id]),
      db.query(
        'SELECT a.*,u.name user_name FROM approvers a JOIN users u ON u.id=a.user_id WHERE a.company_id=$1 AND (a.unit_id=$2 OR a.region_id=$3)',
        [unit.company_id, unit.id, unit.region_id],
      ),
      db.query(
        'SELECT a.*,u.name user_name FROM approvals a JOIN documents d ON d.id=a.document_id JOIN users u ON u.id=a.user_id WHERE d.unit_id=$1 AND a.version=d.version',
        [unit.id],
      ),
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
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}
