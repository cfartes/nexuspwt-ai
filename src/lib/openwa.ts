import { HttpError, digest } from './security';

export class OpenwaError extends HttpError {
  constructor(
    public providerStatus: number,
    retryAfterSeconds = 60,
  ) {
    super(
      providerStatus === 429 ? 429 : 502,
      providerStatus === 429
        ? `O OpenWA atingiu o limite temporário de requisições. Aguarde ${retryAfterSeconds} segundos antes de tentar novamente.`
        : providerStatus === 401 || providerStatus === 403
          ? 'OpenWA recusou a credencial configurada no servidor.'
          : providerStatus === 404
            ? 'A sessão ou o QR Code não foi encontrado no OpenWA. Atualize a conexão.'
            : `OpenWA não concluiu a operação (HTTP ${providerStatus}). Tente novamente.`,
      providerStatus === 429 ? retryAfterSeconds : undefined,
    );
  }
}
// shortcut: cooldown is per process; share it in PostgreSQL if cross-process coordination is needed.
const rateLimits = new Map<string, number>();
export function openwaRetryAfter(headers: Headers, now = Date.now()) {
  const retry = headers.get('retry-after');
  if (retry) {
    const seconds = /^\d+$/.test(retry)
      ? Number(retry)
      : Math.ceil((Date.parse(retry) - now) / 1000);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(86400, Math.ceil(seconds));
  }
  const waits: number[] = [];
  for (const [name, value] of headers) {
    if (
      !/^x-ratelimit-remaining(?:-.*)?$/.test(name) ||
      !value.trim() ||
      !Number.isFinite(Number(value)) ||
      Number(value) > 0
    )
      continue;
    const reset = Number(headers.get(name.replace('remaining', 'reset')));
    const seconds = reset > 1000000000 ? Math.ceil(reset - now / 1000) : Math.ceil(reset);
    if (Number.isFinite(seconds) && seconds > 0) waits.push(seconds);
  }
  return waits.length ? Math.min(86400, Math.max(...waits)) : 60;
}
function checkCooldown(base: string, key: string) {
  const id = `${base}:${digest(key)}`,
    until = rateLimits.get(id) || 0;
  if (until > Date.now()) throw new OpenwaError(429, Math.ceil((until - Date.now()) / 1000));
  rateLimits.delete(id);
}
function rateLimitError(response: Response, base: string, key: string) {
  const seconds = openwaRetryAfter(response.headers);
  rateLimits.set(`${base}:${digest(key)}`, Date.now() + seconds * 1000);
  return new OpenwaError(429, seconds);
}
export function businessPhone(value: string) {
  const digits = whatsappChatId(value).split('@')[0];
  return !value.trim().startsWith('+') && [10, 11].includes(digits.length) ? `55${digits}` : digits;
}

export function sessionPhone(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 2) return null;
  const item = value as Record<string, unknown>;
  for (const field of [
    'phone',
    'phoneNumber',
    'phone_number',
    'number',
    'user',
    '_serialized',
    'id',
  ]) {
    const raw = item[field];
    if (typeof raw !== 'string') continue;
    let phone = raw;
    if (phone.includes('@')) {
      const [number, suffix] = phone.split('@');
      if (!['c.us', 's.whatsapp.net'].includes(suffix)) continue;
      phone = number.split(':')[0];
    } else if (['id', '_serialized'].includes(field)) continue;
    try {
      return whatsappChatId(phone).split('@')[0];
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }
  }
  for (const field of ['me', 'wid', 'account', 'data', 'session']) {
    const phone = sessionPhone(item[field], depth + 1);
    if (phone) return phone;
  }
  return null;
}

export function safeQr(value: unknown): string | null {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 800000)
    throw new HttpError(502, 'QR Code inválido recebido do OpenWA.');
  const encoded = value.replace(/^data:image\/png;base64,/, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
    bytes.toString('base64') !== encoded ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new HttpError(502, 'QR Code inválido recebido do OpenWA.');
  return `data:image/png;base64,${encoded}`;
}

export async function openwaRequest(
  baseUrl: string,
  key: string,
  path: string,
  payload?: unknown,
): Promise<unknown> {
  const base = openwaBaseUrl(baseUrl);
  if (!key || /[\r\n…]/.test(key) || key.includes('...'))
    throw new HttpError(503, 'Configure a chave completa do OpenWA no servidor.');
  checkCooldown(base, key);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        'X-API-Key': key,
        Accept: 'application/json',
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(502, 'Não foi possível conectar ao OpenWA. Tente novamente.');
  }
  if (response.status === 429) throw rateLimitError(response, base, key);
  if (!response.ok) throw new OpenwaError(response.status);
  try {
    return await response.json();
  } catch {
    throw new HttpError(502, 'OpenWA retornou uma resposta inválida.');
  }
}

export function openwaBaseUrl(value: string) {
  const url = new URL(value);
  const origins = (process.env.OPENWA_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !origins.includes(url.origin)
  )
    throw new HttpError(
      400,
      'Autorize a origem HTTPS do OpenWA em OPENWA_ALLOWED_ORIGINS no servidor.',
    );
  if (!['', '/', '/api', '/api/'].includes(url.pathname))
    throw new HttpError(400, 'Informe a URL raiz do gateway ou a base /api.');
  return `${url.origin}/api`;
}
export async function checkOpenwaSession(baseUrl: string, sessionId: string, key: string) {
  const base = openwaBaseUrl(baseUrl);
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(sessionId))
    throw new HttpError(400, 'Informe o UUID da sessão do WhatsApp.');
  if (!key || /[\r\n…]/.test(key) || key.includes('...'))
    throw new HttpError(400, 'Informe a chave de API completa.');
  checkCooldown(base, key);
  let response: Response;
  try {
    response = await fetch(`${base}/sessions/${sessionId}`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(
      502,
      'Não foi possível conectar ao OpenWA. Confira o gateway, HTTPS e a rede.',
    );
  }
  if (response.status === 429) throw rateLimitError(response, base, key);
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'OpenWA recusou a chave de API.',
      403: 'A chave não possui acesso a esta sessão.',
      404: 'Sessão do OpenWA não encontrada.',
    };
    throw new HttpError(
      502,
      messages[response.status] || 'OpenWA indisponível. Tente novamente mais tarde.',
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new HttpError(502, 'OpenWA retornou uma resposta inválida.');
  }
  const data = body as {
    status?: unknown;
    data?: { status?: unknown };
    session?: { status?: unknown };
  } | null;
  const raw = data?.session?.status ?? data?.data?.status ?? data?.status;
  const status = typeof raw === 'string' ? raw.toUpperCase() : '';
  const known = [
    'READY',
    'CONNECTED',
    'DISCONNECTED',
    'STARTING',
    'STOPPED',
    'INITIALIZING',
    'QR',
    'PAIRING',
    'FAILED',
    'CREATED',
    'QR_READY',
  ];
  if (!known.includes(status))
    throw new HttpError(
      502,
      'Formato do status da sessão não reconhecido. Confira o contrato da API do gateway.',
    );
  return { connected: ['READY', 'CONNECTED'].includes(status), status, phone: sessionPhone(body) };
}

export function whatsappChatId(phone: string) {
  if (!/^\+?[\d ()-]+$/.test(phone))
    throw new HttpError(400, 'Telefone do aprovador inválido. Informe DDI e DDD no cadastro.');
  const digits = phone.replace(/\D/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits))
    throw new HttpError(400, 'Telefone do aprovador inválido. Informe DDI e DDD no cadastro.');
  return `${digits}@c.us`;
}
export async function sendOpenwaText(
  baseUrl: string,
  sessionId: string,
  key: string,
  chatId: string,
  text: string,
): Promise<{ status: 'sent' | 'blocked' | 'uncertain'; error: string | null }> {
  const base = openwaBaseUrl(baseUrl);
  if (
    !/^[a-f\d-]{36}$/i.test(sessionId) ||
    !/^\d{8,15}@c\.us$/.test(chatId) ||
    !text ||
    text.length > 4096
  )
    throw new HttpError(400, 'Dados inválidos para envio pelo OpenWA.');
  let response: Response;
  try {
    checkCooldown(base, key);
    response = await fetch(`${base}/sessions/${sessionId}/messages/send-text`, {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, text, linkPreview: false }),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (error instanceof OpenwaError && error.providerStatus === 429)
      return { status: 'blocked', error: error.message };
    return {
      status: 'uncertain',
      error:
        'Não houve confirmação do envio. Confira o painel do OpenWA antes de tentar novamente.',
    };
  }
  if (response.status === 429)
    return { status: 'blocked', error: rateLimitError(response, base, key).message };
  if ([400, 401, 403, 404, 422].includes(response.status))
    return {
      status: 'blocked',
      error: 'OpenWA recusou o envio. Confira chave, sessão, telefone e limites do gateway.',
    };
  if (!response.ok)
    return {
      status: 'uncertain',
      error: 'OpenWA retornou erro após a tentativa. Confira o painel antes de reenviar.',
    };
  const body = await response.json().catch(() => null);
  if (
    body &&
    body.success !== false &&
    !body.error &&
    (body.success === true ||
      typeof body.messageId === 'string' ||
      typeof body.id === 'string' ||
      typeof body.data?.messageId === 'string' ||
      typeof body.data?.id === 'string')
  )
    return { status: 'sent', error: null };
  return {
    status: 'uncertain',
    error: 'O gateway não retornou uma confirmação reconhecida. Verifique o envio no OpenWA.',
  };
}
