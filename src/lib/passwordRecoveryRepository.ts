import type { PoolClient } from 'pg';
type RecoveryAccount = { id: string; email: string; active: boolean; password_pending: boolean };
export type RecoveryDelivery = {
  id: string;
  recipient: string;
  token_ciphertext: string;
  secret_ciphertext: string | null;
  sender: string | null;
};

export async function allowRecoveryRequest(
  client: PoolClient,
  emailHash: string,
): Promise<boolean> {
  await client.query("DELETE FROM password_recovery_limits WHERE window_at<now()-interval '1 day'");
  // Bound arbitrary addresses too, without trusting caller-supplied proxy IPs.
  for (const [bucket, limit] of [
    ['global', 100],
    [emailHash, 3],
  ] as const) {
    const {
      rows: [budget],
    } = await client.query<{ attempts: number }>(
      `INSERT INTO password_recovery_limits(bucket) VALUES($1) ON CONFLICT(bucket) DO UPDATE SET
       attempts=CASE WHEN password_recovery_limits.window_at<now()-interval '15 minutes' THEN 1 ELSE password_recovery_limits.attempts+1 END,
       window_at=CASE WHEN password_recovery_limits.window_at<now()-interval '15 minutes' THEN now() ELSE password_recovery_limits.window_at END RETURNING attempts`,
      [bucket],
    );
    if (budget.attempts > limit) return false;
  }
  return true;
}
export async function recoveryAccount(
  client: PoolClient,
  email: string,
): Promise<RecoveryAccount | undefined> {
  const {
    rows: [account],
  } = await client.query<RecoveryAccount>(
    'SELECT id,email,active,password_pending FROM users WHERE email=$1 FOR UPDATE',
    [email],
  );
  return account;
}
export async function replaceRecovery(
  client: PoolClient,
  account: RecoveryAccount,
  recovery: { id: string; hash: string; encrypted: string },
): Promise<void> {
  await client.query(
    `UPDATE password_recoveries SET consumed_at=now(),token_ciphertext=NULL,
    status=CASE WHEN status IN ('pending','blocked') THEN 'cancelled' ELSE status END WHERE user_id=$1 AND consumed_at IS NULL`,
    [account.id],
  );
  await client.query(
    'INSERT INTO password_recoveries(id,user_id,recipient,token_hash,token_ciphertext) VALUES($1,$2,$3,$4,$5)',
    [recovery.id, account.id, account.email, recovery.hash, recovery.encrypted],
  );
}
export async function consumeRecovery(
  client: PoolClient,
  tokenHash: string,
  passwordHash: string,
): Promise<boolean> {
  const {
    rows: [target],
  } = await client.query<{ user_id: string }>(
    'SELECT user_id FROM password_recoveries WHERE token_hash=$1',
    [tokenHash],
  );
  if (!target) return false;
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [target.user_id]);
  const {
    rows: [recovery],
  } = await client.query<{ id: string; user_id: string }>(
    `SELECT r.id,r.user_id FROM password_recoveries r JOIN users u ON u.id=r.user_id
     WHERE r.token_hash=$1 AND r.consumed_at IS NULL AND r.expires_at>now() AND u.active AND NOT u.password_pending
     AND r.recipient=u.email FOR UPDATE OF r`,
    [tokenHash],
  );
  if (!recovery) return false;
  await client.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
    recovery.user_id,
    passwordHash,
  ]);
  await client.query(
    `UPDATE password_recoveries SET consumed_at=now(),token_ciphertext=NULL,
    status=CASE WHEN status IN ('pending','blocked') THEN 'cancelled' ELSE status END WHERE user_id=$1 AND consumed_at IS NULL`,
    [recovery.user_id],
  );
  await client.query('DELETE FROM sessions WHERE user_id=$1', [recovery.user_id]);
  await client.query(
    'DELETE FROM login_attempts WHERE email=(SELECT email FROM users WHERE id=$1)',
    [recovery.user_id],
  );
  await client.query(
    `INSERT INTO audit_events(actor_id,action,company_id,details)
    SELECT $1,'usuario.senha_recuperada',scope.company_id,'{}' FROM (
      SELECT un.company_id FROM memberships m JOIN units un ON un.id=m.unit_id WHERE m.user_id=$1 AND m.active
      UNION SELECT company_id FROM company_admins WHERE user_id=$1 AND active
    ) scope`,
    [recovery.user_id],
  );
  await client.query(
    `INSERT INTO audit_events(actor_id,action,details)
    SELECT id,'usuario.senha_recuperada','{}' FROM users WHERE id=$1 AND platform_admin`,
    [recovery.user_id],
  );
  return true;
}
export async function claimRecoveryDelivery(
  client: PoolClient,
): Promise<RecoveryDelivery | undefined> {
  await client.query(
    `UPDATE password_recoveries SET status='uncertain',last_error='Envio interrompido. Confira o Resend.'
     WHERE status='sending' AND started_at<now()-interval '2 minutes'`,
  );
  await client.query(`UPDATE password_recoveries SET token_ciphertext=NULL,status=CASE WHEN status IN ('pending','blocked') THEN 'cancelled' ELSE status END
    WHERE token_ciphertext IS NOT NULL AND (consumed_at IS NOT NULL OR expires_at<=now())`);
  const {
    rows: [delivery],
  } = await client.query<RecoveryDelivery>(
    `UPDATE password_recoveries SET status='sending',started_at=now(),last_error=NULL WHERE id=(
       SELECT r.id FROM password_recoveries r JOIN users u ON u.id=r.user_id
       WHERE r.status IN ('pending','blocked') AND r.available_at<=now() AND r.expires_at>now() AND r.consumed_at IS NULL
       AND u.active AND NOT u.password_pending AND u.email=r.recipient ORDER BY r.created_at LIMIT 1 FOR UPDATE OF r SKIP LOCKED)
     RETURNING id,recipient,token_ciphertext,(SELECT secret_ciphertext FROM email_gateway WHERE singleton),
       (SELECT sender FROM email_gateway WHERE singleton)`,
  );
  return delivery;
}
export async function finishRecoveryDelivery(
  client: PoolClient,
  id: string,
  status: 'sent' | 'blocked' | 'uncertain',
  error: string | null,
): Promise<void> {
  await client.query(
    `UPDATE password_recoveries SET status=$2,last_error=$3,available_at=now()+interval '1 minute',
    token_ciphertext=CASE WHEN $2='sent' THEN NULL ELSE token_ciphertext END WHERE id=$1 AND status='sending'`,
    [id, status, error],
  );
}
