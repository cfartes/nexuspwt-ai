import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { assertOrigin } from '@/lib/security';
import { apiError } from '@/lib/http';
import { removeApr } from '@/lib/remove-apr';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const id = z.uuid().parse((await context.params).id);
    const input = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(await request.json());
    await transaction((c) => removeApr(c, user, id, input.version));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
