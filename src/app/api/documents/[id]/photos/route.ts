import { z } from 'zod';
import { db, transaction } from '@/lib/db';
import { currentUser, unitAccess, assertContractorAccess, assertDocumentRead } from '@/lib/auth';
import { assertOrigin, digest, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { uuid } from '@/lib/validation';
const schema = z.object({
  id: uuid,
  caption: z.string().trim().min(2).max(1000),
  capturedAt: z.iso.datetime(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  base64: z.string().max(7000000),
});
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const { id } = await context.params;
    uuid.parse(id);
    if (Number(request.headers.get('content-length') || 0) > 7100000)
      throw new HttpError(413, 'Foto muito grande. Limite de 5 MB.');
    const p = schema.parse(await request.json());
    const bytes = Buffer.from(p.base64, 'base64');
    if (bytes.length > 5 * 1024 * 1024 || bytes.length < 12)
      throw new HttpError(400, 'Tamanho de imagem inválido.');
    const mime = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      ? 'image/jpeg'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
          ? 'image/webp'
          : null;
    if (mime !== p.mime) throw new HttpError(400, 'Conteúdo da imagem inválido.');
    return await transaction(async (c) => {
      const {
        rows: [doc],
      } = await c.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [id]);
      if (!doc || doc.kind !== 'PT') throw new HttpError(404, 'PT não encontrada.');
      const unit = await unitAccess(user, doc.unit_id, undefined, c);
      if (unit.role === 'aprovador') throw new HttpError(403, 'Aprovador não pode alterar evidências.');
      assertContractorAccess(unit, doc.contractor_id);
      if (
        !['admin', 'gestor', 'seguranca_trabalho'].includes(unit.role) &&
        doc.created_by !== user.id &&
        !doc.data.executors.some((e: { userId: string }) => e.userId === user.id)
      )
        throw new HttpError(403, 'Sem permissão para enviar evidências desta PT.');
      const {
        rows: [existing],
      } = await c.query('SELECT document_id,sha256 FROM photos WHERE id=$1', [p.id]);
      const sha = digest(bytes);
      if (existing) {
        if (existing.document_id !== id || existing.sha256 !== sha)
          throw new HttpError(409, 'Identificador de foto já utilizado.');
        return Response.json({ ok: true });
      }
      await c.query(
        'INSERT INTO photos(id,document_id,actor_id,caption,captured_at,latitude,longitude,accuracy,mime,sha256,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          p.id,
          id,
          user.id,
          p.caption,
          p.capturedAt,
          p.latitude,
          p.longitude,
          p.accuracy,
          mime,
          sha,
          bytes,
        ],
      );
      return Response.json({ ok: true });
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    const { id } = await context.params;
    uuid.parse(id);
    const {
      rows: [doc],
    } = await db.query('SELECT * FROM documents WHERE id=$1', [id]);
    if (!doc) throw new HttpError(404, 'Documento não encontrado.');
    const unit = await unitAccess(user, doc.unit_id);
    await assertDocumentRead(db, user, unit, doc);
    assertContractorAccess(unit, doc.contractor_id);
    if (
      unit.role === 'executante' &&
      doc.created_by !== user.id &&
      !doc.data.executors.some((e: { userId: string }) => e.userId === user.id)
    )
      throw new HttpError(403, 'Sem acesso às evidências.');
    const { rows } = await db.query(
      'SELECT id,caption,captured_at,received_at,latitude,longitude,accuracy,sha256 FROM photos WHERE document_id=$1 ORDER BY received_at',
      [id],
    );
    return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return apiError(e);
  }
}
