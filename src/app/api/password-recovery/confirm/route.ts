import { cookies } from 'next/headers';
import { transaction } from '@/lib/db';
import { assertOrigin } from '@/lib/security';
import { apiError } from '@/lib/http';
import { recoveryConfirmation, confirmPasswordRecovery } from '@/lib/passwordRecovery';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = recoveryConfirmation.parse(await request.json());
    await transaction((client) => confirmPasswordRecovery(client, input));
    (await cookies()).delete('nexus_session');
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
