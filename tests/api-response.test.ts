import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiJson } from '../src/lib/api-response';

await test('API: HTML, conteúdo vazio e JSON nulo geram erro legível sem expor página ou segredos', async () => {
  for (const status of [200, 502, 504]) {
    await assert.rejects(
      readApiJson(new Response('<!DOCTYPE html><p>private-token</p>', { status })),
      (error: unknown) => {
        assert((error as Error).message.includes(`HTTP ${status}`));
        assert(!(error as Error).message.includes('private-token'));
        assert.equal((error as { status: number }).status, status === 200 ? 502 : status);
        return true;
      },
    );
  }
  for (const body of ['', 'null', 'false'])
    await assert.rejects(readApiJson(new Response(body)), /resposta inválida/);
  assert.deepEqual(await readApiJson(Response.json({ ok: true })), { ok: true });
  assert.deepEqual(await readApiJson(Response.json([])), []);
  assert.deepEqual(
    await readApiJson(Response.json({ error: 'Aguarde', retryAfterSeconds: 120 }, { status: 429 })),
    { error: 'Aguarde', retryAfterSeconds: 120 },
  );
  await assert.rejects(
    readApiJson(
      new Response('<html>limite</html>', { status: 429, headers: { 'Retry-After': '120' } }),
    ),
    (error: unknown) => (error as { retryAfterSeconds: number }).retryAfterSeconds === 120,
  );
});
