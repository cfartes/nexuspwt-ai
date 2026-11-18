import { z } from 'zod';
import { cookies } from 'next/headers';
import { transaction } from '@/lib/db';
import { assertOrigin } from '@/lib/security';
import { apiError } from '@/lib/http';
import { acceptInvitation } from '@/lib/invitations';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = z
      .object({ token: z.string().regex(/^[a-f\d]{64}$/), password: z.string().min(12).max(256) })
      .strict()
      .parse(await request.json());
    await transaction((c) => acceptInvitation(c, input.token, input.password));
    (await cookies()).delete('nexus_session');
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
