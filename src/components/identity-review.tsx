'use client';
import { useState } from 'react';
import type { Person, WorkspaceData } from '@/lib/types';
import Popup from './popup';
import MaskedInput from './masked-input';
import { api } from './workspace';
import { companyManager } from '@/lib/permissions';

export default function IdentityReview({
  person,
  ws,
  online,
  reload,
}: {
  person: Person;
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
}) {
  const [action, setAction] = useState<'verify' | 'reset' | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (person.id === ws.user.id)
    return <small>Outro administrador deve conferir sua identidade.</small>;
  return (
    <>
      <button
        className="secondary"
        disabled={!online || !person.active || person.password_pending}
        onClick={() => {
          setAction('verify');
          setError('');
        }}
      >
        Conferir identidade
      </button>
      {person.authenticator_enabled && companyManager(ws.user, ws.unit) && (
        <button
          className="secondary"
          disabled={!online || !person.active}
          onClick={() => {
            setAction('reset');
            setError('');
          }}
        >
          Recuperar autenticador
        </button>
      )}
      {action && (
        <Popup
          title={
            action === 'verify'
              ? 'Conferência humana de identidade'
              : 'Recuperação assistida do autenticador'
          }
          busy={busy}
          onClose={() => setAction(null)}
        >
          <form
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              try {
                await api('/api/security', {
                  action,
                  unitId: ws.unit.id,
                  userId: person.id,
                  version: person.membership_version,
                  ...(action === 'verify' ? { cpf: fields.get('cpf') } : {}),
                  reference: fields.get('reference'),
                  confirmed: fields.get('confirmed') === 'on',
                  password: fields.get('password'),
                  code: fields.get('code') || '',
                });
                await reload();
                setAction(null);
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>{person.name}</h3>
            <p>
              {person.email} · {person.phone}
            </p>
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            <fieldset className="form-grid" disabled={busy || !online}>
              {action === 'verify' && (
                <label>
                  CPF conferido *<MaskedInput name="cpf" kind="cpf" required />
                </label>
              )}
              <label className="span-2">
                Como a conferência foi realizada? *
                <textarea
                  name="reference"
                  required
                  minLength={5}
                  maxLength={500}
                  placeholder="Ex.: conferência presencial de documento com foto e vínculo com a contratada. Não inclua cópias ou números de documentos aqui."
                />
              </label>
              <label className="checkbox-line span-2">
                <input type="checkbox" name="confirmed" required />
                Conferi pessoalmente ou por procedimento assistido a identidade, os contatos e o
                vínculo desta pessoa.
              </label>
              {action === 'reset' && (
                <p className="alert span-2">
                  A recuperação encerra todas as sessões e remove o autenticador desta conta em
                  todas as empresas. Será necessária nova configuração e nova conferência humana.
                </p>
              )}
              <label>
                Sua senha de administrador *
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  maxLength={256}
                />
              </label>
              {ws.securityPolicy?.required && (
                <label>
                  Seu código do autenticador *
                  <input
                    name="code"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </label>
              )}
              <button className="primary">
                {action === 'verify' ? 'Registrar conferência' : 'Confirmar recuperação assistida'}
              </button>
            </fieldset>
          </form>
        </Popup>
      )}
    </>
  );
}
