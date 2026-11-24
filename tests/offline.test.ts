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
  assertNoLocalPtForApr,
  discardDocument,
} from '../src/lib/offline';
import type { DocumentInput } from '../src/lib/validation';
import { ACCESS_POLICY_VERSION } from '../src/lib/permissions';

await test('excluir PT local remove somente ela e seus envios; APR e outros usuários permanecem intactos', async () => {
  const user = crypto.randomUUID(),
    other = crypto.randomUUID(),
    unitId = crypto.randomUUID();
  const apr = { id: crypto.randomUUID(), kind: 'APR', unitId } as DocumentInput;
  const pt = { id: crypto.randomUUID(), kind: 'PT', unitId, aprId: apr.id } as DocumentInput;
  const anotherPt = { ...pt, id: crypto.randomUUID() };
  try {
    for (const draft of [apr, pt, anotherPt]) {
      await saveLocal(user, draft);
      await enqueue(user, { id: draft.id, path: '/api/documents', body: draft });
    }
    await saveLocal(other, pt);
    await enqueue(other, { id: pt.id, path: '/api/documents', body: pt });
    await enqueue(user, { id: 'photo', path: `/api/documents/${pt.id}/photos`, body: {} });
    await enqueue(user, {
      id: 'other-photo',
      path: `/api/documents/${anotherPt.id}/photos`,
      body: {},
    });
    await assert.rejects(assertNoLocalPtForApr(user, apr.id), /PT salva neste dispositivo/);
    await assert.rejects(discardDocument(user, apr.id, 'PT'), /tipo do documento/);
    assert.equal((await getLocal(user, unitId)).length, 3);
    await discardDocument(user, pt.id, 'PT');
    assert.deepEqual(
      (await getLocal(user, unitId)).map((d) => d.id).sort(),
      [apr.id, anotherPt.id].sort(),
    );
    assert.deepEqual(
      (await jobs(user)).map((job) => job.id).sort(),
      [apr.id, anotherPt.id, 'other-photo'].sort(),
    );
    assert.equal((await jobs(other)).length, 1);
    assert.equal((await getLocal(other, unitId)).length, 1);
    await discardDocument(user, anotherPt.id, 'PT');
    await assertNoLocalPtForApr(user, apr.id);
    assert.deepEqual(
      (await getLocal(user, unitId)).map((d) => d.id),
      [apr.id],
    );
    await enqueue(user, { id: pt.id, path: '/api/documents', body: pt });
    await assert.rejects(assertNoLocalPtForApr(user, apr.id), /PT salva neste dispositivo/);
    await discardDocument(user, pt.id, 'PT');
    await assertNoLocalPtForApr(user, apr.id);
  } finally {
    await clearLocal(user);
    await clearLocal(other);
  }
});

await test('cache anterior à matriz de acesso exige reconexão sem apagar a fila local', async () => {
  const user = crypto.randomUUID();
  try {
    await enqueue(user, { id: crypto.randomUUID(), path: '/api/documents', body: {} });
    await cacheWorkspace(user, { unit: { id: 'legacy' } });
    assert.equal(await getWorkspace(user), undefined);
    assert.equal((await jobs(user)).length, 1);
    await cacheWorkspace(user, {
      accessPolicyVersion: ACCESS_POLICY_VERSION,
      unit: { id: 'current' },
    });
    assert.equal((await getWorkspace(user)).unit.id, 'current');
  } finally {
    await clearLocal(user);
  }
});
await test('fila offline separa usuários e não apaga uma edição mais nova ao confirmar envio anterior', async () => {
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
await test('logout limpa workspace e rascunhos sem bloquear por conexões abertas', async () => {
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
