import { z } from 'zod';
const csrfResponse = z.object({ token: z.string().regex(/^[a-f\d]{64}$/) });
let pendingToken: Promise<string> | undefined;
async function token(signal?: AbortSignal | null): Promise<string> {
  pendingToken ??= (async () => {
    const response = await fetch('/api/csrf', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (!response.ok)
      throw new Error('Não foi possível validar a segurança da sessão. Atualize o aplicativo.');
    return csrfResponse.parse(await response.json()).token;
  })().catch((error: unknown) => {
    pendingToken = undefined;
    throw error;
  });
  return pendingToken;
}
export async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/') || path.startsWith('//'))
    throw new Error('Destino de API inválido.');
  const method = (options.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return fetch(path, options);
  const headers = new Headers(options.headers);
  headers.set('X-Nexus-CSRF', await token(options.signal));
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (response.headers.get('X-Nexus-CSRF-Required') !== '1') return response;
  // Only repeat an explicit CSRF refusal, issued before the operation executes.
  pendingToken = undefined;
  headers.set('X-Nexus-CSRF', await token(options.signal));
  return fetch(path, { ...options, headers, credentials: 'same-origin' });
}
