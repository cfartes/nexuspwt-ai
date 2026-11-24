'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { DocumentRow } from '@/lib/types';
import type { DocumentInput } from '@/lib/validation';
import Popup from './popup';
export type RemovableDocument = DocumentRow | DocumentInput;
export default function RemoveDocument({
  document,
  online,
  onRemoved,
}: {
  document: RemovableDocument;
  online: boolean;
  onRemoved: (document: RemovableDocument) => Promise<unknown>;
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
                {document.kind}
                {'number' in document ? `-${document.number}` : ' · rascunho local'} ·{' '}
                {document.title}
              </strong>
              ?
            </p>
            <p className="muted">
              {'unitId' in document
                ? 'Este rascunho de PT e seus envios pendentes serão excluídos deste dispositivo. A APR vinculada não será removida.'
                : document.kind === 'PT'
                  ? 'A PT será retirada da operação. O histórico, as aprovações e as fotos serão preservados. Em rascunho, o autor ou o administrador responsável pode excluir. Nas demais situações, somente o Superadmin.'
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
                    await onRemoved(document);
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
