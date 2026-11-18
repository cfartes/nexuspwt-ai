'use client';
import { useEffect, useState } from 'react';
import { api } from './workspace';
import { statuses } from '@/lib/types';

type History = {
  versions: { version: number; status: string; created_at: string }[];
  events: {
    action: string;
    details: { version?: number; comment?: string };
    occurred_at: string;
    actor: string;
  }[];
};
const actions: Record<string, string> = {
  'rascunho.criado': 'Rascunho criado',
  'rascunho.atualizado': 'Rascunho atualizado',
  'workflow.submit': 'Enviado para análise',
  'workflow.approve': 'Aprovação registrada',
  'workflow.reject': 'Rejeição registrada',
  'workflow.revise': 'Nova revisão criada',
  'aprovacao.responsavel_substituido': 'Responsável pendente substituído',
};
export default function DocumentHistory({ id, online }: { id: string; online: boolean }) {
  const [history, setHistory] = useState<History | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!online) return;
    let active = true;
    api(`/api/documents/${id}/history`)
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, online]);
  if (!online)
    return (
      <div className="alert neutral">
        Conecte-se para consultar o histórico arquivado no servidor.
      </div>
    );
  if (error)
    return (
      <div className="alert error" role="alert">
        {error}
      </div>
    );
  if (!history)
    return (
      <p className="muted" role="status">
        Carregando histórico…
      </p>
    );
  return (
    <>
      <div className="section-intro">
        <h3>Versões e decisões preservadas</h3>
        <p>Uma nova revisão exige nova análise. As PTs existentes mantêm seu vínculo original.</p>
      </div>
      <h3>Versões enviadas para análise</h3>
      {history.versions.length === 0 && (
        <p className="muted">Nenhuma versão foi enviada para análise.</p>
      )}
      {history.versions.map((v) => (
        <div className="setting-row" key={v.version}>
          <div>
            <strong>Versão {v.version}</strong>
            <small>{new Date(v.created_at).toLocaleString('pt-BR')}</small>
          </div>
          <span className={'badge ' + v.status}>{statuses[v.status]}</span>
          <a
            className="text-button"
            href={`/print/${id}?version=${v.version}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Consultar / imprimir
          </a>
        </div>
      ))}
      <h3 style={{ marginTop: 28 }}>Registro de atividades</h3>
      {history.events.map((event, i) => (
        <div className="setting-row" key={i}>
          <div>
            <strong>{actions[event.action] || event.action}</strong>
            <small>
              {event.actor}
              {event.details.version ? ` · versão ${event.details.version}` : ''}
            </small>
            {event.details.comment && <p className="muted">{event.details.comment}</p>}
          </div>
          <small>{new Date(event.occurred_at).toLocaleString('pt-BR')}</small>
        </div>
      ))}
    </>
  );
}
