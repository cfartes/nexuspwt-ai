'use client';
import PasswordInput from './password-input';
import { passwordHint, passwordPattern } from '@/lib/password-policy';
import { useEffect, useState, useRef } from 'react';
import { Login } from './workspace';
export default function DefinePassword() {
  const [token, setToken] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  const read = useRef(false);
  const [account, setAccount] = useState<{
    email: string;
    unitId: string;
    mfa: boolean;
    setup: boolean;
  } | null>(null);
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    setToken(value);
    window.history.replaceState(null, '', window.location.pathname);
    if (!/^[a-f\d]{64}$/.test(value))
      setError('Convite inválido. Abra o link recebido por e-mail ou WhatsApp.');
  }, []);
  if (done && account)
    return (
      <Login
        error={error}
        initialEmail={account.email}
        initialPassword={password}
        initialMfa={account.mfa}
        initialSetup={account.setup}
        onLogin={async () => {
          window.location.replace('/?unit=' + account.unitId);
          return true;
        }}
      />
    );
  return (
    <main className="password-page">
      <section className="card">
        <div className="card-heading">
          <div>
            <h1>Defina sua senha</h1>
            <p>Nexus PTW · Primeiro acesso</p>
          </div>
        </div>
        {done ? (
          <div className="admin-form">
            <p className="success" role="status">
              Senha definida. Entre no app com seu e-mail e a nova senha.
            </p>
            <a href="/" className="primary">
              Ir para o login
            </a>
          </div>
        ) : (
          <form
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              if (password !== confirmation) {
                setError('As senhas precisam ser iguais.');
                return;
              }
              setBusy(true);
              let passwordDefined = false;
              try {
                const response = await fetch('/api/invitations/accept', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token, password }),
                  signal: AbortSignal.timeout(20000),
                });
                const result: { email: string; unitId: string; error?: string } =
                  await response.json();
                if (!response.ok)
                  throw new Error(result.error || 'Não foi possível definir a senha.');
                setToken('');
                setConfirmation('');
                const accountInfo: { email: string; unitId: string } = result;
                setAccount({ ...accountInfo, mfa: false, setup: false });
                passwordDefined = true;
                const login = await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: accountInfo.email, password }),
                  signal: AbortSignal.timeout(20000),
                });
                const loginResult: {
                  mfaRequired?: boolean;
                  setupRequired?: boolean;
                  error?: string;
                } = await login.json();
                if (!login.ok)
                  throw new Error(loginResult.error || 'Senha definida. Entre para continuar.');
                if (loginResult.mfaRequired) {
                  setAccount({ ...accountInfo, mfa: true, setup: !!loginResult.setupRequired });
                  setDone(true);
                  return;
                }
                setPassword('');
                window.location.replace('/?unit=' + accountInfo.unitId);
              } catch (e) {
                if (passwordDefined) setDone(true);
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <p className="muted">O convite vale por 24 horas e só pode ser utilizado uma vez.</p>
            <p className="muted">{passwordHint}</p>
            <fieldset className="form-grid" disabled={busy || !token}>
              <label className="span-2">
                Nova senha
                <PasswordInput
                  autoComplete="new-password"
                  required
                  minLength={8}
                  pattern={passwordPattern}
                  title={passwordHint}
                  maxLength={256}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="span-2">
                Confirmar senha
                <PasswordInput
                  autoComplete="new-password"
                  required
                  minLength={8}
                  pattern={passwordPattern}
                  title={passwordHint}
                  maxLength={256}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            </fieldset>
            <button className="primary" disabled={busy || !/^[a-f\d]{64}$/.test(token)}>
              {busy ? 'Salvando…' : 'Definir senha'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
