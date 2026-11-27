import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { assertOrigin } from '@/lib/security';
import { apiError, readJsonBody } from '@/lib/http';
import { removeDocument } from '@/lib/remove-document';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const id = z.uuid().parse((await context.params).id);
    const input = z
      .object({ version: z.number().int().positive(), kind: z.enum(['APR', 'PT']) })
      .strict()
      .parse(await readJsonBody(request));
    await transaction((c) => removeDocument(c, user, id, input.version, input.kind));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
