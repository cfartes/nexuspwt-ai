'use client';
import { useState } from 'react';
import type { DocumentRow } from '@/lib/types';
import Popup from './popup';
import { api } from './workspace';

export default function ApprovalConfirmation({
  document,
  action,
  identityExempt = false,
  onClose,
  onDone,
}: {
  document: DocumentRow;
  action: 'approve' | 'reject';
  identityExempt?: boolean;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Popup
      title={action === 'approve' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
      busy={busy}
      onClose={onClose}
    >
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            await api(`/api/documents/${document.id}/workflow`, {
              action,
              version: document.version,
              comment: fields.get('comment') || '',
            });
            await onDone();
            onClose();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          <strong>
            {document.kind}-{document.number} · versão {document.version}
          </strong>
        </p>
        <p>{document.title}</p>
        <p className="muted">
          {identityExempt
            ? 'A decisão será vinculada à sua sessão Nexus. O Superadmin é dispensado de conferência humana e autenticador.'
            : 'A decisão será vinculada à sua sessão autenticada e à versão acima. Para colaboradores de contratadas, a validação documental segue a configuração da empresa.'}
        </p>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        <fieldset className="form-grid" disabled={busy}>
          {action === 'reject' && (
            <label className="span-2">
              Motivo da rejeição *<textarea name="comment" required maxLength={2000} />
            </label>
          )}
          <button className="primary">
            {action === 'approve'
              ? 'Confirmar aprovação desta versão'
              : 'Confirmar rejeição desta versão'}
          </button>
        </fieldset>
      </form>
    </Popup>
  );
}
