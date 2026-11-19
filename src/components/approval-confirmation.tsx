'use client';
import { useState } from 'react';
import type { DocumentRow } from '@/lib/types';
import Popup from './popup';
import { api } from './workspace';

export default function ApprovalConfirmation({
  document,
  action,
  mfa,
  identityExempt = false,
  onClose,
  onDone,
}: {
  document: DocumentRow;
  action: 'approve' | 'reject';
  mfa: boolean;
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
              password: fields.get('password'),
              code: fields.get('code') || '',
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
            ? 'Confirme a decisão com sua senha Nexus. O Superadmin é dispensado de conferência humana e autenticador.'
            : 'Confirme a decisão com suas próprias credenciais. Sua identidade deve ter sido conferida por outro administrador nesta unidade.'}
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
          <label>
            Sua senha *
            <input
              name="password"
              type="password"
              required
              maxLength={256}
              autoComplete="current-password"
            />
          </label>
          {mfa && (
            <label>
              Código do autenticador *
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoComplete="one-time-code"
              />
              <small>
                Se já usou o código, aguarde o próximo. Configure em Configurações → Segurança das
                aprovações.
              </small>
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
