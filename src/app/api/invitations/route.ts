import { z } from 'zod';
import { currentUser, unitAccess } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { apiError, readJsonBody } from '@/lib/http';
import { assertOrigin } from '@/lib/security';
import { createInvitation } from '@/lib/invitations';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = z
      .object({ unitId: z.uuid(), userId: z.uuid() })
      .strict()
      .parse(await readJsonBody(request));
    const user = await currentUser();
    await transaction(async (c) => {
      const unit = await unitAccess(user, input.unitId, ['admin'], c);
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `company-access:${unit.company_id}`,
      ]);
      await unitAccess(user, input.unitId, ['admin'], c);
      await createInvitation(c, user.id, input.userId, input.unitId);
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
