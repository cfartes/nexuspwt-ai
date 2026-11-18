import { currentUser, unitAccess } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { apiError } from '@/lib/http';
import { assertOrigin } from '@/lib/security';
import { uuid } from '@/lib/validation';
import type { IntegrationRow } from '@/lib/integrations';
import { connectionInput, connectionView, connectWhatsapp } from '@/lib/whatsapp-connection';

export async function GET(request: Request) {
  try {
    const unit = await unitAccess(
      await currentUser(),
      uuid.parse(new URL(request.url).searchParams.get('unit')),
      ['admin'],
    );
    const {
      rows: [row],
    } = await db.query<IntegrationRow>(
      "SELECT * FROM company_integrations WHERE company_id=$1 AND service='whatsapp'",
      [unit.company_id],
    );
    const { rowCount } = await db.query('SELECT 1 FROM whatsapp_gateway');
    return Response.json(
      { ...connectionView(row), gatewayReady: !!rowCount },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = connectionInput.parse(await request.json());
    const user = await currentUser();
    const result = await transaction(async (c) => {
      const unit = await unitAccess(user, input.unitId, ['admin'], c);
      return connectWhatsapp(c, unit.company_id, user.id, input);
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
