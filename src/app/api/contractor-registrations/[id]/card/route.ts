import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { decryptSecret } from '@/lib/integrations';
import { registrationAccess, type RegistrationRow } from '@/lib/contractorRegistration';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await currentUser();
    const id = z.uuid().parse((await context.params).id);
    const row = (
      await db.query<RegistrationRow>('SELECT * FROM contractor_registrations WHERE id=$1', [id])
    ).rows[0];
    if (!row?.card_ciphertext || !row.card_mime)
      throw new HttpError(404, 'Documento indisponível.');
    await registrationAccess(db, actor, row.unit_id);
    await db.query(
      "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'contratada.cartao_consultado',$2)",
      [actor.id, JSON.stringify({ unitId: row.unit_id, registrationId: id })],
    );
    const bytes = Buffer.from(
      decryptSecret(row.card_ciphertext, id, 'contractor-registration-card'),
      'base64',
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': row.card_mime,
        'Content-Disposition': `attachment; filename="cartao-cnpj.${row.card_mime === 'application/pdf' ? 'pdf' : row.card_mime === 'image/png' ? 'png' : 'jpg'}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
