import type { PoolClient } from 'pg';
import type { User } from './auth';
import type { AccessUnit } from './permissions';
import type { DocumentInput } from './validation';
import { HttpError } from './security';
import { ptToday, ptClock, ptEndError } from './pt-calendar';

export type PtAction = 'close' | 'reopen' | 'extend';
type Permit = {
  id: string;
  kind: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  version: number;
  data: DocumentInput['data'];
};
export async function changePtLifecycle(
  client: PoolClient,
  actor: User,
  unit: AccessUnit,
  document: Permit,
  action: PtAction,
  reason: string,
  endTime: string,
  now = new Date(),
) {
  if (unit.contractor_id || !['admin', 'gestor', 'seguranca_trabalho'].includes(unit.role))
    throw new HttpError(
      403,
      'Somente Admin, Gestor ou Segurança do Trabalho internos podem executar esta ação.',
    );
  if (document.kind !== 'PT') throw new HttpError(400, 'Esta ação é exclusiva de PT.');
  const today = ptToday(now);
  if (
    document.starts_at.toISOString().slice(0, 10) !== today ||
    document.ends_at.toISOString().slice(0, 10) !== today
  )
    throw new HttpError(
      409,
      'A PT só pode ser encerrada, reaberta ou prorrogada no dia de sua emissão.',
    );
  if (reason.trim().length < 5)
    throw new HttpError(400, 'Informe o motivo da ação (mínimo de cinco caracteres).');
  const expected =
    action === 'close'
      ? ['aprovado']
      : action === 'reopen'
        ? ['encerrado']
        : ['rascunho', 'aprovado'];
  if (!expected.includes(document.status))
    throw new HttpError(409, 'Situação da PT incompatível com esta ação. Atualize o documento.');
  const previousEndTime = document.data.answers['general.endsAt'] || '';
  if (action !== 'close') {
    const error = ptEndError(endTime, now);
    if (error) throw new HttpError(400, error);
    if (action === 'extend' && (!previousEndTime || endTime <= previousEndTime))
      throw new HttpError(400, 'A prorrogação deve aumentar o horário de término já informado.');
  } else {
    const { rowCount } = await client.query('SELECT 1 FROM photos WHERE document_id=$1 LIMIT 1', [
      document.id,
    ]);
    if (!rowCount)
      throw new HttpError(
        400,
        'Registre a evidência fotográfica da conclusão antes de encerrar a PT.',
      );
  }
  await client.query(
    'INSERT INTO document_versions(document_id,version,snapshot) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [document.id, document.version, JSON.stringify(document)],
  );
  const answers = { ...document.data.answers };
  if (action === 'close') answers['s22.finishedAt'] = ptClock(now);
  else {
    answers['general.endsAt'] = endTime;
    answers['s21.reason'] = reason.trim();
    for (const key of Object.keys(answers)) if (key.startsWith('s22.')) delete answers[key];
  }
  const status = action === 'close' ? 'encerrado' : 'rascunho';
  const {
    rows: [updated],
  } = await client.query<Permit>(
    'UPDATE documents SET status=$2,data=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
    [document.id, status, JSON.stringify({ ...document.data, answers })],
  );
  if (action === 'close')
    await client.query(
      'INSERT INTO document_versions(document_id,version,snapshot) VALUES($1,$2,$3)',
      [document.id, updated.version, JSON.stringify(updated)],
    );
  await client.query(
    'INSERT INTO audit_events(document_id,actor_id,action,details) VALUES($1,$2,$3,$4)',
    [
      document.id,
      actor.id,
      `workflow.${action}`,
      JSON.stringify({
        version: updated.version,
        previousVersion: document.version,
        comment: reason.trim(),
        previousEndTime,
        endTime: answers['general.endsAt'],
        status,
      }),
    ],
  );
}
