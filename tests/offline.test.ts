import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueue,
  jobs,
  acknowledge,
  cacheWorkspace,
  getWorkspace,
  clearLocal,
  saveLocal,
  getLocal,
} from '../src/lib/offline';
import type { DocumentInput } from '../src/lib/validation';
test('fila offline separa usuários e não apaga uma edição mais nova ao confirmar envio anterior', async () => {
  const user = crypto.randomUUID(),
    other = crypto.randomUUID(),
    id = crypto.randomUUID();
  try {
    await enqueue(user, { id, path: '/api/documents', body: { version: 1, title: 'Original' } });
    assert.equal((await jobs(other)).length, 0);
    await enqueue(user, {
      id,
      path: '/api/documents',
      body: { version: 1, title: 'Mais recente' },
    });
    await acknowledge(user, id, true, { version: 1, title: 'Original' });
    assert.equal((await jobs(user)).length, 1);
    assert.deepEqual((await jobs(user))[0].body, { version: 1, title: 'Mais recente' });
    await acknowledge(user, id, true, { version: 1, title: 'Mais recente' });
    assert.equal((await jobs(user)).length, 0);
  } finally {
    await clearLocal(user);
    await clearLocal(other);
  }
});
test('logout limpa workspace e rascunhos sem bloquear por conexões abertas', async () => {
  const user = crypto.randomUUID();
  const unitId = crypto.randomUUID();
  await cacheWorkspace(user, { unit: { id: unitId } });
  await saveLocal(user, { id: crypto.randomUUID(), unitId } as DocumentInput);
  assert.equal((await getLocal(user, unitId)).length, 1);
  assert.equal((await getLocal(user, crypto.randomUUID())).length, 0);
  await clearLocal(user);
  assert.equal(await getWorkspace(user), undefined);
  assert.equal((await getLocal(user, unitId)).length, 0);
  await clearLocal(user);
});
