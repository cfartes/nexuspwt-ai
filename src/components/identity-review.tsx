'use client';
import PasswordInput from './password-input';
import { useState } from 'react';
import type { Person, WorkspaceData } from '@/lib/types';
import Popup from './popup';
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
  const [action, setAction] = useState<'reset' | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const clearCredentials = () => {
    setPassword('');
    setCode('');
    setPasswordFocused(false);
    setCodeFocused(false);
  };
  if (person.platform_admin) return null;
  if (person.id === ws.user.id) return null;
  return (
    <>
      {person.authenticator_enabled && companyManager(ws.user, ws.unit) && (
        <button
          className="secondary"
          disabled={!online || !person.active}
          onClick={() => {
            setAction('reset');
            clearCredentials();
            setError('');
          }}
        >
          Recuperar autenticador
        </button>
      )}
      {action && (
        <Popup
          title="Recuperação assistida do autenticador"
          busy={busy}
          onClose={() => {
            clearCredentials();
            setAction(null);
          }}
        >
          <form
            className="admin-form"
            autoComplete="off"
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
                  reference: fields.get('reference'),
                  confirmed: fields.get('confirmed') === 'on',
                  password,
                  code,
                });
                await reload();
                setAction(null);
              } catch (error) {
                setError((error as Error).message);
              } finally {
                clearCredentials();
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
                  todas as empresas. Será necessário configurar novamente o autenticador.
                </p>
              )}
              {action === 'reset' && (
                <label>
                  Sua senha de administrador *
                  <PasswordInput
                    name="identity-review-password"

                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    readOnly={!passwordFocused}
                    onFocus={() => setPasswordFocused(true)}
                    maxLength={256}
                  />
                </label>
              )}
              {action === 'reset' && !ws.user.platform_admin && ws.securityPolicy?.required && (
                <label>
                  Seu código do autenticador *
                  <input
                    name="identity-review-code"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="off"
                    readOnly={!codeFocused}
                    onFocus={() => setCodeFocused(true)}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>
              )}
              <button className="primary">Confirmar recuperação assistida</button>
            </fieldset>
          </form>
        </Popup>
      )}
    </>
  );
}
