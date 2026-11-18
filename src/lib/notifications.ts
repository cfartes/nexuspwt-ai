import type { Pool, PoolClient } from 'pg';
import { decryptSecret, type IntegrationRow } from './integrations';
import { checkOpenwaSession, sendOpenwaText, whatsappChatId } from './openwa';
import { HttpError } from './security';

export function approvalMessage(id: string, version: number, kind: string, number: string) {
  const base = new URL(process.env.APP_URL || '');
  if (
    base.username ||
    base.password ||
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))
  )
    throw new HttpError(
      400,
      'Configure a URL HTTPS pública do Nexus antes de enviar notificações.',
    );
  const link = new URL('/', base);
  link.searchParams.set('document', id);
  link.searchParams.set('version', String(version));
  return `Nexus PTW: ${kind}-${number}, versão ${version}, aguarda sua análise. Acesse sua conta para conferir e decidir: ${link.toString()}`;
}
async function stillPending(client: PoolClient, id: string) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT 1 FROM notification_outbox n JOIN documents d ON d.id=n.document_id
    JOIN users u ON u.id=n.user_id AND u.active JOIN memberships m ON m.user_id=n.user_id AND m.unit_id=d.unit_id AND m.active AND m.role IN ('admin','gestor','aprovador') AND (m.contractor_id IS NULL OR m.contractor_id=d.contractor_id)
    WHERE n.id=$1 AND d.version=n.version AND d.status='em_aprovacao'
    AND EXISTS(SELECT 1 FROM approvals a WHERE a.document_id=n.document_id AND a.version=n.version AND a.user_id=n.user_id AND a.decision IS NULL)`,
    [id],
  );
  return !!row;
}
export async function processNotification(pool: Pool) {
  const client = await pool.connect();
  let locked = false,
    inTransaction = false,
    sendingId: string | null = null;
  try {
    const {
      rows: [lock],
    } = await client.query(
      "SELECT pg_try_advisory_lock(hashtext('nexus-whatsapp-dispatch')) locked",
    );
    if (!lock.locked) return false;
    locked = true;
    // A crash after dispatch cannot safely be retried without provider-side idempotency.
    await client.query(`UPDATE notification_outbox SET status='uncertain',last_error='Processo interrompido durante o envio. Confira o OpenWA antes de reenviar.',updated_at=now()
      WHERE status='sending' AND started_at<now()-interval '2 minutes'`);
    const { rowCount: recent } = await client.query(
      "SELECT 1 FROM notification_outbox WHERE started_at>now()-interval '5 seconds' LIMIT 1",
    );
    if (recent) return false;
    await client.query('BEGIN');
    inTransaction = true;
    const {
      rows: [job],
    } = await client.query(`SELECT n.*,d.company_id,d.kind,d.number,COALESCE(m.phone,u.phone) phone
      FROM notification_outbox n JOIN documents d ON d.id=n.document_id JOIN users u ON u.id=n.user_id LEFT JOIN memberships m ON m.user_id=n.user_id AND m.unit_id=d.unit_id
      WHERE n.status IN ('pending','blocked') AND n.available_at<=now()
      ORDER BY n.available_at,n.created_at,n.id LIMIT 1 FOR UPDATE OF n SKIP LOCKED`);
    if (!job) {
      await client.query('COMMIT');
      inTransaction = false;
      return false;
    }
    const finish = async (status: string, error: string | null) => {
      await client.query(
        "UPDATE notification_outbox SET status=$2,last_error=$3,available_at=now()+interval '1 minute',updated_at=now() WHERE id=$1",
        [job.id, status, error],
      );
      await client.query('COMMIT');
      inTransaction = false;
      return true;
    };
    if (!(await stillPending(client, job.id)))
      return await finish(
        'cancelled',
        'Solicitação concluída, versão substituída ou acesso removido.',
      );
    const {
      rows: [config],
    } = await client.query<IntegrationRow>(
      "SELECT * FROM company_integrations WHERE company_id=$1 AND service='whatsapp'",
      [job.company_id],
    );
    if (
      !config?.secret_ciphertext ||
      config.settings.sendNotifications !== true ||
      !config.settings.sessionId
    )
      return await finish('blocked', 'Envio desativado ou configuração de WhatsApp incompleta.');
    let key: string, chatId: string, text: string;
    try {
      key = decryptSecret(config.secret_ciphertext, job.company_id, 'whatsapp');
      chatId = whatsappChatId(job.phone);
      text = approvalMessage(job.document_id, job.version, job.kind, job.number);
      const session = await checkOpenwaSession(
        String(config.settings.baseUrl),
        String(config.settings.sessionId),
        key,
      );
      if (!session.connected)
        return await finish('blocked', 'A sessão do WhatsApp não está conectada.');
    } catch (error) {
      return await finish(
        'blocked',
        error instanceof HttpError ? error.message : 'Não foi possível preparar a notificação.',
      );
    }
    if (!(await stillPending(client, job.id)))
      return await finish('cancelled', 'A solicitação deixou de estar pendente.');
    const { rowCount: unchanged } = await client.query(
      "SELECT 1 FROM company_integrations WHERE company_id=$1 AND service='whatsapp' AND version=$2",
      [job.company_id, config.version],
    );
    if (!unchanged)
      return await finish('blocked', 'Configuração do WhatsApp alterada durante a preparação.');
    await client.query(
      "UPDATE notification_outbox SET status='sending',attempts=attempts+1,started_at=now(),updated_at=now(),last_error=NULL,recipient_hint=$2 WHERE id=$1",
      [job.id, '••••' + chatId.split('@')[0].slice(-4)],
    );
    await client.query('COMMIT');
    inTransaction = false;
    sendingId = job.id;
    const result = await sendOpenwaText(
      String(config.settings.baseUrl),
      String(config.settings.sessionId),
      key,
      chatId,
      text,
    );
    await client.query(
      `UPDATE notification_outbox SET status=$2,last_error=$3,updated_at=now(),available_at=now()+interval '1 minute',
      sent_at=CASE WHEN $2='sent' THEN now() ELSE sent_at END WHERE id=$1 AND status='sending'`,
      [job.id, result.status, result.error],
    );
    return true;
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK');
    if (sendingId)
      await client.query(
        "UPDATE notification_outbox SET status='uncertain',last_error='Não foi possível confirmar o resultado do envio. Confira o OpenWA.',updated_at=now() WHERE id=$1 AND status='sending'",
        [sendingId],
      );
    throw error;
  } finally {
    try {
      if (locked)
        await client.query("SELECT pg_advisory_unlock(hashtext('nexus-whatsapp-dispatch'))");
    } finally {
      client.release();
    }
  }
}
