import { HttpError } from './security';

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
  ];
  if (!known.includes(status))
    throw new HttpError(
      502,
      'Formato do status da sessão não reconhecido. Confira o contrato da API do gateway.',
    );
  return { connected: ['READY', 'CONNECTED'].includes(status), status };
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
    response = await fetch(`${base}/sessions/${sessionId}/messages/send-text`, {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, text, linkPreview: false }),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return {
      status: 'uncertain',
      error:
        'Não houve confirmação do envio. Confira o painel do OpenWA antes de tentar novamente.',
    };
  }
  if ([400, 401, 403, 404, 422, 429].includes(response.status))
    return {
      status: 'blocked',
      error: 'OpenWA recusou o envio. Confira chave, sessão, telefone e limites do gateway.',
    };
  if (!response.ok)
    return {
      status: 'uncertain',
      error: 'OpenWA retornou erro após a tentativa. Confira o painel antes de reenviar.',
    };
  try {
    const body = await response.json();
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
  } catch {}
  return {
    status: 'uncertain',
    error: 'O gateway não retornou uma confirmação reconhecida. Verifique o envio no OpenWA.',
  };
}
