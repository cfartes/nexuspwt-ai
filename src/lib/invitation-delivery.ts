import type { Pool } from 'pg';
import { decryptSecret, type IntegrationRow } from './integrations';
import { invitationLink } from './invitations';
import { checkOpenwaSession, sendOpenwaText, whatsappChatId } from './openwa';
import { sendResendEmail } from './resend';
import { HttpError } from './security';

export async function processInvitation(pool: Pool) {
  const c = await pool.connect();
  let locked = false,
    inTransaction = false,
    sendingId: string | null = null;
  try {
    const {
      rows: [lock],
    } = await c.query("SELECT pg_try_advisory_lock(hashtext('nexus-whatsapp-dispatch')) locked");
    if (!lock.locked) return false;
    locked = true;
    await c.query(
      "UPDATE invitation_deliveries SET status='uncertain',last_error='Processo interrompido durante envio. Confira o provedor.' WHERE status='sending' AND started_at<now()-interval '2 minutes'",
    );
    await c.query(
      'UPDATE user_invitations SET token_ciphertext=NULL WHERE token_ciphertext IS NOT NULL AND (consumed_at IS NOT NULL OR expires_at<=now())',
    );
    const { rowCount: recent } = await c.query(
      "SELECT 1 FROM notification_outbox WHERE started_at>now()-interval '5 seconds' UNION ALL SELECT 1 FROM invitation_deliveries WHERE started_at>now()-interval '5 seconds' LIMIT 1",
    );
    if (recent) return false;
    await c.query('BEGIN');
    inTransaction = true;
    const {
      rows: [job],
    } = await c.query(`SELECT d.*,i.user_id,i.unit_id,i.token_ciphertext,i.expires_at,i.consumed_at,
      u.active user_active,u.password_pending,u.email,COALESCE(m.phone,u.phone) phone,m.active membership_active,un.company_id
      FROM invitation_deliveries d JOIN user_invitations i ON i.id=d.invitation_id JOIN users u ON u.id=i.user_id
      LEFT JOIN memberships m ON m.user_id=i.user_id AND m.unit_id=i.unit_id JOIN units un ON un.id=i.unit_id
      WHERE d.status IN ('pending','blocked') AND d.available_at<=now() ORDER BY d.available_at,d.created_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED`);
    if (!job) {
      await c.query('COMMIT');
      inTransaction = false;
      return false;
    }
    const finish = async (status: string, error: string | null) => {
      await c.query(
        "UPDATE invitation_deliveries SET status=$2,last_error=$3,available_at=now()+interval '1 minute' WHERE id=$1",
        [job.id, status, error],
      );
      await c.query('COMMIT');
      inTransaction = false;
      return true;
    };
    if (
      job.consumed_at ||
      new Date(job.expires_at).getTime() <= Date.now() ||
      !job.user_active ||
      !job.password_pending ||
      !job.membership_active ||
      !job.token_ciphertext
    )
      return await finish('cancelled', 'Convite encerrado, expirado ou acesso removido.');
    if (job.recipient !== (job.channel === 'email' ? job.email : job.phone))
      return await finish(
        'cancelled',
        'Contato alterado. Gere novo convite para o endereço atual.',
      );
    let text: string,
      key: string,
      baseUrl = '',
      sessionId = '',
      chatId = '',
      sender = '';
    try {
      text = `Nexus PTW: você foi convidado para acessar o app. Defina sua senha pelo link abaixo. Válido por 24 horas, para uso único. Não compartilhe este link.\n${invitationLink(decryptSecret(job.token_ciphertext, job.invitation_id, 'invitation'))}`;
      if (job.channel === 'email') {
        const {
          rows: [config],
        } = await c.query('SELECT * FROM email_gateway WHERE singleton');
        if (!config) throw new HttpError(503, 'O superadmin precisa configurar o Resend.');
        key = decryptSecret(config.secret_ciphertext, 'platform', 'resend');
        sender = config.sender;
      } else {
        const {
          rows: [config],
        } = await c.query<IntegrationRow>(
          "SELECT * FROM company_integrations WHERE company_id=$1 AND service='whatsapp'",
          [job.company_id],
        );
        if (!config?.secret_ciphertext || !config.settings.sessionId || !config.settings.phone)
          throw new HttpError(
            503,
            'Conecte o WhatsApp Business da empresa antes de enviar convites.',
          );
        baseUrl = String(config.settings.baseUrl);
        sessionId = config.settings.sessionId;
        key = decryptSecret(config.secret_ciphertext, job.company_id, 'whatsapp');
        chatId = whatsappChatId(job.recipient);
        const session = await checkOpenwaSession(baseUrl, sessionId, key);
        if (!session.connected || session.phone !== config.settings.phone)
          throw new HttpError(
            503,
            'Sessão desconectada ou número do WhatsApp da empresa divergente.',
          );
      }
    } catch (error) {
      return await finish(
        'blocked',
        error instanceof HttpError ? error.message : 'Não foi possível preparar o convite.',
      );
    }
    const { rowCount: current } = await c.query(
      'SELECT 1 FROM user_invitations i JOIN users u ON u.id=i.user_id JOIN memberships m ON m.user_id=i.user_id AND m.unit_id=i.unit_id WHERE i.id=$1 AND i.consumed_at IS NULL AND i.expires_at>now() AND u.active AND u.password_pending AND m.active',
      [job.invitation_id],
    );
    if (!current) return await finish('cancelled', 'Convite encerrado antes do envio.');
    await c.query(
      "UPDATE invitation_deliveries SET status='sending',attempts=attempts+1,started_at=now(),last_error=NULL WHERE id=$1",
      [job.id],
    );
    await c.query('COMMIT');
    inTransaction = false;
    sendingId = job.id;
    const result =
      job.channel === 'email'
        ? await sendResendEmail(key, sender, job.recipient, text, job.id)
        : await sendOpenwaText(baseUrl, sessionId, key, chatId, text);
    await c.query(
      "UPDATE invitation_deliveries SET status=$2,last_error=$3,sent_at=CASE WHEN $2='sent' THEN now() ELSE sent_at END,available_at=now()+interval '1 minute' WHERE id=$1 AND status='sending'",
      [job.id, result.status, result.error],
    );
    return true;
  } catch (error) {
    if (inTransaction) await c.query('ROLLBACK');
    if (sendingId)
      await c.query(
        "UPDATE invitation_deliveries SET status='uncertain',last_error='Resultado não confirmado. Confira o provedor.' WHERE id=$1 AND status='sending'",
        [sendingId],
      );
    throw error;
  } finally {
    try {
      if (locked) await c.query("SELECT pg_advisory_unlock(hashtext('nexus-whatsapp-dispatch'))");
    } finally {
      c.release();
    }
  }
}
