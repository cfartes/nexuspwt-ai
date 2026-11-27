export async function provisionRuntimeRoles(client) {
  const appPassword = process.env.APP_DATABASE_PASSWORD;
  const workerPassword = process.env.WORKER_DATABASE_PASSWORD;
  if (!appPassword && !workerPassword) return;
  if (!/^[a-f\d]{64}$/.test(appPassword || '') || !/^[a-f\d]{64}$/.test(workerPassword || ''))
    throw new Error('Credenciais de runtime inválidas.');
  await client.query('BEGIN');
  try {
    await client.query(
      "SELECT set_config('nexus.app_password',$1,true),set_config('nexus.worker_password',$2,true)",
      [appPassword, workerPassword],
    );
    await client.query(`DO $$ BEGIN
      EXECUTE format('ALTER ROLE nexus_app LOGIN PASSWORD %L',current_setting('nexus.app_password'));
      EXECUTE format('ALTER ROLE nexus_worker LOGIN PASSWORD %L',current_setting('nexus.worker_password'));
    END $$`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
