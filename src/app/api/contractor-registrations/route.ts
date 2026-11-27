import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { assertOrigin, HttpError } from '@/lib/security';
import { apiError, readJsonBody } from '@/lib/http';
import {
  inviteContractor,
  registrationAccess,
  registrationPayload,
  reviewContractorRegistration,
  type RegistrationRow,
} from '@/lib/contractorRegistration';

export async function GET(request: Request) {
  try {
    const actor = await currentUser();
    const unitId = z.uuid().parse(new URL(request.url).searchParams.get('unit'));
    await registrationAccess(db, actor, unitId);
    const rows = (
      await db.query<RegistrationRow>(
        'SELECT * FROM contractor_registrations WHERE unit_id=$1 ORDER BY created_at DESC LIMIT 100',
        [unitId],
      )
    ).rows;
    return Response.json(
      {
        registrations: rows.map((row) => ({
          id: row.id,
          email: row.email,
          status: row.status,
          version: row.version,
          reason: row.reason,
          expiresAt: row.expires_at,
          deliveryStatus: row.delivery_status,
          deliveryError: row.delivery_error,
          hasCard: !!row.card_ciphertext,
          data: registrationPayload(row),
        })),
      },
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
    const input = z
      .discriminatedUnion('action', [
        z
          .object({ action: z.literal('invite'), unitId: z.uuid(), email: z.email().max(254) })
          .strict(),
        z
          .object({
            action: z.enum(['approve', 'changes']),
            unitId: z.uuid(),
            id: z.uuid(),
            version: z.number().int().positive(),
            reason: z.string().trim().min(5).max(1000),
            confirmed: z.literal(true),
          })
          .strict(),
        z
          .object({
            action: z.literal('resend'),
            unitId: z.uuid(),
            id: z.uuid(),
            version: z.number().int().positive(),
            confirmed: z.literal(true),
          })
          .strict(),
      ])
      .parse(await readJsonBody(request));
    await transaction(async (client) => {
      if (input.action === 'invite')
        return inviteContractor(client, actor, input.unitId, input.email);
      if (input.action === 'resend') {
        await client.query('SELECT id FROM units WHERE id=$1 FOR UPDATE', [input.unitId]);
        await registrationAccess(client, actor, input.unitId);
        const { rowCount } = await client.query(
          "UPDATE contractor_registrations SET delivery_status='pending',delivery_error=NULL,available_at=now(),expires_at=now()+interval '7 days',version=version+1 WHERE id=$1 AND unit_id=$2 AND version=$3 AND status<>'approved' AND delivery_status<>'sending'",
          [input.id, input.unitId, input.version],
        );
        if (!rowCount)
          throw new HttpError(409, 'Cadastro alterado ou envio em andamento. Atualize a lista.');
        await client.query(
          "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'contratada.convite_reenviado',$2)",
          [actor.id, JSON.stringify({ unitId: input.unitId, registrationId: input.id })],
        );
        return;
      }
      await reviewContractorRegistration(
        client,
        actor,
        input.unitId,
        input.id,
        input.version,
        input.action,
        input.reason,
      );
    });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
