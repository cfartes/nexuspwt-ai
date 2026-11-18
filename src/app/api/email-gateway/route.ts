import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { encryptSecret } from '@/lib/integrations';
import { apiError } from '@/lib/http';
import { assertOrigin, HttpError } from '@/lib/security';
async function superadmin() {
  const user = await currentUser();
  if (!user.platform_admin)
    throw new HttpError(403, 'Somente o superadmin configura o envio de e-mails.');
  return user;
}
export async function GET() {
  try {
    await superadmin();
    const {
      rows: [row],
    } = await db.query('SELECT sender,version FROM email_gateway');
    return Response.json(
      { sender: row?.sender || '', version: row?.version || 0, hasSecret: !!row },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await superadmin();
    const input = z
      .object({
        version: z.number().int().nonnegative(),
        sender: z.email().max(254),
        secret: z.string().trim().max(16000),
      })
      .strict()
      .parse(await request.json());
    if (input.secret && !/^re_[A-Za-z\d_-]{15,}$/.test(input.secret))
      throw new HttpError(400, 'Informe a chave completa do Resend.');
    await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('nexus-email-gateway'))");
      const {
        rows: [old],
      } = await c.query('SELECT * FROM email_gateway FOR UPDATE');
      if ((old?.version || 0) !== input.version)
        throw new HttpError(409, 'Configuração alterada. Recarregue a tela.');
      if (!old && !input.secret) throw new HttpError(400, 'Informe a chave do Resend.');
      await c.query(
        `INSERT INTO email_gateway(sender,secret_ciphertext,updated_by) VALUES($1,$2,$3)
      ON CONFLICT(singleton) DO UPDATE SET sender=EXCLUDED.sender,secret_ciphertext=EXCLUDED.secret_ciphertext,updated_by=EXCLUDED.updated_by,updated_at=now(),version=email_gateway.version+1`,
        [
          input.sender,
          input.secret ? encryptSecret(input.secret, 'platform', 'resend') : old.secret_ciphertext,
          user.id,
        ],
      );
      await c.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
        user.id,
        'resend.configurado',
        JSON.stringify({ version: input.version + 1, credentialChanged: !!input.secret }),
      ]);
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
