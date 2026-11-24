import { openDB, deleteDB } from 'idb';
import type { DocumentInput } from './validation';
import { ACCESS_POLICY_VERSION } from './permissions';
export type Pending = { id: string; path: string; body: unknown; error?: string };
const connections = new Map<string, ReturnType<typeof openDB>>();
function store(userId: string) {
  let connection = connections.get(userId);
  if (!connection) {
    connection = openDB(`nexus-${userId}`, 1, {
      upgrade(db) {
        db.createObjectStore('cache');
        db.createObjectStore('queue', { keyPath: 'id' });
        db.createObjectStore('drafts', { keyPath: 'id' });
      },
      blocking() {
        connections
          .get(userId)
          ?.then((db) => db.close())
          .catch(() => console.error({ event: 'offline_connection_close_failed' }));
        connections.delete(userId);
      },
    });
    connections.set(userId, connection);
  }
  return connection;
}
export async function cacheWorkspace(userId: string, value: unknown) {
  const db = await store(userId);
  await db.put('cache', value, 'workspace');
}
export async function getWorkspace(userId: string) {
  const db = await store(userId);
  const workspace = await db.get('cache', 'workspace');
  return workspace?.accessPolicyVersion === ACCESS_POLICY_VERSION ? workspace : undefined;
}
export async function saveLocal(userId: string, d: DocumentInput) {
  const db = await store(userId);
  await db.put('drafts', d);
}
export async function getLocal(userId: string, unitId: string): Promise<DocumentInput[]> {
  const db = await store(userId);
  return (await db.getAll('drafts')).filter((d) => d.unitId === unitId);
}
export async function enqueue(userId: string, job: Pending) {
  const db = await store(userId);
  await db.put('queue', job);
}
export async function jobs(userId: string): Promise<Pending[]> {
  const db = await store(userId);
  return db.getAll('queue');
}
export async function acknowledge(
  userId: string,
  id: string,
  document: boolean,
  expectedBody: unknown,
) {
  const db = await store(userId);
  const tx = db.transaction(['queue', 'drafts'], 'readwrite');
  const queued = await tx.objectStore('queue').get(id);
  if (queued && JSON.stringify(queued.body) === JSON.stringify(expectedBody)) {
    await tx.objectStore('queue').delete(id);
    if (document) await tx.objectStore('drafts').delete(id);
  }
  await tx.done;
}
export async function clearLocal(userId: string) {
  (await store(userId)).close();
  connections.delete(userId);
  await deleteDB(`nexus-${userId}`);
}

export async function assertNoLocalPtForApr(userId: string, aprId: string) {
  const db = await store(userId);
  const tx = db.transaction(['drafts', 'queue']);
  const drafts = await tx.objectStore('drafts').getAll();
  const queue = await tx.objectStore('queue').getAll();
  await tx.done;
  if (
    drafts.some((d) => d.kind === 'PT' && d.aprId === aprId) ||
    queue.some(
      (job) => job.path === '/api/documents' && job.body?.kind === 'PT' && job.body.aprId === aprId,
    )
  )
    throw new Error(
      'Esta APR possui uma PT salva neste dispositivo, aguardando sincronização. Exclua ou sincronize a PT antes de remover a APR.',
    );
}

export async function discardDocument(userId: string, id: string, kind: 'APR' | 'PT') {
  const db = await store(userId);
  const tx = db.transaction(['drafts', 'queue'], 'readwrite');
  const draft = await tx.objectStore('drafts').get(id);
  const queue = await tx.objectStore('queue').getAll();
  if (
    (draft && draft.kind !== kind) ||
    queue.some(
      (job) =>
        job.id === id &&
        job.path === '/api/documents' &&
        (job.body?.kind !== kind || job.body?.id !== id),
    )
  ) {
    await tx.done;
    throw new Error(
      'O tipo do documento não corresponde ao rascunho local. Nenhum rascunho foi excluído.',
    );
  }
  await tx.objectStore('drafts').delete(id);
  for (const job of queue)
    if (
      (job.id === id && job.path === '/api/documents') ||
      (kind === 'PT' && job.path === `/api/documents/${id}/photos`)
    )
      await tx.objectStore('queue').delete(job.id);
  await tx.done;
}
