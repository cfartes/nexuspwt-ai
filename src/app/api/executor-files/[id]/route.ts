import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { identityAccess } from '@/lib/executor-identities';
import { decryptSecret } from '@/lib/integrations';
import { HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await currentUser();
    const id = z.uuid().parse((await context.params).id);
    return await transaction(async (c) => {
      const {
        rows: [file],
      } = await c.query(
        'SELECT f.*,s.company_id,s.unit_id,s.contractor_id,s.user_id FROM executor_identity_files f JOIN executor_identity_submissions s ON s.id=f.submission_id WHERE f.id=$1',
        [id],
      );
      if (!file) throw new HttpError(404, 'Documento não encontrado.');
      const { unit, reviewer } = await identityAccess(c, actor, file.unit_id);
      if (
        file.company_id !== unit.company_id ||
        (!reviewer && file.contractor_id !== unit.contractor_id)
      )
        throw new HttpError(403, 'Documento indisponível.');
      const bytes = Buffer.from(
        decryptSecret(file.content_ciphertext, id, 'identity-document'),
        'base64',
      );
      await c.query(
        "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'executor.documento_consultado',$2)",
        [
          actor.id,
          JSON.stringify({ companyId: unit.company_id, unitId: unit.id, userId: file.user_id, id }),
        ],
      );
      return new Response(bytes, {
        headers: {
          'Content-Type': file.mime,
          'Content-Disposition': `attachment; filename="documento-${id}.${file.mime === 'application/pdf' ? 'pdf' : file.mime === 'image/png' ? 'png' : 'jpg'}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "sandbox; default-src 'none'",
        },
      });
    });
  } catch (error) {
    return apiError(error);
  }
}
