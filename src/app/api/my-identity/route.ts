import { z } from 'zod';
import { currentUser, unitAccess } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { assertOrigin, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { personalIdentityState } from '@/lib/identityPolicyRepository';
import { executorSubmission, submitExecutor } from '@/lib/executor-identities';
import { readIdentityJson } from '@/lib/identityRequests';

export async function GET(request: Request) {
  try {
    const actor = await currentUser();
    const unit = await unitAccess(
      actor,
      z.uuid().parse(new URL(request.url).searchParams.get('unit')),
      undefined,
      db,
      true,
    );
    if (actor.platform_admin || !unit.contractor_id)
      throw new HttpError(403, 'Documento pessoal não exigido neste perfil.');
    return Response.json(
      await personalIdentityState(
        db,
        actor.id,
        unit.company_id,
        unit.contractor_id,
        unit.identity_upload_enabled,
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const actor = await currentUser();
    const personalInput = executorSubmission
      .pick({ unitId: true, documentType: true, files: true })
      .strict()
      .parse(await readIdentityJson(request));
    const result = await transaction((client) =>
      submitExecutor(
        client,
        actor,
        { ...personalInput, action: 'resubmit', userId: actor.id },
        true,
      ),
    );
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
