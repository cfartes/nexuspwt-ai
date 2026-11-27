import { ZodError } from 'zod';
import { HttpError } from './security';
export async function readJsonBody(request: Request): Promise<unknown> {
  const limit = 15 * 1024 * 1024;
  if (Number(request.headers.get('Content-Length')) > limit)
    throw new HttpError(413, 'Solicitação excede o limite de 15 MB.');
  if (!request.body) throw new SyntaxError('JSON ausente.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, 'Solicitação excede o limite de 15 MB.');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
export function apiError(error: unknown) {
  if (error instanceof HttpError)
    return Response.json(
      {
        error: error.message,
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      },
      {
        status: error.status,
        ...(error.retryAfterSeconds
          ? { headers: { 'Retry-After': String(error.retryAfterSeconds) } }
          : {}),
      },
    );
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  const code = (error as { code?: string })?.code;
  if (code === '23505')
    return Response.json({ error: 'Já existe um cadastro com estes dados.' }, { status: 409 });
  if (code === '23503')
    return Response.json({ error: 'Cadastro vinculado inválido.' }, { status: 400 });
  if (code === '42501')
    return Response.json({ error: 'Operação não permitida para este acesso.' }, { status: 403 });
  console.error({
    event: 'api_operation_failed',
    kind: error instanceof Error ? error.name : 'unknown',
    code: typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : undefined,
  });
  return Response.json(
    { error: 'Não foi possível concluir a operação. Verifique a conexão com o banco.' },
    { status: 503 },
  );
}
