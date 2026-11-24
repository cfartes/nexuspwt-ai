export async function readApiJson(response: Response) {
  try {
    const result = await response.json();
    if (result === null || typeof result !== 'object') throw new Error('Invalid response');
    return result;
  } catch {
    const retry = response.headers.get('Retry-After') || '';
    const seconds = /^\d+$/.test(retry)
      ? Number(retry)
      : Math.ceil((Date.parse(retry) - Date.now()) / 1000);
    throw Object.assign(
      new Error(
        `A API do aplicativo retornou uma resposta inválida (HTTP ${response.status}), em vez de JSON. Verifique o serviço do app e o proxy da VPS.`,
      ),
      {
        status: response.status >= 400 ? response.status : 502,
        ...(response.status === 429
          ? { retryAfterSeconds: Math.max(1, Math.min(86400, seconds || 60)) }
          : {}),
      },
    );
  }
}
