import type { Pool, PoolClient } from 'pg';
import { encryptSecret, decryptSecret } from './integrations';
import { HttpError, verifyPassword } from './security';
import type { User } from './auth';
import { createHmac } from 'node:crypto';
import { totpStep } from './totp';
import { personalIdentityState } from './identityPolicyRepository';

function cpfDigest(cpf: string) {
  const key = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new HttpError(503, 'Configure a chave de criptografia do servidor.');
  return createHmac('sha256', Buffer.from(key, 'hex')).update(cpf).digest('hex');
}

export function validCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(cpf[size])) return false;
  }
  return true;
}
export function identitySnapshot(person: {
  name: string;
  email: string;
  phone: string | null;
  contractor_id: string | null;
}) {
  return {
    name: person.name,
    email: person.email,
    phone: person.phone || '',
    contractorId: person.contractor_id,
  };
}

// A transação própria mantém tentativas e consumo do código mesmo se a decisão for recusada depois.
export async function authenticateDecision(
  pool: Pool,
  user: User,
  password: string,
  code = '',
  mode: 'password' | 'totp' | 'confirm' = 'password',
) {
  const c = await pool.connect();
  let error: HttpError | undefined;
  let evidence: { method: string; enabledAt: string | null; authenticatedAt: string } | undefined;
  try {
    await c.query('BEGIN');
    await c.query('INSERT INTO user_security(user_id) VALUES($1) ON CONFLICT DO NOTHING', [
      user.id,
    ]);
    const {
      rows: [row],
    } = await c.query(
      `SELECT s.*,u.password_hash,u.active,u.password_pending FROM user_security s JOIN users u ON u.id=s.user_id WHERE s.user_id=$1 FOR UPDATE OF s`,
      [user.id],
    );
    if (Date.now() - new Date(row.window_at).getTime() >= 900000) {
      row.failures = 0;
      await c.query('UPDATE user_security SET failures=0,window_at=now() WHERE user_id=$1', [
        user.id,
      ]);
    }
    if (row.failures >= 8)
      error = new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos para tentar novamente.');
    else if (!row.active || row.password_pending || !verifyPassword(password, row.password_hash))
      error = new HttpError(403, 'Senha ou código de autenticação inválido.');
    else {
      let step: number | null = null;
      if (mode !== 'password') {
        const encrypted = mode === 'confirm' ? row.pending_ciphertext : row.secret_ciphertext;
        if (
          !encrypted ||
          (mode === 'confirm' && new Date(row.pending_expires_at).getTime() <= Date.now())
        )
          error = new HttpError(403, 'Configure e confirme seu autenticador em Configurações.');
        else {
          step = totpStep(
            decryptSecret(encrypted, user.id, 'totp'),
            code,
            mode === 'confirm' ? -1 : Number(row.last_step),
          );
          if (step === null)
            error = new HttpError(
              403,
              'Código inválido ou já utilizado. Aguarde o próximo código.',
            );
        }
      }
      if (!error) {
        if (mode === 'confirm')
          await c.query(
            'UPDATE user_security SET secret_ciphertext=pending_ciphertext,enabled_at=now(),last_step=$2,pending_ciphertext=NULL,pending_expires_at=NULL,failures=0 WHERE user_id=$1',
            [user.id, step],
          );
        else if (step !== null)
          await c.query('UPDATE user_security SET last_step=$2,failures=0 WHERE user_id=$1', [
            user.id,
            step,
          ]);
        evidence = {
          method: mode === 'password' ? 'password' : 'password_totp',
          enabledAt: row.enabled_at ? new Date(row.enabled_at).toISOString() : null,
          authenticatedAt: new Date().toISOString(),
        };
        if (mode === 'confirm')
          await c.query(
            "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'seguranca.autenticador_ativado','{}')",
            [user.id],
          );
      }
    }
    if (error && error.status !== 429)
      await c.query('UPDATE user_security SET failures=failures+1 WHERE user_id=$1', [user.id]);
    if (error && error.status !== 429)
      await c.query(
        "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'seguranca.confirmacao_recusada',$2)",
        [user.id, JSON.stringify({ method: mode })],
      );
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  if (error) throw error;
  return evidence!;
}

export async function assertDecisionIdentity(
  c: PoolClient,
  user: User,
  unitId: string,
  evidence: Awaited<ReturnType<typeof authenticateDecision>>,
) {
  const {
    rows: [row],
  } = await c.query(
    `SELECT u.name,u.email,u.platform_admin,COALESCE(m.phone,u.phone) phone,m.contractor_id,m.identity_verified_at,m.identity_verified_by,m.identity_snapshot,
    co.id company_id,co.identity_upload_enabled,co.approval_mfa_required,s.enabled_at FROM users u JOIN memberships m ON m.user_id=u.id JOIN units un ON un.id=m.unit_id JOIN companies co ON co.id=un.company_id
    LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=$1 AND m.unit_id=$2 AND u.active AND m.active FOR SHARE OF u,m,co`,
    [user.id, unitId],
  );
  if (row?.platform_admin)
    return { verifiedAt: null, verifiedBy: null, exemption: 'nexus_superadmin', ...evidence };
  const expected = row ? identitySnapshot(row) : null;
  const personal =
    row?.identity_upload_enabled && row.contractor_id
      ? await personalIdentityState(c, user.id, row.company_id, row.contractor_id, true)
      : null;
  if (
    personal
      ? personal.required
      : !row?.identity_verified_at ||
        !expected ||
        Object.entries(expected).some(([key, value]) => row.identity_snapshot?.[key] !== value)
  )
    throw new HttpError(
      403,
      'Sua identidade e vínculo precisam ser conferidos por outro administrador em Pessoas e acessos.',
    );
  if (row.approval_mfa_required) {
    const {
      rows: [factor],
    } = await c.query('SELECT enabled_at FROM user_security WHERE user_id=$1 FOR SHARE', [user.id]);
    if (
      evidence.method !== 'password_totp' ||
      !factor?.enabled_at ||
      new Date(factor.enabled_at).toISOString() !== evidence.enabledAt
    )
      throw new HttpError(403, 'Esta empresa exige senha e autenticador para registrar decisões.');
  }
  return {
    verifiedAt: personal?.reviewedAt ?? row.identity_verified_at,
    verifiedBy: personal?.reviewedBy ?? row.identity_verified_by,
    ...evidence,
  };
}

export async function recordIdentity(
  c: PoolClient,
  actor: User,
  unitId: string,
  userId: string,
  cpf: string,
  reference: string,
  version: number,
) {
  if (actor.id === userId)
    throw new HttpError(403, 'Outro administrador deve conferir sua identidade.');
  if (!validCpf(cpf)) throw new HttpError(400, 'CPF inválido.');
  const {
    rows: [person],
  } = await c.query(
    `SELECT u.name,u.email,u.platform_admin,u.password_pending,COALESCE(m.phone,u.phone) phone,m.contractor_id,m.version FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.unit_id=$2 AND u.active AND m.active FOR UPDATE OF m`,
    [userId, unitId],
  );
  if (!person || person.password_pending || (!actor.platform_admin && person.platform_admin))
    throw new HttpError(403, 'Conta indisponível ou aguardando definição de senha.');
  if (person.platform_admin)
    throw new HttpError(403, 'Superadmin Nexus é dispensado de conferência de identidade.');
  if (person.version !== version)
    throw new HttpError(409, 'Cadastro alterado. Recarregue e confira os dados novamente.');
  if (!person.phone)
    throw new HttpError(400, 'Preencha o telefone antes de conferir a identidade.');
  await c.query('INSERT INTO user_security(user_id) VALUES($1) ON CONFLICT DO NOTHING', [userId]);
  const {
    rows: [security],
  } = await c.query('SELECT cpf_hash FROM user_security WHERE user_id=$1 FOR UPDATE', [userId]);
  if (security.cpf_hash && security.cpf_hash !== cpfDigest(cpf))
    throw new HttpError(
      409,
      'CPF diferente do já conferido. Solicite correção assistida ao superadmin.',
    );
  await c.query(
    'UPDATE user_security SET cpf_hash=$2,cpf_ciphertext=$3,cpf_last4=$4 WHERE user_id=$1',
    [userId, cpfDigest(cpf), encryptSecret(cpf, userId, 'cpf'), cpf.slice(-4)],
  );
  await c.query(
    'UPDATE memberships SET identity_verified_at=now(),identity_verified_by=$3,identity_snapshot=$4,version=version+1 WHERE user_id=$1 AND unit_id=$2',
    [userId, unitId, actor.id, JSON.stringify(identitySnapshot(person))],
  );
  await c.query(
    "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'seguranca.identidade_conferida',$2)",
    [actor.id, JSON.stringify({ unitId, userId, reference })],
  );
}
