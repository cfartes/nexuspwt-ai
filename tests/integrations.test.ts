import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptSecret,
  decryptSecret,
  integrationSchema,
  publicIntegration,
} from '../src/lib/integrations';
import {
  checkOpenwaSession,
  openwaBaseUrl,
  openwaRetryAfter,
  openwaRequest,
  sendOpenwaText,
  OpenwaError,
} from '../src/lib/openwa';
import { apiError } from '../src/lib/http';

test('OpenWA 429: respeita a janela esgotada, preserva Retry-After e suspende novas chamadas', async () => {
  process.env.OPENWA_ALLOWED_ORIGINS = 'https://rate-openwa.example.com';
  assert.equal(openwaRetryAfter(new Headers({ 'Retry-After': '12' })), 12);
  assert.equal(
    openwaRetryAfter(
      new Headers({ 'Retry-After': 'Wed, 18 Nov 2026 21:01:00 GMT' }),
      Date.parse('2026-11-18T21:00:00Z'),
    ),
    60,
  );
  const headers = new Headers({
    'x-ratelimit-remaining-short': '0',
    'x-ratelimit-reset-short': '2',
    'x-ratelimit-remaining-medium': '0',
    'x-ratelimit-reset-medium': '40',
    'x-ratelimit-remaining-long': '900',
    'x-ratelimit-reset-long': '3500',
  });
  assert.equal(
    openwaRetryAfter(headers),
    40,
    'Não usa o reset de uma janela que ainda possui cota',
  );
  assert.equal(openwaRetryAfter(new Headers()), 60);
  const request = mock.method(globalThis, 'fetch', async () =>
    Response.json({ statusCode: 429 }, { status: 429, headers }),
  );
  const base = 'https://rate-openwa.example.com',
    key = 'chave-exclusiva-para-limite',
    id = crypto.randomUUID();
  try {
    let captured: unknown;
    try {
      await openwaRequest(base, key, '/sessions');
    } catch (error) {
      captured = error;
    }
    assert(captured instanceof OpenwaError);
    assert.equal(captured.providerStatus, 429);
    const result = apiError(captured);
    assert.equal(result.status, 429);
    assert.equal(result.headers.get('Retry-After'), '40');
    assert.equal((await result.json()).retryAfterSeconds, 40);
    await assert.rejects(
      openwaRequest(base, key, '/sessions'),
      (error: unknown) => error instanceof OpenwaError && error.status === 429,
    );
    await assert.rejects(
      checkOpenwaSession(base, id, key),
      (error: unknown) => error instanceof OpenwaError && error.status === 429,
    );
    assert.equal(
      (await sendOpenwaText(base, id, key, '5511999999999@c.us', 'Não deve enviar')).status,
      'blocked',
    );
    assert.equal(
      request.mock.callCount(),
      1,
      'Consulta e envio respeitam o mesmo cooldown, sem POST nem repetição imediata',
    );
  } finally {
    request.mock.restore();
    delete process.env.OPENWA_ALLOWED_ORIGINS;
  }
});

test('credenciais criptografadas são vinculadas à empresa e serviço e não aparecem na resposta', () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64);
  const company = crypto.randomUUID(),
    value = 'token-de-teste-secreto';
  const encrypted = encryptSecret(value, company, 'signature');
  assert.notEqual(encrypted, encryptSecret(value, company, 'signature'));
  assert.equal(decryptSecret(encrypted, company, 'signature'), value);
  assert.throws(() => decryptSecret(encrypted, crypto.randomUUID(), 'signature'));
  assert.throws(() => decryptSecret(encrypted, company, 'whatsapp'));
  const response = publicIntegration({
    company_id: company,
    service: 'signature',
    provider: 'certisign',
    settings: { environment: 'sandbox' },
    secret_ciphertext: encrypted,
    version: 1,
    updated_at: '',
  });
  assert.equal(response.hasSecret, true);
  assert(!JSON.stringify(response).includes(encrypted));
  assert(!JSON.stringify(response).includes(value));
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'b'.repeat(64);
  assert.throws(() => decryptSecret(encrypted, company, 'signature'));
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  assert.throws(() => encryptSecret(value, company, 'signature'));
});
test('configuração não aceita chave abreviada nem URL insegura', () => {
  const input = {
    service: 'whatsapp',
    provider: 'openwa',
    unitId: crypto.randomUUID(),
    version: 0,
    baseUrl: 'https://openwa.example.com/api',
    sessionId: crypto.randomUUID(),
    secret: 'chave-completa-para-teste',
  };
  assert(integrationSchema.safeParse(input).success);
  assert(!integrationSchema.safeParse({ ...input, secret: 'owa_k1…5c3e5d' }).success);
  assert(
    !integrationSchema.safeParse({ ...input, baseUrl: 'http://openwa.example.com/api' }).success,
  );
  assert(
    !integrationSchema.safeParse({ ...input, baseUrl: 'https://user:pass@openwa.example.com' })
      .success,
  );
});
test('teste OpenWA consulta somente a sessão autorizada, sem enviar mensagens', async () => {
  process.env.OPENWA_ALLOWED_ORIGINS = 'https://openwa.example.com';
  assert.equal(openwaBaseUrl('https://openwa.example.com/api/'), 'https://openwa.example.com/api');
  assert.throws(() => openwaBaseUrl('https://outro.example.com'));
  assert.throws(() => openwaBaseUrl('https://openwa.example.com/api/../../interno'));
  const session = crypto.randomUUID(),
    key = 'chave-de-teste';
  const request = mock.method(globalThis, 'fetch', async (_url: unknown, _options: unknown) =>
    Response.json({ status: 'READY' }),
  );
  try {
    assert.deepEqual(await checkOpenwaSession('https://openwa.example.com', session, key), {
      connected: true,
      status: 'READY',
      phone: null,
    });
    assert.equal(request.mock.callCount(), 1);
    const [url, options] = request.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, `https://openwa.example.com/api/sessions/${session}`);
    assert.equal(options.method, undefined);
    assert.equal(options.redirect, 'error');
    assert.equal((options.headers as Record<string, string>)['X-API-Key'], key);
    request.mock.mockImplementation(async () =>
      Response.json({ status: 'success', data: { status: 'CONNECTED' } }),
    );
    assert.equal(
      (await checkOpenwaSession('https://openwa.example.com', session, key)).connected,
      true,
    );
    request.mock.mockImplementation(async () => Response.json({ status: 'DISCONNECTED' }));
    assert.equal(
      (await checkOpenwaSession('https://openwa.example.com', session, key)).connected,
      false,
    );
    request.mock.mockImplementation(
      async () => new Response('conteúdo com segredo', { status: 401 }),
    );
    await assert.rejects(
      checkOpenwaSession('https://openwa.example.com', session, key),
      (error) => error instanceof Error && error.message === 'OpenWA recusou a chave de API.',
    );
    request.mock.mockImplementation(async () => Response.json({ status: 'UNKNOWN', secret: key }));
    await assert.rejects(
      checkOpenwaSession('https://openwa.example.com', session, key),
      /não reconhecido/,
    );
  } finally {
    request.mock.restore();
    delete process.env.OPENWA_ALLOWED_ORIGINS;
  }
});
