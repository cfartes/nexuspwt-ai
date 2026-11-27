import { db } from './db';
import type { Pool } from 'pg';
import { digest, HttpError } from './security';
export async function requestIdentity(
  token: string | undefined,
  client: Pick<Pool, 'query'> = db,
): Promise<string> {
  if (!token || !/^[a-f\d]{64}$/.test(token)) return 'anonymous';
  const {
    rows: [session],
  } = await client.query<{ user_id: string }>(
    `SELECT s.user_id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes' AND u.active AND NOT u.password_pending`,
    [digest(token)],
  );
  return session?.user_id || 'anonymous';
}
export async function enforceRequestLimit(
  identity: string,
  bucket: string,
  limit: number,
  client: Pick<Pool, 'query'> = db,
): Promise<void> {
  if (bucket === 'global')
    await client.query("DELETE FROM request_limits WHERE window_at<now()-interval '1 day'");
  const key = digest(`${bucket}:${identity}`);
  const {
    rows: [budget],
  } = await client.query<{ attempts: number; retry: number }>(
    `INSERT INTO request_limits(bucket) VALUES($1) ON CONFLICT(bucket) DO UPDATE SET
     attempts=CASE WHEN request_limits.window_at<now()-interval '1 minute' THEN 1 ELSE least(request_limits.attempts+1,1000000) END,
     window_at=CASE WHEN request_limits.window_at<now()-interval '1 minute' THEN now() ELSE request_limits.window_at END
     RETURNING attempts,greatest(1,ceil(extract(epoch FROM window_at+interval '1 minute'-now())))::int retry`,
    [key],
  );
  if (budget.attempts > limit)
    throw new HttpError(429, 'Muitas solicitações. Aguarde e tente novamente.', budget.retry);
}
