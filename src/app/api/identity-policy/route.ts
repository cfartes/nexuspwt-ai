import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { assertOrigin } from '@/lib/security';
import { apiError } from '@/lib/http';
import { saveIdentityPolicy } from '@/lib/identityPolicy';

const policyInput = z
  .object({ unitId: z.uuid(), enabled: z.boolean(), version: z.number().int().positive() })
  .strict();
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const actor = await currentUser();
    const input = policyInput.parse(await request.json());
    await transaction((client) => saveIdentityPolicy(client, actor, input));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
