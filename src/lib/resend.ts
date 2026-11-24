export async function sendResendEmail(
  key: string,
  from: string,
  to: string,
  text: string,
  deliveryId: string,
  subject = 'Nexus PTW · Defina sua senha',
): Promise<{ status: 'sent' | 'blocked' | 'uncertain'; error: string | null }> {
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `nexus-invitation/${deliveryId}`,
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return {
      status: 'uncertain',
      error: 'Resend não confirmou o envio. Confira o provedor antes de gerar outro convite.',
    };
  }
  if ([400, 401, 403, 404, 409, 422, 429].includes(response.status))
    return {
      status: 'blocked',
      error: 'Resend recusou o envio. Confira a chave, o remetente verificado e os limites.',
    };
  if (response.ok) {
    const data = await response.json().catch(() => null);
    if (data && typeof data.id === 'string') return { status: 'sent', error: null };
  }
  return {
    status: 'uncertain',
    error: 'Resultado do e-mail não confirmado. Confira o Resend antes de gerar outro convite.',
  };
}
