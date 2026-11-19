import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { assertOrigin, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import {
  executorSubmission,
  identityAccess,
  submitExecutor,
  reviewExecutor,
} from '@/lib/executor-identities';

export async function GET(request: Request) {
  try {
    const actor = await currentUser();
    const params = z
      .object({ unit: z.uuid(), before: z.uuid().optional() })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const { unit, reviewer } = await identityAccess(db, actor, params.unit);
    const { rows } = await db.query(
      `SELECT u.id,u.name,u.email,COALESCE(m.phone,u.phone) phone,m.contractor_id,c.name contractor_name,
      s.id submission_id,s.document_type,s.status,s.reason,s.version,s.submitted_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'mime',f.mime,'retain_until',f.retain_until)) FROM executor_identity_files f WHERE f.submission_id=s.id),'[]') files
      FROM memberships m JOIN users u ON u.id=m.user_id AND u.active AND NOT u.platform_admin
      JOIN contractors c ON c.id=m.contractor_id
      LEFT JOIN LATERAL(SELECT * FROM executor_identity_submissions es WHERE es.user_id=u.id AND es.unit_id=m.unit_id ORDER BY es.submitted_at DESC,es.id DESC LIMIT 1) s ON true
      WHERE m.unit_id=$1 AND m.active AND m.role='executante' AND ($2::uuid IS NULL OR m.contractor_id=$2)
      AND ($3::uuid IS NULL OR u.id<$3) ORDER BY u.id DESC LIMIT 101`,
      [unit.id, reviewer ? null : unit.contractor_id, params.before ?? null],
    );
    return Response.json(
      { people: rows.slice(0, 100), reviewer, nextCursor: rows.length > 100 ? rows[99].id : null },
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
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Corpo da solicitação ausente.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 14500000) throw new HttpError(413, 'Limite de dois arquivos de 5 MB.');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body.action === 'review') {
      const input = z
        .object({
          action: z.literal('review'),
          unitId: z.uuid(),
          id: z.uuid(),
          version: z.number().int().positive(),
          decision: z.enum(['approved', 'rejected']),
          reason: z.string().trim().min(5).max(1000),
          confirmed: z.literal(true),
        })
        .strict()
        .parse(body);
      await transaction((c) => reviewExecutor(c, actor, input));
      return Response.json({ ok: true });
    }
    const input = executorSubmission.parse(body);
    return Response.json(await transaction((c) => submitExecutor(c, actor, input)));
  } catch (error) {
    return apiError(error);
  }
}
