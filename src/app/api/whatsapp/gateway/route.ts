import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { encryptSecret } from '@/lib/integrations';
import { openwaBaseUrl } from '@/lib/openwa';
import { apiError } from '@/lib/http';
import { assertOrigin, HttpError } from '@/lib/security';
async function superadmin() {
  const user = await currentUser();
  if (!user.platform_admin) throw new HttpError(403, 'Somente o superadmin configura o gateway.');
  return user;
}
export async function GET() {
  try {
    await superadmin();
    const {
      rows: [row],
    } = await db.query('SELECT base_url,version FROM whatsapp_gateway');
    return Response.json(
      {
        baseUrl: row?.base_url || process.env.OPENWA_DEFAULT_URL || '',
        version: row?.version || 0,
        hasSecret: !!row,
      },
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
        baseUrl: z.url().max(1000),
        secret: z.string().trim().max(16000),
      })
      .strict()
      .parse(await request.json());
    const base = openwaBaseUrl(input.baseUrl);
    if (
      input.secret &&
      (input.secret.length < 12 ||
        /[\r\n…]/.test(input.secret) ||
        input.secret.includes('...') ||
        input.secret.includes('***'))
    )
      throw new HttpError(400, 'Informe a chave completa da API.');
    await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('nexus-whatsapp-provision'))");
      const {
        rows: [old],
      } = await c.query('SELECT * FROM whatsapp_gateway FOR UPDATE');
      if ((old?.version || 0) !== input.version)
        throw new HttpError(409, 'Configuração alterada. Recarregue a tela.');
      if (!input.secret && (!old || old.base_url !== base))
        throw new HttpError(400, 'Informe a chave da API para este gateway.');
      const { rowCount } = await c.query(
        "SELECT 1 FROM company_integrations WHERE service='whatsapp' AND settings->>'sessionId'<>'' AND settings->>'baseUrl'<>$1",
        [base],
      );
      if (rowCount)
        throw new HttpError(
          409,
          'Há sessões em outro gateway. Migre os vínculos antes de alterar a URL.',
        );
      await c.query(
        `INSERT INTO whatsapp_gateway(base_url,secret_ciphertext,updated_by) VALUES($1,$2,$3)
        ON CONFLICT(singleton) DO UPDATE SET base_url=EXCLUDED.base_url,secret_ciphertext=EXCLUDED.secret_ciphertext,
        updated_by=EXCLUDED.updated_by,updated_at=now(),version=whatsapp_gateway.version+1`,
        [
          base,
          input.secret
            ? encryptSecret(input.secret, 'platform', 'whatsapp')
            : old.secret_ciphertext,
          user.id,
        ],
      );
      // Keep the existing dispatcher compatible; the global key remains encrypted per company.
      if (input.secret) {
        const { rows } = await c.query(
          "SELECT company_id FROM company_integrations WHERE service='whatsapp' AND settings->>'baseUrl'=$1",
          [base],
        );
        for (const row of rows)
          await c.query(
            "UPDATE company_integrations SET secret_ciphertext=$2,version=version+1,updated_at=now() WHERE company_id=$1 AND service='whatsapp'",
            [row.company_id, encryptSecret(input.secret, row.company_id, 'whatsapp')],
          );
      }
      await c.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
        user.id,
        'whatsapp.gateway_configurado',
        JSON.stringify({ credentialChanged: !!input.secret, version: input.version + 1 }),
      ]);
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
