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
        <Trash2 size={15} />{' '}
        {kind === 'account'
          ? 'Excluir usuário da plataforma'
          : kind === 'user'
            ? 'Remover acesso desta unidade'
            : 'Excluir'}
      </button>
      {open && (
        <Popup
          title={
            kind === 'account'
              ? 'Excluir usuário da plataforma'
              : kind === 'user'
                ? 'Remover acesso desta unidade'
                : 'Excluir cadastro'
          }
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <div className="admin-form">
            <p>
              {kind === 'user'
                ? 'Remover o acesso de'
                : kind === 'account'
                  ? 'Excluir da plataforma o usuário'
                  : 'Excluir'}{' '}
              <strong>{name}</strong>
              {kind === 'user' ? ' nesta unidade?' : '?'}
            </p>
            <p className="muted">
              {kind === 'account'
                ? 'Exclui o usuário das listas e da vinculação em todas as unidades, encerra suas sessões e invalida convites. A conta fica indisponível para login; a identificação nos documentos e históricos é preservada. O e-mail continua reservado a essa identidade.'
                : kind === 'user'
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
