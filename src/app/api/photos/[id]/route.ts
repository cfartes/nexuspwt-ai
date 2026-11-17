import { currentUser, unitAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { uuid } from '@/lib/validation';
import { HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    const { id } = await context.params;
    uuid.parse(id);
    const {
      rows: [p],
    } = await db.query(
      'SELECT p.*,d.unit_id,d.created_by,d.data FROM photos p JOIN documents d ON d.id=p.document_id WHERE p.id=$1',
      [id],
    );
    if (!p) throw new HttpError(404, 'Foto não encontrada.');
    const unit = await unitAccess(user, p.unit_id);
    if (
      unit.role === 'executante' &&
      p.created_by !== user.id &&
      !p.data.executors.some((e: { userId: string }) => e.userId === user.id)
    )
      throw new HttpError(403, 'Sem acesso.');
    return new Response(new Uint8Array(p.content), {
      headers: {
        'Content-Type': p.mime,
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
