'use client';
import { useState } from 'react';
import { z } from 'zod';

const recoveryResponse = z.object({ message: z.string().optional(), error: z.string().optional() });
export default function PasswordRecovery() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return (
    <main className="password-page">
      <section className="card">
        <div className="card-heading">
          <div>
            <h1>Recuperar senha</h1>
            <p>Informe o e-mail da sua conta Nexus PTW.</p>
          </div>
        </div>
        <form
          className="admin-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const email = new FormData(event.currentTarget).get('email');
            setBusy(true);
            setError('');
            setMessage('');
            try {
              const response = await fetch('/api/password-recovery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
                signal: AbortSignal.timeout(20000),
              });
              const result = recoveryResponse.parse(await response.json());
              if (!response.ok || !result.message)
                throw new Error(result.error || 'Não foi possível solicitar a recuperação.');
              setMessage(result.message);
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'Não foi possível solicitar a recuperação.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            E-mail
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={busy}
            />
          </label>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Solicitando…' : 'Enviar link de recuperação'}
          </button>
          <a href="/">Voltar ao login</a>
        </form>
      </section>
    </main>
  );
}
