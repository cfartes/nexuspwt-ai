import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { GET } from '../src/app/api/version/route';

await test('versão sem cache e service worker só ativa por comando explícito, sem apagar IndexedDB', async () => {
  const response = GET();
  assert(response.headers.get('Cache-Control')?.includes('no-store'));
  assert.equal(typeof (await response.json()).release, 'string');
  let activations = 0;
  const handlers: Record<
    string,
    (event: { data: { type: string }; waitUntil: (value: unknown) => void }) => void
  > = {};
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name: string, callback: (typeof handlers)[string]) => {
        handlers[name] = callback;
      },
      skipWaiting: async () => {
        activations++;
      },
    },
  });
  assert.equal(activations, 0);
  handlers.message({ data: { type: 'OTHER' }, waitUntil: () => undefined });
  assert.equal(activations, 0);
  handlers.message({ data: { type: 'ACTIVATE_UPDATE' }, waitUntil: () => undefined });
  assert.equal(activations, 1);
  assert(!source.includes('indexedDB'));
});
