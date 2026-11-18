import { ZodError } from 'zod';
import { HttpError } from './security';
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
  console.error('Falha na operação', error instanceof Error ? error.message : 'erro desconhecido');
  return Response.json(
    { error: 'Não foi possível concluir a operação. Verifique a conexão com o banco.' },
    { status: 503 },
  );
}
