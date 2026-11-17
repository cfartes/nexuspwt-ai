import pg from 'pg';
const globalDb = globalThis as unknown as { nexusPool?: pg.Pool };
export const db =
  globalDb.nexusPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_SIZE || 10),
  });
if (process.env.NODE_ENV !== 'production') globalDb.nexusPool = db;
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
