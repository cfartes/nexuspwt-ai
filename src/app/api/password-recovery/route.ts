import { transaction } from '@/lib/db';
import { assertOrigin } from '@/lib/security';
import { apiError } from '@/lib/http';
import { recoveryRequest, recoveryMessage, requestPasswordRecovery } from '@/lib/passwordRecovery';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = recoveryRequest.parse(await request.json());
    await transaction((client) => requestPasswordRecovery(client, input));
    return Response.json(
      { message: recoveryMessage },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
