'use client';
import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Save } from 'lucide-react';
import { api } from './workspace';

type Connection = {
  version: number;
  phone: string;
  status: string;
  sendNotifications: boolean;
  gatewayReady?: boolean;
  qrCode?: string | null;
};
const labels: Record<string, string> = {
  not_started: 'Não conectado',
  legacy: 'Confirmar número da sessão existente',
  connected: 'Conectado',
  wrong_number: 'Número conectado diferente do informado',
  qr_ready: 'Leia o QR Code',
  starting: 'Preparando conexão',
  disconnected: 'Desconectado',
  missing_session: 'Sessão removida · conectar novamente',
  identity_pending: 'Aguardando confirmação do número',
  unavailable: 'Gateway indisponível · atualizar conexão',
};
export default function WhatsappSettings({
  unitId,
  superadmin,
}: {
  unitId: string;
  superadmin: boolean;
}) {
  const [connection, setConnection] = useState<Connection | null>(null),
    [phone, setPhone] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [gateway, setGateway] = useState<{
      version: number;
      baseUrl: string;
      hasSecret: boolean;
    } | null>(null),
    [secret, setSecret] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    api(`/api/whatsapp?unit=${unitId}`)
      .then((data) => {
        if (active) {
          setConnection(data);
          setPhone(data.phone);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (superadmin)
      api('/api/whatsapp/gateway')
        .then((data) => {
          if (active) setGateway(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [unitId, superadmin]);
  async function update(action: 'connect' | 'refresh' | 'notifications', enabled?: boolean) {
    if (!connection) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId,
          version: connection.version,
          action,
          ...(action === 'connect' ? { phone } : {}),
          ...(enabled === undefined ? {} : { enabled }),
        }),
        signal: AbortSignal.timeout(65000),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          const latest = await api(`/api/whatsapp?unit=${unitId}`);
          setConnection(latest);
        }
        throw Object.assign(new Error(result.error || 'Não foi possível atualizar a conexão.'), {
          status: response.status,
        });
      }
      setConnection({ ...result, gatewayReady: true });
      setPhone(result.phone);
    } catch (e) {
      setError((e as Error).message);
      if (
        ((e as { status?: number }).status || 0) >= 500 ||
        ['TimeoutError', 'TypeError'].includes((e as Error).name)
      )
        setConnection((current) =>
          current
            ? { ...current, status: 'unavailable', qrCode: null, sendNotifications: false }
            : current,
        );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      busy ||
      !connection ||
      !['starting', 'qr_ready', 'identity_pending'].includes(connection.status) ||
      error
    )
      return;
    const timer = setTimeout(() => {
      void update('refresh');
    }, 5000);
    return () => clearTimeout(timer);
  });
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>
            <MessageCircle size={18} /> WhatsApp Business
          </h2>
          <p>Um número por empresa · conexão pelo QR Code</p>
        </div>
        <span className="badge" role="status">
          {connection ? labels[connection.status] || 'Aguardando conexão' : 'Carregando…'}
        </span>
      </div>
      <div className="integration-form">
        {superadmin && gateway && (
          <details>
            <summary>Gateway OpenWA · somente superadmin</summary>
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                setNotice('');
                try {
                  await api('/api/whatsapp/gateway', {
                    version: gateway.version,
                    baseUrl: gateway.baseUrl,
                    secret,
                  });
                  setSecret('');
                  setGateway(await api('/api/whatsapp/gateway'));
                  setConnection(await api(`/api/whatsapp?unit=${unitId}`));
                  setNotice('Gateway salvo. Informe o número para conectar.');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="span-2">
                URL do gateway
                <input
                  type="url"
                  required
                  value={gateway.baseUrl}
                  onChange={(e) => setGateway({ ...gateway, baseUrl: e.target.value })}
                />
              </label>
              <label className="span-2">
                Chave de API
                <input
                  type="password"
                  autoComplete="new-password"
                  maxLength={16000}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={
                    gateway.hasSecret
                      ? 'Chave salva · deixe vazio para manter'
                      : 'Informe a chave completa'
                  }
                />
              </label>
              <button className="secondary" disabled={busy}>
                <Save size={16} /> Salvar gateway
              </button>
            </form>
          </details>
        )}
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
        {connection && !connection.gatewayReady && (
          <p className="muted">O superadmin precisa configurar o gateway para liberar a conexão.</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void update('connect');
          }}
        >
          <label>
            Telefone do WhatsApp Business com DDI e DDD
            <input
              type="tel"
              required
              maxLength={25}
              placeholder="+55 11 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy || !connection?.gatewayReady}
            />
          </label>
          <p className="muted">
            Para números brasileiros com DDD e sem DDI, o app acrescenta 55. Para outros países,
            informe + e o código do país.
          </p>
          <div className="actions">
            <button className="primary" disabled={busy || !connection?.gatewayReady}>
              {busy
                ? 'Aguarde…'
                : connection?.status === 'connected'
                  ? 'Confirmar número'
                  : 'Conectar WhatsApp'}
            </button>
            {connection && connection.status !== 'not_started' && (
              <button
                type="button"
                className="secondary"
                disabled={busy || !connection.gatewayReady}
                onClick={() => void update('refresh')}
              >
                <RefreshCw size={16} /> Atualizar conexão
              </button>
            )}
          </div>
        </form>
        {connection?.qrCode && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={connection.qrCode}
              alt="QR Code para vincular o WhatsApp Business da empresa"
              width={280}
              height={280}
              style={{ maxWidth: '100%', height: 'auto', background: '#fff' }}
            />
            <p>
              No WhatsApp Business, abra Aparelhos conectados → Conectar um aparelho e leia este
              código.
            </p>
          </div>
        )}
        {connection?.status === 'wrong_number' && (
          <p role="alert" className="alert error">
            O aparelho conectado possui outro número ou o gateway não confirmou sua identidade.
            Desvincule esta sessão em Aparelhos conectados e conecte novamente com o número
            informado. Os avisos estão desativados.
          </p>
        )}
        {connection?.status === 'missing_session' && (
          <p className="muted" role="status">
            A sessão anterior não existe no gateway. Clique em Conectar WhatsApp para recuperar ou
            criar uma sessão exclusiva desta empresa no Nexus PTW.
          </p>
        )}
        {connection?.status === 'identity_pending' && (
          <p className="muted" role="status">
            O gateway ainda não informou o número do aparelho. A conexão será confirmada assim que
            essa informação estiver disponível.
          </p>
        )}
        {connection?.status === 'connected' && (
          <p className="success" role="status">
            WhatsApp conectado: +{connection.phone}
          </p>
        )}
        {connection && (
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={connection.sendNotifications}
              disabled={
                busy ||
                connection.status !== 'connected' ||
                phone.replace(/\D/g, '') !== connection.phone
              }
              onChange={(e) => void update('notifications', e.target.checked)}
            />{' '}
            Habilitar avisos de aprovação pelo WhatsApp
          </label>
        )}
        <p className="muted">
          O pareamento não envia mensagens. Ao habilitar os avisos, as aprovações pendentes poderão
          ser enviadas pelo processo de notificações.
        </p>
      </div>
    </section>
  );
}
