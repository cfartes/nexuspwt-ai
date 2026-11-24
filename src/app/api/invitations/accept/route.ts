import { z } from 'zod';
import { newPassword } from '@/lib/password-policy';
import { cookies } from 'next/headers';
import { transaction } from '@/lib/db';
import { assertOrigin } from '@/lib/security';
import { apiError } from '@/lib/http';
import { acceptInvitation } from '@/lib/invitations';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = z
      .object({ token: z.string().regex(/^[a-f\d]{64}$/), password: newPassword })
      .strict()
      .parse(await request.json());
    const account = await transaction((c) => acceptInvitation(c, input.token, input.password));
    (await cookies()).delete('nexus_session');
    return Response.json({ ok: true, ...account }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
