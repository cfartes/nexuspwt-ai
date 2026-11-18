import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { encryptSecret } from './integrations';
import { digest, hashPassword, HttpError } from './security';

export async function createInvitation(
  client: PoolClient,
  actorId: string,
  userId: string,
  unitId: string,
) {
  const {
    rows: [user],
  } = await client.query(
    `SELECT u.*,COALESCE(m.phone,u.phone) invitation_phone FROM users u
    JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.unit_id=$2 AND m.active AND u.active FOR UPDATE OF u`,
    [userId, unitId],
  );
  if (!user?.password_pending)
    throw new HttpError(
      409,
      'Este usuário já definiu a senha ou não possui acesso ativo à unidade.',
    );
  await client.query(
    'UPDATE user_invitations SET consumed_at=now(),token_ciphertext=NULL WHERE user_id=$1 AND consumed_at IS NULL',
    [userId],
  );
  await client.query(
    `UPDATE invitation_deliveries d SET status='cancelled',last_error='Convite substituído.' FROM user_invitations i
    WHERE i.id=d.invitation_id AND i.user_id=$1 AND d.status IN ('pending','blocked')`,
    [userId],
  );
  const token = randomBytes(32).toString('hex'),
    id = randomUUID();
  await client.query(
    'INSERT INTO user_invitations(id,user_id,unit_id,token_hash,token_ciphertext,created_by) VALUES($1,$2,$3,$4,$5,$6)',
    [id, userId, unitId, digest(token), encryptSecret(token, id, 'invitation'), actorId],
  );
  await client.query(
    "INSERT INTO invitation_deliveries(invitation_id,channel,recipient) VALUES($1,'email',$2),($1,'whatsapp',$3)",
    [id, user.email, user.invitation_phone || ''],
  );
  await client.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
    actorId,
    'usuario.convite_criado',
    JSON.stringify({ userId, unitId, invitationId: id }),
  ]);
}
export async function acceptInvitation(client: PoolClient, token: string, password: string) {
  // Serialize per account before locking invitations, matching reissue and preventing token reuse.
  const {
    rows: [target],
  } = await client.query('SELECT user_id FROM user_invitations WHERE token_hash=$1', [
    digest(token),
  ]);
  if (!target)
    throw new HttpError(
      400,
      'Convite inválido, expirado ou já utilizado. Solicite um novo ao administrador.',
    );
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [target.user_id]);
  const {
    rows: [invitation],
  } = await client.query(
    `SELECT i.id,i.user_id FROM user_invitations i JOIN users u ON u.id=i.user_id
    JOIN memberships m ON m.user_id=i.user_id AND m.unit_id=i.unit_id WHERE i.token_hash=$1 AND i.consumed_at IS NULL
    AND i.expires_at>now() AND u.active AND u.password_pending AND m.active FOR UPDATE OF i,m`,
    [digest(token)],
  );
  if (!invitation)
    throw new HttpError(
      400,
      'Convite inválido, expirado ou já utilizado. Solicite um novo ao administrador.',
    );
  await client.query('UPDATE users SET password_hash=$2,password_pending=false WHERE id=$1', [
    invitation.user_id,
    hashPassword(password),
  ]);
  await client.query(
    'UPDATE user_invitations SET consumed_at=now(),token_ciphertext=NULL WHERE user_id=$1 AND consumed_at IS NULL',
    [invitation.user_id],
  );
  await client.query(
    `UPDATE invitation_deliveries d SET status='cancelled',last_error='Senha já definida.' FROM user_invitations i
    WHERE i.id=d.invitation_id AND i.user_id=$1 AND d.status IN ('pending','blocked')`,
    [invitation.user_id],
  );
  await client.query('DELETE FROM sessions WHERE user_id=$1', [invitation.user_id]);
  await client.query(
    'DELETE FROM login_attempts WHERE email=(SELECT email FROM users WHERE id=$1)',
    [invitation.user_id],
  );
  await client.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
    invitation.user_id,
    'usuario.senha_definida',
    JSON.stringify({ invitationId: invitation.id }),
  ]);
}
export function invitationLink(token: string) {
  const url = new URL(process.env.APP_URL || '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new HttpError(
      503,
      'Configure APP_URL com a origem HTTPS pública do app antes de enviar convites.',
    );
  return `${url.origin}/definir-senha#token=${token}`;
}
