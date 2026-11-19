import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { companyAudit, auditFilters } from '@/lib/audit';
import { uuid } from '@/lib/validation';
import { apiError } from '@/lib/http';

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const params = new URL(request.url).searchParams;
    const context = uuid.parse(params.get('context'));
    params.delete('context');
    const filters = auditFilters.parse(Object.fromEntries(params));
    const data = await companyAudit(db, user, context, filters);
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
