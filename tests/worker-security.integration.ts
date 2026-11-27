import assert from 'node:assert/strict';
import pg from 'pg';
const target = new URL(process.env.TEST_DATABASE_URL || '');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.pathname, '/ptw_security');
process.env.DATABASE_URL = `postgresql://nexus_worker:${'d'.repeat(64)}@127.0.0.1:5432/ptw_security`;
process.env.DATABASE_CONTEXT = 'worker';
process.env.REQUIRE_RESTRICTED_DATABASE = 'true';
process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.APP_URL = 'https://ptw.fixture.test';
const { db } = await import('../src/lib/db');
const { processPasswordRecovery } = await import('../src/lib/passwordRecovery');
const { processInvitation } = await import('../src/lib/invitation-delivery');
const { processNotification } = await import('../src/lib/notifications');
const { processContractorRegistrationInvite } =
  await import('../src/lib/contractorRegistrationDelivery');
const { encryptSecret } = await import('../src/lib/integrations');
const { digest } = await import('../src/lib/security');
const owner = new pg.Pool({ connectionString: target.toString(), max: 1 });
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls++;
  throw new Error('Provedor externo não deve ser acionado.');
};
try {
  await owner.query("UPDATE invitation_deliveries SET status='cancelled'");
  await owner.query("UPDATE notification_outbox SET status='cancelled'");
  await owner.query("UPDATE contractor_registrations SET delivery_status='cancelled'");
  await owner.query("UPDATE password_recoveries SET status='cancelled'");
  await owner.query('DELETE FROM email_gateway');
  const {
    rows: [account],
  } = await owner.query<{ id: string; email: string }>(
    'SELECT id,email FROM users WHERE active AND NOT password_pending LIMIT 1',
  );
  const id = crypto.randomUUID(),
    token = 'e'.repeat(64);
  await owner.query(
    'INSERT INTO password_recoveries(id,user_id,recipient,token_hash,token_ciphertext) VALUES($1,$2,$3,$4,$5)',
    [id, account.id, account.email, digest(token), encryptSecret(token, id, 'password-recovery')],
  );
  assert.equal(await processPasswordRecovery(db), true);
  assert.equal(
    (await owner.query('SELECT status FROM password_recoveries WHERE id=$1', [id])).rows[0].status,
    'blocked',
  );
  await assert.rejects(db.query('SELECT password_hash FROM users'), /permission denied/);
  await assert.rejects(db.query('SELECT * FROM executor_identity_files'), /permission denied/);
  await assert.rejects(db.query("UPDATE documents SET title='forbidden'"), /permission denied/);
  await assert.rejects(db.query('SET ROLE nexus_app'), /permission denied/);
  await assert.rejects(
    db.query("UPDATE password_recoveries SET token_hash='forbidden'"),
    /permission denied/,
  );
  assert.equal(await processInvitation(db), false);
  assert.equal(await processContractorRegistrationInvite(db), false);
  assert.equal(await processNotification(db), false);
  assert.equal(fetchCalls, 0);
  console.log(
    'Worker restrito OK: fila processada, sem privilégio para senhas, documentos pessoais, alterações de APR/PT ou troca de role. Nenhum provedor acionado.',
  );
} finally {
  globalThis.fetch = originalFetch;
  await db.end();
  await owner.end();
}
