import { z } from 'zod';
import { db, transaction } from '@/lib/db';
import { assertOrigin } from '@/lib/security';
import { apiError } from '@/lib/http';
import { readIdentityJson } from '@/lib/identityRequests';
import {
  contractorRegistrationData,
  registrationByToken,
  registrationCard,
  registrationPayload,
  submitContractorRegistration,
} from '@/lib/contractorRegistration';
import { lookupCep } from '@/lib/address';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('read'), token: z.string().max(64) }).strict(),
        z
          .object({
            action: z.literal('address'),
            token: z.string().max(64),
            cep: z.string().regex(/^\d{8}$/),
          })
          .strict(),
        z
          .object({
            action: z.literal('submit'),
            token: z.string().max(64),
            version: z.number().int().positive(),
            data: contractorRegistrationData,
            card: registrationCard.optional(),
          })
          .strict(),
      ])
      .parse(await readIdentityJson(request));
    if (input.action === 'submit') {
      await transaction((client) =>
        submitContractorRegistration(client, input.token, input.version, input.data, input.card),
      );
      return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const row = await registrationByToken(db, input.token);
    if (input.action === 'address')
      return Response.json(await lookupCep(input.cep), {
        headers: { 'Cache-Control': 'no-store' },
      });
    const context = (
      await db.query<{ company_name: string; unit_name: string }>(
        'SELECT c.name company_name,u.name unit_name FROM units u JOIN companies c ON c.id=u.company_id WHERE u.id=$1',
        [row.unit_id],
      )
    ).rows[0];
    return Response.json(
      {
        email: row.email,
        version: row.version,
        status: row.status,
        reason: row.reason,
        hasCard: !!row.card_ciphertext,
        data: row.status === 'approved' ? null : registrationPayload(row),
        ...context,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
