'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { RegistrationKind } from '@/lib/delete-registration';
import Popup from './popup';
import { api } from './workspace';
export default function DeleteRegistration({
  unitId,
  kind,
  id,
  version,
  name,
  online,
  onDeleted,
}: {
  unitId: string;
  kind: RegistrationKind;
  id: string;
  version?: number;
  name: string;
  online: boolean;
  onDeleted: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <button
        type="button"
        className="secondary delete-button"
        disabled={!online || busy}
        onClick={() => {
          setOpen(true);
          setError('');
        }}
      >
        <Trash2 size={15} /> Excluir
      </button>
      {open && (
        <Popup title="Excluir cadastro" busy={busy} onClose={() => setOpen(false)}>
          <div className="admin-form">
            <p>
              Excluir <strong>{name}</strong>?
            </p>
            <p className="muted">
              {kind === 'user'
                ? 'Remove o acesso desta unidade. A conta e os acessos das outras unidades são preservados; uma conta sem outros vínculos só será apagada se não possuir histórico.'
                : kind === 'contractor'
                  ? 'Remove a autorização desta unidade. O cadastro compartilhado é preservado se usado em outras unidades ou no histórico.'
                  : kind === 'approver'
                    ? 'Remove a atribuição para novas submissões. Decisões e responsáveis já registrados permanecem no histórico, assim como os acessos do usuário.'
                    : kind === 'unit'
                      ? 'A unidade só pode ser excluída sem documentos, convites, contratadas, aprovadores ou outros usuários vinculados. Ao excluir a unidade ativa, você será direcionado a outra unidade disponível.'
                      : 'A exclusão só será permitida se não houver cadastros dependentes.'}
            </p>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <div className="actions">
              <button
                className="primary delete-button"
                disabled={busy || !online}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api('/api/admin', {
                      action: 'deleteRegistration',
                      unitId,
                      kind,
                      id,
                      ...(version === undefined ? {} : { version }),
                    });
                    await onDeleted();
                    setOpen(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Excluindo…' : 'Confirmar exclusão'}
              </button>
              <button className="secondary" disabled={busy} onClick={() => setOpen(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}
