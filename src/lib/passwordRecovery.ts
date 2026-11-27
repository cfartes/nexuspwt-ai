import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { digest, hashPassword, HttpError } from './security';
import { decryptSecret, encryptSecret } from './integrations';
import { invitationLink } from './invitations';
import { newPassword } from './password-policy';
import { sendResendEmail } from './resend';
import {
  allowRecoveryRequest,
  recoveryAccount,
  replaceRecovery,
  consumeRecovery,
  claimRecoveryDelivery,
  finishRecoveryDelivery,
} from './passwordRecoveryRepository';

export const recoveryRequest = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
  })
  .strict();
export const recoveryConfirmation = z
  .object({ token: z.string().regex(/^[a-f\d]{64}$/), password: newPassword })
  .strict();
export const recoveryMessage =
  'Se houver uma conta ativa com senha definida para esse e-mail, enviaremos um link de recuperação. Confira também o spam. Aguarde alguns minutos antes de solicitar novamente.';
export function recoveryLink(token: string): string {
  return invitationLink(token).replace('/definir-senha#', '/recuperar-senha?confirmar=1#');
}
export async function requestPasswordRecovery(
  client: PoolClient,
  input: z.infer<typeof recoveryRequest>,
): Promise<void> {
  if (!(await allowRecoveryRequest(client, digest(input.email)))) return;
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const encrypted = encryptSecret(token, id, 'password-recovery');
  const account = await recoveryAccount(client, input.email);
  if (!account?.active || account.password_pending) return;
  await replaceRecovery(client, account, { id, hash: digest(token), encrypted });
}
export async function confirmPasswordRecovery(
  client: PoolClient,
  input: z.infer<typeof recoveryConfirmation>,
): Promise<void> {
  const validated = recoveryConfirmation.parse(input);
  if (!(await consumeRecovery(client, digest(validated.token), hashPassword(validated.password))))
    throw new HttpError(
      400,
      'Link inválido, expirado ou já utilizado. Solicite um novo em Esqueci minha senha.',
    );
}
export async function processPasswordRecovery(pool: Pool): Promise<boolean> {
  const client = await pool.connect();
  let deliveryId: string | undefined;
  try {
    const delivery = await claimRecoveryDelivery(client);
    if (!delivery) return false;
    deliveryId = delivery.id;
    if (!delivery.secret_ciphertext || !delivery.sender) {
      await finishRecoveryDelivery(
        client,
        delivery.id,
        'blocked',
        'Configure o Resend nas configurações do Superadmin.',
      );
      return true;
    }
    const link = recoveryLink(
      decryptSecret(delivery.token_ciphertext, delivery.id, 'password-recovery'),
    );
    const result = await sendResendEmail(
      decryptSecret(delivery.secret_ciphertext, 'platform', 'resend'),
      delivery.sender,
      delivery.recipient,
      `Nexus PTW: recebemos uma solicitação para redefinir sua senha. Este link vale por uma hora e só pode ser usado uma vez.\n${link}\nSe não foi você, ignore este e-mail. Sua senha permanece a mesma até a confirmação. O autenticador continua obrigatório quando exigido pela empresa.`,
      delivery.id,
      'Nexus PTW · Recuperação de senha',
    );
    await finishRecoveryDelivery(client, delivery.id, result.status, result.error);
    return true;
  } catch (error) {
    if (deliveryId)
      await finishRecoveryDelivery(
        client,
        deliveryId,
        error instanceof HttpError ? 'blocked' : 'uncertain',
        'Falha ao preparar ou confirmar o envio. Confira configuração e Resend.',
      );
    console.error({
      event: 'password_recovery_delivery_failed',
      kind: error instanceof HttpError ? 'configuration' : 'operation',
    });
    throw new HttpError(503, 'Não foi possível processar a recuperação de senha.');
  } finally {
    client.release();
  }
}
