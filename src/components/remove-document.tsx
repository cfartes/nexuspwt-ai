'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { DocumentRow } from '@/lib/types';
import Popup from './popup';
import { api } from './workspace';
export default function RemoveDocument({
  document,
  online,
  onRemoved,
}: {
  document: DocumentRow;
  online: boolean;
  onRemoved: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const label = document.kind === 'PT' ? 'Excluir PT' : 'Remover APR';
  return (
    <>
      <button
        className="secondary delete-button"
        disabled={!online || busy}
        onClick={() => {
          setOpen(true);
          setError('');
        }}
      >
        <Trash2 size={15} /> {label}
      </button>
      {open && (
        <Popup title={label} busy={busy} onClose={() => setOpen(false)}>
          <div className="admin-form">
            <p>
              Remover{' '}
              <strong>
                {document.kind}-{document.number} · {document.title}
              </strong>
              ?
            </p>
            <p className="muted">
              {document.kind === 'PT'
                ? 'A PT será retirada da operação. O histórico, as aprovações e as fotos serão preservados. Esta ação é exclusiva do Superadmin.'
                : 'A APR será retirada da operação e não poderá ser usada em novas PTs. O histórico será preservado. Qualquer PT vinculada, inclusive rascunho, impede a remoção.'}
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
                    await api(`/api/documents/${document.id}/remove`, {
                      version: document.version,
                    });
                    await onRemoved();
                    setOpen(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Removendo…' : 'Confirmar remoção'}
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
