import type { PoolClient } from 'pg';
import { cpfDigest, validCpf } from './approval-security';
import { encryptSecret } from './integrations';
import { HttpError } from './security';

export async function savePersonCpf(
  client: PoolClient,
  userId: string,
  cpf: string,
): Promise<void> {
  if (!validCpf(cpf)) throw new HttpError(400, 'Informe CPF válido para o colaborador.');
  const existing = (
    await client.query<{ cpf_hash: string | null }>(
      'SELECT cpf_hash FROM user_security WHERE user_id=$1 FOR UPDATE',
      [userId],
    )
  ).rows[0];
  if (existing?.cpf_hash && existing.cpf_hash !== cpfDigest(cpf))
    throw new HttpError(409, 'CPF incompatível com a conta existente. Solicite correção.');
  await client.query(
    'INSERT INTO user_security(user_id,cpf_hash,cpf_ciphertext,cpf_last4) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET cpf_hash=EXCLUDED.cpf_hash,cpf_ciphertext=EXCLUDED.cpf_ciphertext,cpf_last4=EXCLUDED.cpf_last4',
    [userId, cpfDigest(cpf), encryptSecret(cpf, userId, 'cpf'), cpf.slice(-4)],
  );
}
