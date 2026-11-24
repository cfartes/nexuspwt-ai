'use client';
import PasswordInput from './password-input';
import { useEffect, useState } from 'react';
import { Mail, Save } from 'lucide-react';
import { api } from './workspace';
export default function ResendSettings() {
  const [config, setConfig] = useState<{
      version: number;
      sender: string;
      hasSecret: boolean;
    } | null>(null),
    [key, setKey] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    api('/api/email-gateway')
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>
            <Mail size={18} /> Envio de e-mail · Resend
          </h2>
          <p>Configuração global · somente superadmin</p>
        </div>
        <span className="badge">{config?.hasSecret ? 'Chave configurada' : 'Não configurado'}</span>
      </div>
      <form
        className="integration-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!config) return;
          setBusy(true);
          setError('');
          setNotice('');
          try {
            await api('/api/email-gateway', {
              version: config.version,
              sender: config.sender,
              secret: key,
            });
            setKey('');
            setConfig(await api('/api/email-gateway'));
            setNotice(
              'Resend configurado. Convites pendentes serão processados pelo serviço de notificações.',
            );
          } catch (e) {
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
        {notice && (
          <p role="status" className="success">
            {notice}
          </p>
        )}
        {config && (
          <>
            <fieldset disabled={busy} className="form-grid">
              <label className="span-2">
                Remetente verificado no Resend
                <input
                  type="email"
                  required
                  maxLength={254}
                  value={config.sender}
                  onChange={(e) => setConfig({ ...config, sender: e.target.value })}
                />
              </label>
              <label className="span-2">
                API Key
                <PasswordInput
                  autoComplete="new-password"
                  maxLength={16000}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={
                    config.hasSecret
                      ? 'Chave salva · deixe vazio para manter'
                      : 'Informe a API Key do Resend'
                  }
                />
              </label>
            </fieldset>
            <p className="muted">
              A chave fica criptografada no servidor e não é exibida novamente. Para os
              destinatários abrirem o convite, o app precisa de uma URL HTTPS pública.
            </p>
            <button className="primary" disabled={busy}>
              <Save size={16} /> Salvar Resend
            </button>
          </>
        )}
      </form>
    </section>
  );
}
