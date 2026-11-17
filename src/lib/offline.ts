import { openDB, deleteDB } from 'idb';
import type { DocumentInput } from './validation';
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
        connections.get(userId)?.then((db) => db.close());
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
  return db.get('cache', 'workspace');
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
