import type { Pool } from 'pg';
import { decryptSecret } from './integrations';
import { registrationLink, type RegistrationRow } from './contractorRegistration';
import { sendResendEmail } from './resend';
import { HttpError } from './security';

export async function processContractorRegistrationInvite(pool: Pool): Promise<boolean> {
  const client = await pool.connect();
  let locked = false,
    sending: string | null = null;
  try {
    locked = (
      await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext('nexus-whatsapp-dispatch')) locked",
      )
    ).rows[0].locked;
    if (!locked) return false;
    await client.query(
      "UPDATE contractor_registrations SET delivery_status='uncertain',delivery_error='Processo interrompido durante envio. Confira o provedor.' WHERE delivery_status='sending' AND delivery_started_at<now()-interval '2 minutes'",
    );
    const row = (
      await client.query<RegistrationRow>(
        "SELECT * FROM contractor_registrations WHERE delivery_status IN ('pending','blocked') AND available_at<=now() ORDER BY available_at,created_at LIMIT 1",
      )
    ).rows[0];
    if (!row) return false;
    if (row.status === 'approved' || row.expires_at.getTime() <= Date.now()) {
      await client.query(
        "UPDATE contractor_registrations SET delivery_status='cancelled' WHERE id=$1",
        [row.id],
      );
      return true;
    }
    let key: string, sender: string, text: string;
    try {
      const config = (
        await client.query<{ sender: string; secret_ciphertext: string }>(
          'SELECT sender,secret_ciphertext FROM email_gateway WHERE singleton',
        )
      ).rows[0];
      if (!config) throw new HttpError(503, 'Configure o Resend no Superadmin.');
      key = decryptSecret(config.secret_ciphertext, 'platform', 'resend');
      sender = config.sender;
      text = `Nexus PTW: preencha ou corrija o cadastro da sua contratada e de seus colaboradores. O cadastro será conferido pela unidade antes da liberação do acesso. Link pessoal válido por sete dias. Não compartilhe.\n${registrationLink(decryptSecret(row.token_ciphertext, row.id, 'contractor-registration-token'))}`;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      await client.query(
        "UPDATE contractor_registrations SET delivery_status='blocked',delivery_error=$2,available_at=now()+interval '1 minute' WHERE id=$1",
        [row.id, error.message],
      );
      return true;
    }
    sending = row.id;
    await client.query(
      "UPDATE contractor_registrations SET delivery_status='sending',delivery_started_at=now(),delivery_error=NULL WHERE id=$1",
      [row.id],
    );
    const result = await sendResendEmail(
      key,
      sender,
      row.email,
      text,
      `contractor-${row.id}-${row.version}`,
      'Nexus PTW · Cadastro da contratada',
    );
    await client.query(
      "UPDATE contractor_registrations SET delivery_status=$2,delivery_error=$3,available_at=now()+interval '1 minute' WHERE id=$1 AND delivery_status='sending'",
      [row.id, result.status, result.error],
    );
    return true;
  } catch (error) {
    if (sending)
      await client.query(
        "UPDATE contractor_registrations SET delivery_status='uncertain',delivery_error='Resultado não confirmado. Confira o provedor antes de reenviar.' WHERE id=$1 AND delivery_status='sending'",
        [sending],
      );
    throw error;
  } finally {
    if (locked)
      await client.query("SELECT pg_advisory_unlock(hashtext('nexus-whatsapp-dispatch'))");
    client.release();
  }
}
