import { setTimeout } from 'node:timers/promises';
import { db } from '../src/lib/db';
import { processNotification } from '../src/lib/notifications';
import { processInvitation } from '../src/lib/invitation-delivery';

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
console.log('Processo de notificações iniciado. Envios dependem da habilitação por empresa.');
try {
  while (!stopping) {
    try {
      await processInvitation(db);
      if (!stopping) await processNotification(db);
    } catch {
      console.error('Falha ao processar notificações. Verifique banco, migrações e configuração.');
    }
    if (!stopping) await setTimeout(5000);
  }
} finally {
  await db.end();
}
