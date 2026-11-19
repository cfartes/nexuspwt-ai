'use client';
import { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { api } from './workspace';
import Popup from './popup';
import { auditActionLabels } from '@/lib/audit-labels';
import { roleLabels } from '@/lib/permissions';

type AuditEvent = {
  id: string;
  occurred_at: string;
  action: string;
  actor_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  document_kind: string | null;
  document_number: string | null;
  details: Record<string, string | number | boolean>;
};
type AuditData = {
  events: AuditEvent[];
  units: { id: string; name: string }[];
  actors: { id: string; name: string }[];
  actions: string[];
  nextCursor: string | null;
};
const emptyFilters = { unit: '', actor: '', action: '', from: '', to: '' };
const detailLabels: Record<string, string> = {
  name: 'Nome do cadastro',
  kind: 'Tipo de cadastro',
  targetId: 'Identificador do cadastro',
  id: 'Identificador',
  userId: 'Pessoa vinculada',
  contractorId: 'Terceirizada',
  role: 'Perfil',
  active: 'Ativo',
  companyAdmin: 'Admin da empresa',
  version: 'Versão',
  previousVersion: 'Versão anterior',
  profile: 'Etapa da aprovação',
  previousUserId: 'Responsável anterior',
  comment: 'Observação',
  reason: 'Motivo',
  method: 'Confirmação de identidade',
  required: 'Autenticador obrigatório',
  credentialChanged: 'Credencial alterada',
  service: 'Integração',
  provider: 'Fornecedor',
  status: 'Situação',
  enabled: 'Habilitado',
  previousLimit: 'Limite anterior',
  limit: 'Limite',
  used: 'Unidades cadastradas',
  phoneChanged: 'Telefone alterado',
  duplicateRiskConfirmed: 'Risco de envio duplicado confirmado',
};
const dateTime = (date: string) =>
  new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export default function AuditPanel({
  contextUnitId,
  online,
}: {
  contextUnitId: string;
  online: boolean;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [cursors, setCursors] = useState<string[]>([]);
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const before = cursors.at(-1);
  useEffect(() => {
    let active = true;
    setSelected(null);
    if (!online) {
      setData(null);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({ context: contextUnitId });
    for (const [key, value] of Object.entries(applied)) if (value) params.set(key, value);
    if (before) params.set('before', before);
    setLoading(true);
    setError('');
    api('/api/audit?' + params)
      .then((result: AuditData) => {
        if (active) setData(result);
      })
      .catch((e: Error) => {
        if (active) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contextUnitId, online, applied, before, refresh]);
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>
            <History size={18} /> Histórico de ações da empresa
          </h2>
          <p>
            Consulta exclusiva do Admin da Empresa. Horários de Brasília. Registros somente para
            leitura.
          </p>
        </div>
        <button
          className="secondary"
          disabled={!online || loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {!online ? (
        <p className="settings-empty">Conecte-se para consultar a auditoria.</p>
      ) : (
        <>
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              setCursors([]);
              setApplied({ ...filters });
            }}
          >
            <div className="form-grid">
              <label>
                Unidade
                <select
                  value={filters.unit}
                  onChange={(e) => setFilters({ ...filters, unit: e.target.value })}
                >
                  <option value="">Todas as unidades da empresa</option>
                  {data?.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Usuário
                <select
                  value={filters.actor}
                  onChange={(e) => setFilters({ ...filters, actor: e.target.value })}
                >
                  <option value="">Todos os usuários</option>
                  {data?.actors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || 'Usuário'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ação
                <select
                  value={filters.action}
                  onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                >
                  <option value="">Todas as ações</option>
                  {data?.actions.map((a) => (
                    <option key={a} value={a}>
                      {auditActionLabels[a] || a}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  De
                  <input
                    type="date"
                    value={filters.from}
                    max={filters.to || undefined}
                    onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  />
                </label>
                <label>
                  Até
                  <input
                    type="date"
                    value={filters.to}
                    min={filters.from || undefined}
                    onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  />
                </label>
              </div>
            </div>
            <div className="actions" style={{ marginTop: 20 }}>
              <button className="primary" disabled={loading}>
                Filtrar histórico
              </button>
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={() => {
                  setFilters(emptyFilters);
                  setApplied({ ...emptyFilters });
                  setCursors([]);
                }}
              >
                Limpar filtros
              </button>
            </div>
          </form>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {loading ? (
            <p className="settings-empty" role="status">
              Carregando histórico…
            </p>
          ) : (
            data && (
              <>
                {data.events.length === 0 ? (
                  <p className="settings-empty">
                    Nenhuma ação encontrada para os filtros selecionados.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Data e hora</th>
                          <th>Usuário</th>
                          <th>Unidade</th>
                          <th>Ação / registro</th>
                          <th>Consulta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.events.map((event) => (
                          <tr key={event.id}>
                            <td>
                              {dateTime(event.occurred_at)}
                              <small>Registro #{event.id}</small>
                            </td>
                            <td>{event.actor_name || 'Usuário'}</td>
                            <td>
                              {event.unit_name || (event.unit_id ? 'Unidade removida' : 'Empresa')}
                            </td>
                            <td>
                              {auditActionLabels[event.action] || event.action}
                              {event.document_kind && (
                                <small>
                                  {event.document_kind}-{event.document_number}
                                </small>
                              )}
                              {typeof event.details.name === 'string' && (
                                <small>{event.details.name}</small>
                              )}
                            </td>
                            <td>
                              <button className="secondary" onClick={() => setSelected(event)}>
                                Ver detalhes
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="actions" style={{ padding: 24, flexWrap: 'wrap' }}>
                  <button
                    className="secondary"
                    disabled={cursors.length === 0}
                    onClick={() => setCursors((c) => c.slice(0, -1))}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {cursors.length + 1} · {data.events.length} registro(s)
                  </span>
                  <button
                    className="secondary"
                    disabled={!data.nextCursor}
                    onClick={() => setCursors((c) => [...c, data.nextCursor!])}
                  >
                    Próxima
                  </button>
                </div>
              </>
            )
          )}
        </>
      )}
      {selected && online && (
        <Popup title="Detalhes do registro de auditoria" onClose={() => setSelected(null)}>
          <div className="admin-form">
            <h3>{auditActionLabels[selected.action] || selected.action}</h3>
            <p>
              {dateTime(selected.occurred_at)} · {selected.actor_name || 'Usuário'}
            </p>
            <p>
              Unidade: {selected.unit_name || (selected.unit_id ? 'Unidade removida' : 'Empresa')}
            </p>
            {selected.document_kind && (
              <p>
                Documento: {selected.document_kind}-{selected.document_number}
              </p>
            )}
            {Object.entries(selected.details).map(([key, value]) => (
              <div className="setting-row" key={key}>
                <strong>{detailLabels[key] || key}</strong>
                <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                  {typeof value === 'boolean'
                    ? value
                      ? 'Sim'
                      : 'Não'
                    : key === 'role'
                      ? roleLabels[String(value)] || String(value)
                      : String(value)}
                </span>
              </div>
            ))}
            {Object.keys(selected.details).length === 0 && (
              <p className="muted">Sem informações complementares neste registro.</p>
            )}
          </div>
        </Popup>
      )}
    </section>
  );
}
