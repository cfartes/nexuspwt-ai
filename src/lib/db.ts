import pg from 'pg';
import { cookies } from 'next/headers';
declare global {
  var nexusPool: pg.Pool | undefined;
}
const pool =
  globalThis.nexusPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_SIZE || 10),
  });
if (process.env.NODE_ENV !== 'production') globalThis.nexusPool = pool;
let checked: Promise<void> | undefined;
async function checkRuntime(): Promise<void> {
  if (process.env.REQUIRE_RESTRICTED_DATABASE !== 'true') return;
  if (!/^[a-f\d]{64}$/i.test(process.env.INTEGRATIONS_ENCRYPTION_KEY || ''))
    throw new Error('Chave de criptografia inválida no ambiente de runtime.');
  if (process.env.COOKIE_SECURE === 'true') {
    const origin = new URL(process.env.APP_URL || '');
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/'
    )
      throw new Error('APP_URL deve ser uma origem HTTPS pública sem credenciais.');
  }
  const {
    rows: [role],
  } = await pool.query<{ unsafe: boolean }>(
    `SELECT
    rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR session_user<>current_user OR
    rolname<>$1 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) OR
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='public' AND nspowner=pg_roles.oid) OR
    EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=pg_roles.oid) OR
    EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=pg_roles.oid) OR
    (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN
      ('documents','document_versions','approvals','photos','audit_events','executor_identity_submissions','executor_identity_files') AND relrowsecurity AND relforcerowsecurity)<>7 unsafe
    FROM pg_roles WHERE rolname=current_user`,
    [process.env.DATABASE_CONTEXT === 'worker' ? 'nexus_worker' : 'nexus_app'],
  );
  if (!role || role.unsafe)
    throw new Error(
      'Banco de runtime sem isolamento obrigatório. Revise roles e migração de segurança.',
    );
}
async function sessionToken(): Promise<string> {
  if (process.env.DATABASE_CONTEXT === 'worker') return '';
  try {
    const token = (await cookies()).get('nexus_session')?.value;
    return token && /^[a-f\d]{64}$/.test(token) ? token : '';
  } catch (error) {
    if (error instanceof Error && error.message.includes('outside a request scope')) return '';
    throw error;
  }
}
async function connect(): Promise<pg.PoolClient> {
  checked ??= checkRuntime().catch((error: unknown) => {
    checked = undefined;
    throw error;
  });
  await checked;
  const token = await sessionToken();
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('nexus.session_token',$1,false)", [token]);
    return client;
  } catch (error) {
    client.release(true);
    throw error;
  }
}
// Keep the existing promise-based Pool API; scope every checkout, including explicit transactions.
export const db = new Proxy(pool, {
  get(target, property) {
    if (property === 'connect') return connect;
    if (property === 'query')
      return async <Row extends pg.QueryResultRow>(
        query: string | pg.QueryConfig,
        values?: unknown[],
      ): Promise<pg.QueryResult<Row>> => {
        const client = await connect();
        try {
          return await client.query<Row>(query, values);
        } finally {
          client.release();
        }
      };
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
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
