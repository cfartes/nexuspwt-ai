'use client';
import { useEffect, useState } from 'react';
import { History, RefreshCw, Download } from 'lucide-react';
import { readApiJson } from '@/lib/api-response';
import { api } from './workspace';
import Popup from './popup';
import { auditActionLabels, auditDetailLabels as detailLabels } from '@/lib/audit-labels';
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
  const [exporting, setExporting] = useState('');
  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(applied);
  async function exportReport(format: 'xlsx' | 'pdf') {
    setExporting(format);
    setError('');
    try {
      const params = new URLSearchParams({ context: contextUnitId, format });
      for (const [key, value] of Object.entries(applied)) if (value) params.set(key, value);
      const response = await fetch('/api/audit/export?' + params, {
        cache: 'no-store',
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) {
        const result = await readApiJson(response);
        throw new Error(result.error || 'Não foi possível exportar o relatório.');
      }
      const mime =
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (!(response.headers.get('Content-Type') || '').startsWith(mime))
        throw new Error(
          'O servidor não retornou o arquivo esperado. Atualize o aplicativo e tente novamente.',
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `nexus-auditoria-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setExporting('');
    }
  }
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
        <div className="audit-export-actions">
          {(['xlsx', 'pdf'] as const).map((format) => (
            <button
              key={format}
              className="secondary"
              disabled={!online || loading || !!exporting || !data || filtersChanged}
              onClick={() => void exportReport(format)}
            >
              <Download size={16} />{' '}
              {exporting === format ? 'Gerando…' : `Exportar ${format.toUpperCase()}`}
            </button>
          ))}
          <button
            className="secondary"
            disabled={!online || loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
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
            <p className="muted">
              A exportação inclui todos os eventos dos filtros aplicados, com todos os campos de
              auditoria, sem limitar à página atual. Limpe os filtros para exportar todo o histórico
              da empresa.
            </p>
            {filtersChanged && (
              <p className="muted" role="status">
                Clique em Filtrar histórico para aplicar as alterações e liberar a exportação.
              </p>
            )}
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
