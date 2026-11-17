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
