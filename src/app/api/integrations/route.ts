import { z } from 'zod';
import { currentUser, unitAccess } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { apiError } from '@/lib/http';
import { assertOrigin, HttpError } from '@/lib/security';
import { uuid } from '@/lib/validation';
import {
  integrationSchema,
  encryptSecret,
  decryptSecret,
  publicIntegration,
  type IntegrationRow,
} from '@/lib/integrations';
import { checkOpenwaSession, openwaBaseUrl } from '@/lib/openwa';
import { companyManager } from '@/lib/permissions';

async function access(unitId: string) {
  const user = await currentUser();
  const unit = await unitAccess(user, unitId, ['admin']);
  if (!companyManager(user, unit))
    throw new HttpError(
      403,
      'As integrações da empresa são gerenciadas pelo administrador da plataforma.',
    );
  return { user, unit };
}
export async function GET(request: Request) {
  try {
    const unitId = uuid.parse(new URL(request.url).searchParams.get('unit'));
    const { user, unit } = await access(unitId);
    const { rows } = await db.query<IntegrationRow>(
      'SELECT * FROM company_integrations WHERE company_id=$1',
      [unit.company_id],
    );
    return Response.json(
      {
        integrations: rows
          .filter((row) => user.platform_admin || row.service === 'signature')
          .map(publicIntegration),
        encryptionReady: /^[a-f\d]{64}$/i.test(process.env.INTEGRATIONS_ENCRYPTION_KEY || ''),
        openwaDefaultUrl: user.platform_admin ? process.env.OPENWA_DEFAULT_URL || '' : '',
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
    const input = integrationSchema.parse(await request.json());
    const { user, unit } = await access(input.unitId);
    if (input.service === 'whatsapp' && !user.platform_admin)
      throw new HttpError(403, 'Gateway restrito ao superadmin.');
    if (input.clearSecret && input.secret)
      throw new HttpError(400, 'Escolha substituir ou remover a credencial.');
    const result = await transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${unit.company_id}:${input.service}`,
      ]);
      const {
        rows: [existing],
      } = await c.query<IntegrationRow>(
        'SELECT * FROM company_integrations WHERE company_id=$1 AND service=$2 FOR UPDATE',
        [unit.company_id, input.service],
      );
      if ((existing?.version || 0) !== input.version)
        throw new HttpError(409, 'A configuração foi alterada. Recarregue antes de salvar.');
      if (
        input.service === 'whatsapp' &&
        existing?.secret_ciphertext &&
        new URL(String(existing.settings.baseUrl)).origin !== new URL(input.baseUrl).origin &&
        !input.secret &&
        !input.clearSecret
      )
        throw new HttpError(
          400,
          'Ao trocar o gateway, informe uma nova chave de API ou remova a credencial anterior.',
        );
      let encrypted = existing?.provider === input.provider ? existing.secret_ciphertext : null;
      if (input.clearSecret) encrypted = null;
      if (input.secret) encrypted = encryptSecret(input.secret, unit.company_id, input.service);
      const settings =
        input.service === 'signature'
          ? { environment: input.environment, accountId: input.accountId, clientId: input.clientId }
          : {
              baseUrl: input.baseUrl.replace(/\/$/, ''),
              sessionId: input.sessionId,
              sendNotifications: input.sendNotifications,
            };
      if (input.service === 'whatsapp' && input.sendNotifications) {
        if (!encrypted || !input.sessionId)
          throw new HttpError(
            400,
            'Informe a chave completa e a sessão antes de habilitar notificações.',
          );
        openwaBaseUrl(input.baseUrl);
      }
      const {
        rows: [saved],
      } = await c.query<IntegrationRow>(
        `INSERT INTO company_integrations(company_id,service,provider,settings,secret_ciphertext,updated_by) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(company_id,service) DO UPDATE SET provider=EXCLUDED.provider,settings=EXCLUDED.settings,secret_ciphertext=EXCLUDED.secret_ciphertext,updated_by=EXCLUDED.updated_by,updated_at=now(),version=company_integrations.version+1 RETURNING *`,
        [
          unit.company_id,
          input.service,
          input.provider,
          JSON.stringify(settings),
          encrypted,
          user.id,
        ],
      );
      if (input.service === 'whatsapp')
        await c.query(
          `UPDATE notification_outbox n SET status='pending',available_at=now(),last_error=NULL,updated_at=now()
        FROM documents d WHERE d.id=n.document_id AND d.company_id=$1 AND n.status='blocked'`,
          [unit.company_id],
        );
      await c.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
        user.id,
        'integracao.configurada',
        JSON.stringify({
          companyId: unit.company_id,
          service: input.service,
          provider: input.provider,
          version: saved.version,
          credentialChanged:
            !!input.secret || input.clearSecret || existing?.provider !== input.provider,
        }),
      ]);
      return publicIntegration(saved);
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    assertOrigin(request);
    const input = z
      .object({ unitId: uuid, version: z.number().int().positive() })
      .strict()
      .parse(await request.json());
    const { user, unit } = await access(input.unitId);
    if (!user.platform_admin) throw new HttpError(403, 'Gateway restrito ao superadmin.');
    const {
      rows: [row],
    } = await db.query<IntegrationRow>(
      "SELECT * FROM company_integrations WHERE company_id=$1 AND service='whatsapp'",
      [unit.company_id],
    );
    if (!row || !row.secret_ciphertext || !row.settings.sessionId)
      throw new HttpError(400, 'Salve a chave completa e o ID da sessão antes de testar.');
    if (row.version !== input.version)
      throw new HttpError(409, 'Configuração desatualizada. Recarregue antes de testar.');
    const result = await checkOpenwaSession(
      String(row.settings.baseUrl),
      String(row.settings.sessionId),
      decryptSecret(row.secret_ciphertext, unit.company_id, 'whatsapp'),
    );
    await db.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
      user.id,
      'openwa.conexao_testada',
      JSON.stringify({ companyId: unit.company_id, version: row.version, status: result.status }),
    ]);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
