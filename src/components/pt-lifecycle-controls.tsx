'use client';
import { useState } from 'react';
import type { DocumentRow } from '@/lib/types';
import type { AccessUnit } from '@/lib/permissions';
import type { PtAction } from '@/lib/pt-lifecycle';
import { ptToday } from '@/lib/pt-calendar';
import Popup from './popup';

const labels = {
  close: 'Encerrar PT',
  reopen: 'Reabrir para nova aprovação',
  extend: 'Prorrogar término',
};
export default function PtLifecycleControls({
  document,
  unit,
  online,
  unsaved,
  onDone,
}: {
  document: DocumentRow;
  unit: AccessUnit;
  online: boolean;
  unsaved: boolean;
  onDone: (action: PtAction, reason: string, endTime: string) => Promise<void>;
}) {
  const [action, setAction] = useState<PtAction | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (
    document.kind !== 'PT' ||
    unit.contractor_id ||
    !['admin', 'gestor', 'seguranca_trabalho'].includes(unit.role) ||
    document.starts_at.slice(0, 10) !== ptToday()
  )
    return null;
  const actions: PtAction[] =
    document.status === 'encerrado'
      ? ['reopen']
      : document.status === 'aprovado'
        ? ['close', 'extend']
        : document.status === 'rascunho' && document.data.answers['general.endsAt']
          ? ['extend']
          : [];
  return (
    <>
      {actions.map((value) => (
        <button
          key={value}
          className="secondary"
          disabled={!online || busy || unsaved}
          title={unsaved ? 'Salve e sincronize as alterações antes de continuar.' : undefined}
          onClick={() => {
            setAction(value);
            setError('');
          }}
        >
          {labels[value]}
        </button>
      ))}
      {action && (
        <Popup title={labels[action]} busy={busy} onClose={() => setAction(null)}>
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              setBusy(true);
              setError('');
              try {
                await onDone(
                  action,
                  String(fields.get('reason')),
                  action === 'close' ? '' : String(fields.get('endTime')),
                );
                setAction(null);
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <p>
              PT-{document.number} · Término previsto:{' '}
              {document.data.answers['general.endsAt'] || 'Não informado'}.
            </p>
            {action !== 'close' && (
              <>
                <p>
                  A PT voltará a rascunho e precisará ser enviada e aprovada novamente. O novo
                  término deve ser posterior ao horário atual e ficar no dia de hoje.
                </p>
                <label>
                  Novo horário de término *<input name="endTime" type="time" required />
                </label>
              </>
            )}
            {action === 'close' && (
              <p>
                Registre antes a evidência fotográfica da conclusão. O horário real de encerramento
                será registrado pelo servidor.
              </p>
            )}
            <label>
              Motivo *<textarea name="reason" required minLength={5} maxLength={2000} />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Registrando…' : labels[action]}
            </button>
          </form>
        </Popup>
      )}
    </>
  );
}
