'use client';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, MessageCircle } from 'lucide-react';
import { api } from './workspace';
type Notification = {
  id: string;
  document_id: string;
  version: number;
  status: string;
  attempts: number;
  sent_at: string | null;
  last_error: string | null;
  recipient_hint: string | null;
  recipient: string;
  kind: string;
  number: string;
};
const statuses: Record<string, string> = {
  pending: 'Na fila',
  blocked: 'Aguardando correção',
  sending: 'Enviando',
  sent: 'Aceita pelo gateway',
  uncertain: 'Envio sem confirmação',
  cancelled: 'Aviso cancelado',
};
export default function NotificationPanel({ unitId, online }: { unitId: string; online: boolean }) {
  const [data, setData] = useState<{ notifications: Notification[]; canRetry: boolean } | null>(
      null,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api(`/api/notifications?unit=${unitId}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [unitId]);
  useEffect(() => {
    setData(null);
    if (online) void load();
  }, [online, load]);
  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div className="card-heading">
        <div>
          <h2>
            <MessageCircle size={18} />
            Avisos de aprovação
          </h2>
          <p>
            O envio é separado da decisão. Aceitação pelo gateway não confirma leitura ou entrega.
          </p>
        </div>
        <button className="secondary" disabled={!online || busy} onClick={() => void load()}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!online ? (
        <p className="settings-empty">Conecte-se para consultar o envio das notificações.</p>
      ) : !data ? (
        <p className="settings-empty" role="status">
          Carregando notificações…
        </p>
      ) : data.notifications.length === 0 ? (
        <p className="settings-empty">
          Os avisos aparecerão após enviar um documento para análise.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Destinatário</th>
                <th>Situação</th>
                <th>Tentativas</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {data.notifications.map((n) => (
                <tr key={n.id}>
                  <td>
                    {n.kind}-{n.number}
                    <small>Versão {n.version}</small>
                  </td>
                  <td>
                    {n.recipient}
                    <small>{n.recipient_hint}</small>
                  </td>
                  <td>
                    <span className="badge">{statuses[n.status]}</span>
                    {n.last_error && <small>{n.last_error}</small>}
                    {n.sent_at && <small>{new Date(n.sent_at).toLocaleString('pt-BR')}</small>}
                  </td>
                  <td>{n.attempts}</td>
                  <td>
                    {data.canRetry && ['blocked', 'uncertain'].includes(n.status) && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={async () => {
                          let confirmDuplicateRisk = false;
                          if (n.status === 'uncertain') {
                            confirmDuplicateRisk = window.confirm(
                              'O envio anterior pode ter sido realizado. Confira o painel do OpenWA antes de continuar. Deseja reenviar mesmo com risco de mensagem duplicada?',
                            );
                            if (!confirmDuplicateRisk) return;
                          }
                          setBusy(true);
                          try {
                            await api('/api/notifications', {
                              id: n.id,
                              unitId,
                              confirmDuplicateRisk,
                            });
                            await load();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Tentar novamente
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
