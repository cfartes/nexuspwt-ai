import type { PoolClient } from 'pg';
export function onlineMigrations(client: Pick<PoolClient, 'query'>, directory: URL): Promise<void>;
