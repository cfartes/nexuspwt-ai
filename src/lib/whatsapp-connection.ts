import type { PoolClient } from 'pg';
import { z } from 'zod';
import { decryptSecret, encryptSecret, type IntegrationRow } from './integrations';
import {
  openwaBaseUrl,
  openwaRequest,
  safeQr,
  sessionPhone,
  businessPhone,
  OpenwaError,
} from './openwa';
import { HttpError } from './security';

type Gateway = { base_url: string; secret_ciphertext: string; version: number };
export async function whatsappGateway(client: PoolClient) {
  const {
    rows: [row],
  } = await client.query<Gateway>('SELECT * FROM whatsapp_gateway WHERE singleton');
  if (!row) throw new HttpError(503, 'O superadmin precisa configurar o gateway do WhatsApp.');
  return {
    baseUrl: row.base_url,
    key: decryptSecret(row.secret_ciphertext, 'platform', 'whatsapp'),
  };
}
function body(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(502, 'Resposta inválida do OpenWA.');
  const result = value as Record<string, unknown>;
  return result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    ? (result.data as Record<string, unknown>)
    : result;
}
export function connectionView(row?: IntegrationRow) {
  return {
    version: row?.version || 0,
    phone: row?.settings.phone || '',
    status: row?.settings.connectionStatus || (row?.settings.sessionId ? 'legacy' : 'not_started'),
    sendNotifications: row?.settings.sendNotifications === true,
  };
}
export const connectionInput = z
  .object({
    unitId: z.uuid(),
    version: z.number().int().nonnegative(),
    action: z.enum(['connect', 'refresh', 'notifications']),
    phone: z.string().max(25).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export async function connectWhatsapp(
  client: PoolClient,
  companyId: string,
  actorId: string,
  input: z.infer<typeof connectionInput>,
) {
  // Serialize provisioning across companies so a gateway session cannot be claimed twice.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('nexus-whatsapp-provision'))");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${companyId}:whatsapp`]);
  const {
    rows: [existing],
  } = await client.query<IntegrationRow>(
    "SELECT * FROM company_integrations WHERE company_id=$1 AND service='whatsapp' FOR UPDATE",
    [companyId],
  );
  if ((existing?.version || 0) !== input.version)
    throw new HttpError(409, 'A conexão foi alterada. Atualize a tela antes de continuar.');
  const gateway = await whatsappGateway(client);
  const baseUrl = openwaBaseUrl(gateway.baseUrl);
  const request = (path: string, payload?: unknown) =>
    openwaRequest(baseUrl, gateway.key, path, payload);
  const phone =
    input.action === 'connect' ? businessPhone(input.phone || '') : existing?.settings.phone;
  if (!phone) throw new HttpError(400, 'Informe o telefone do WhatsApp Business com DDI e DDD.');
  const { rowCount: phoneInUse } = await client.query(
    "SELECT 1 FROM company_integrations WHERE service='whatsapp' AND company_id<>$1 AND settings->>'phone'=$2",
    [companyId, phone],
  );
  if (phoneInUse) throw new HttpError(409, 'Este número já está vinculado a outra empresa.');
  let sessionId = existing?.settings.sessionId;
  if (existing && openwaBaseUrl(String(existing.settings.baseUrl)) !== baseUrl)
    throw new HttpError(
      409,
      'O gateway mudou. O superadmin precisa migrar o vínculo antes de reconectar.',
    );
  async function ensureSession() {
    const name = `nexus-ptw-${companyId}`;
    const result = await request('/sessions');
    const envelope = Array.isArray(result) ? null : body(result);
    const sessions = Array.isArray(result)
      ? result
      : envelope?.sessions || (result as { data?: unknown })?.data;
    if (!Array.isArray(sessions))
      throw new HttpError(502, 'Lista de sessões inválida recebida do OpenWA.');
    const matches = sessions.filter(
      (item) => item && typeof item === 'object' && item.name === name,
    );
    if (matches.length > 1)
      throw new HttpError(
        409,
        'Há sessões duplicadas para esta empresa. Solicite suporte ao superadmin.',
      );
    const parsed = z
      .uuid()
      .safeParse(matches[0]?.id || body(await request('/sessions', { name })).id);
    if (!parsed.success)
      throw new HttpError(502, 'OpenWA retornou um identificador de sessão inválido.');
    return parsed.data;
  }
  if (!sessionId) {
    if (input.action !== 'connect') throw new HttpError(400, 'Conecte o WhatsApp primeiro.');
    sessionId = await ensureSession();
  }
  let state: Record<string, unknown>;
  try {
    state = body(await request(`/sessions/${sessionId}`));
  } catch (error) {
    if (!(error instanceof OpenwaError) || error.providerStatus !== 404) throw error;
    if (input.action === 'connect') {
      sessionId = await ensureSession();
      state = body(await request(`/sessions/${sessionId}`));
    } else state = { status: 'MISSING' };
  }
  const { rowCount } = await client.query(
    `SELECT 1 FROM company_integrations WHERE service='whatsapp' AND company_id<>$1
      AND (settings->>'sessionId'=$2 OR settings->>'phone'=$3)`,
    [companyId, sessionId, phone],
  );
  if (rowCount)
    throw new HttpError(409, 'Este número ou sessão já está vinculado a outra empresa.');
  let status = String(state.status || '').toUpperCase();
  if (
    input.action === 'connect' &&
    ['CREATED', 'STOPPED', 'DISCONNECTED', 'FAILED'].includes(status)
  ) {
    state = body(await request(`/sessions/${sessionId}/start`, {}));
    status = String(state.status || 'STARTING').toUpperCase();
  }
  const detectedPhone = sessionPhone(state);
  const connectionStatus = ['READY', 'CONNECTED'].includes(status)
    ? !detectedPhone
      ? 'identity_pending'
      : detectedPhone === phone
        ? 'connected'
        : 'wrong_number'
    : ['QR_READY', 'QR'].includes(status)
      ? 'qr_ready'
      : status === 'MISSING'
        ? 'missing_session'
        : ['CREATED', 'STOPPED', 'DISCONNECTED', 'FAILED'].includes(status)
          ? 'disconnected'
          : 'starting';
  if (input.action === 'notifications' && input.enabled && connectionStatus !== 'connected')
    throw new HttpError(409, 'Confirme o número conectado antes de habilitar os avisos.');
  let qrCode: string | null = null;
  if (connectionStatus === 'qr_ready') {
    try {
      qrCode = safeQr(body(await request(`/sessions/${sessionId}/qr`)).qrCode);
    } catch (error) {
      if (!(error instanceof OpenwaError) || error.providerStatus !== 404) throw error;
    }
  }
  const enabled =
    connectionStatus === 'connected' &&
    (input.action === 'notifications'
      ? input.enabled === true
      : existing?.settings.sendNotifications === true && existing.settings.phone === phone);
  const settings = { baseUrl, sessionId, phone, connectionStatus, sendNotifications: enabled };
  const {
    rows: [saved],
  } = await client.query<IntegrationRow>(
    `INSERT INTO company_integrations(company_id,service,provider,settings,secret_ciphertext,updated_by)
     VALUES($1,'whatsapp','openwa',$2,$3,$4) ON CONFLICT(company_id,service) DO UPDATE SET
     settings=EXCLUDED.settings,secret_ciphertext=EXCLUDED.secret_ciphertext,updated_by=EXCLUDED.updated_by,
     updated_at=now(),version=company_integrations.version+1 RETURNING *`,
    [
      companyId,
      JSON.stringify(settings),
      encryptSecret(gateway.key, companyId, 'whatsapp'),
      actorId,
    ],
  );
  if (input.action !== 'refresh' || existing?.settings.connectionStatus !== connectionStatus)
    await client.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
      actorId,
      `whatsapp.${input.action}`,
      JSON.stringify({
        companyId,
        phone,
        status: connectionStatus,
        enabled,
        version: saved.version,
      }),
    ]);
  return { ...connectionView(saved), qrCode };
}
