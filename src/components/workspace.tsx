'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  FileCheck2,
  ClipboardList,
  Building2,
  Users,
  Settings2,
  ChevronRight,
  Plus,
  Search,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  ArrowUpRight,
  Clock3,
  MapPin,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import type { DocumentInput } from '@/lib/validation';
import { asInput, dateLabel, statuses, type WorkspaceData, type DocumentRow } from '@/lib/types';
import * as offline from '@/lib/offline';
import DocumentEditor from './document-editor';
import AdminPanel from './admin-panel';
import SettingsPanel from './settings-panel';
import NotificationPanel from './notification-panel';
import PeoplePanel from './people-panel';
type Tab =
  'overview' | 'APR' | 'PT' | 'approvals' | 'contractors' | 'people' | 'registrations' | 'settings';
export async function api(path: string, body?: unknown, method?: string) {
  const response = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || 'Falha na solicitação.'), {
      status: response.status,
    });
  return result;
}
export default function Workspace() {
  const [ws, setWs] = useState<WorkspaceData | null>(null),
    [loading, setLoading] = useState(true),
    [online, setOnline] = useState(true),
    [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [pending, setPending] = useState<offline.Pending[]>([]),
    [local, setLocal] = useState<DocumentInput[]>([]),
    [editor, setEditor] = useState<DocumentInput | null>(null),
    [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const openedLink = useRef(false);
  const workspace = useRef(ws);
  workspace.current = ws;
  const load = useCallback(async (unitId?: string) => {
    try {
      const target = new URLSearchParams(window.location.search).get('document');
      const data = await api(
        '/api/workspace' +
          (unitId ? '?unit=' + unitId : target ? '?document=' + encodeURIComponent(target) : ''),
      );
      setWs(data);
      sessionStorage.setItem(
        'nexus-offline-session',
        JSON.stringify({
          userId: data.user.id,
          expires: new Date(data.user.session_expires_at).getTime(),
        }),
      );
      await offline.cacheWorkspace(data.user.id, data);
      setLocal(await offline.getLocal(data.user.id, data.unit.id));
      setPending(await offline.jobs(data.user.id));
      setError('');
      return data as WorkspaceData;
    } catch (e) {
      const status = (e as { status?: number }).status;
      const session = JSON.parse(sessionStorage.getItem('nexus-offline-session') || 'null');
      if (!navigator.onLine && session?.expires > Date.now()) {
        const cached = await offline.getWorkspace(session.userId);
        if (cached) {
          setWs(cached);
          setLocal(await offline.getLocal(session.userId, cached.unit.id));
          setPending(await offline.jobs(session.userId));
          return cached as WorkspaceData;
        }
      }
      if (status === 401 || status === 403) setWs(null);
      if (status !== 401) setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setOnline(navigator.onLine);
    void load();
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production')
      navigator.serviceWorker
        .register('/sw.js')
        .catch(() => setNotice('Modo offline indisponível neste navegador.'));
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [load]);
  useEffect(() => {
    if (!ws || openedLink.current) return;
    const params = new URLSearchParams(window.location.search),
      id = params.get('document');
    if (!id) return;
    openedLink.current = true;
    setTab('approvals');
    const document = ws.documents.find((d) => d.id === id);
    if (!document) {
      setNotice('Documento indisponível para seu perfil nesta unidade.');
      return;
    }
    if (Number(params.get('version')) !== document.version) {
      setNotice(
        'O aviso corresponde a uma versão anterior. Confira a versão atual e o histórico antes de decidir.',
      );
      return;
    }
    if (document.status !== 'em_aprovacao')
      setNotice('Esta solicitação não está mais aguardando aprovação.');
    setEditor(asInput(document));
  }, [ws]);
  const sync = useCallback(async () => {
    const current = workspace.current;
    if (!current || busy.current || !navigator.onLine) return;
    busy.current = true;
    setSyncing(true);
    let failures = 0;
    try {
      for (const job of await offline.jobs(current.user.id)) {
        try {
          await api(job.path, job.body);
          await offline.acknowledge(
            current.user.id,
            job.id,
            job.path === '/api/documents',
            job.body,
          );
        } catch (e) {
          failures++;
          await offline.enqueue(current.user.id, { ...job, error: (e as Error).message });
          if ((e as { status?: number }).status === 401) break;
        }
      }
      await load(current.unit.id);
      if (failures) setNotice('Há itens pendentes. Confira os detalhes de sincronização.');
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [load]);
  useEffect(() => {
    if (online && ws) void sync();
  }, [online, ws?.user.id, sync]);
  async function save(d: DocumentInput) {
    if (!ws) return;
    if (busy.current)
      throw new Error('Aguarde a sincronização terminar antes de salvar novas alterações.');
    await offline.saveLocal(ws.user.id, d);
    await offline.enqueue(ws.user.id, { id: d.id, path: '/api/documents', body: d });
    setLocal(await offline.getLocal(ws.user.id, ws.unit.id));
    setPending(await offline.jobs(ws.user.id));
    setEditor(null);
    setNotice('Rascunho salvo no dispositivo.');
    if (navigator.onLine) await sync();
  }
  function create(kind: 'APR' | 'PT') {
    if (!ws) return;
    const today = new Date().toLocaleDateString('en-CA');
    setEditor({
      id: crypto.randomUUID(),
      unitId: ws.unit.id,
      contractorId: '',
      kind,
      title: '',
      location: '',
      startsAt: today,
      endsAt: today,
      aprId: null,
      version: 0,
      data: { answers: {}, types: [], ppe: [], risks: [], executors: [] },
    });
  }
  async function workflow(d: DocumentRow, action: 'submit' | 'approve' | 'reject') {
    if (!online) {
      setError('Esta ação exige conexão.');
      return;
    }
    let comment = '';
    if (action === 'reject') {
      const answer = window.prompt('Motivo da rejeição:');
      if (!answer) return;
      comment = answer;
    }
    try {
      await api(`/api/documents/${d.id}/workflow`, { action, version: d.version, comment });
      await load(ws?.unit.id);
      setNotice('Decisão registrada no histórico.');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function logout() {
    if (!ws) return;
    if (pending.length) {
      setError('Sincronize os itens pendentes antes de sair para evitar perda de dados.');
      return;
    }
    try {
      await api('/api/auth', undefined, 'DELETE');
      await offline.clearLocal(ws.user.id);
      sessionStorage.removeItem('nexus-offline-session');
      setWs(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="boot">
        <ShieldCheck size={44} />
        <p>Preparando seu espaço de trabalho…</p>
      </div>
    );
  if (!ws) return <Login error={error} onLogin={() => load()} />;
  const unit = ws.unit,
    docs = ws.documents.filter(
      (d) =>
        !search ||
        `${d.title} ${d.number} ${d.location}`.toLowerCase().includes(search.toLowerCase()),
    );
  const needsMe = ws.approvals.filter(
    (a) =>
      a.user_id === ws.user.id &&
      !a.decision &&
      ws.documents.some((d) => d.id === a.document_id && d.status === 'em_aprovacao'),
  );
  const nav: [Tab, string, typeof LayoutDashboard][] = [
    ['overview', 'Visão geral', LayoutDashboard],
    ['APR', 'Análises de risco', FileCheck2],
    ['PT', 'Permissões de trabalho', ClipboardList],
    ['approvals', 'Aprovações', CheckCircle2],
    ['contractors', 'Terceirizadas', Building2],
    ['people', 'Pessoas e acessos', Users],
    ['registrations', 'Cadastros', Plus],
    ['settings', 'Configurações', Settings2],
  ];
  const title = nav.find((n) => n[0] === tab)?.[1];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Nexus PTW início">
          <span className="brand-icon">
            <ShieldCheck />
          </span>
          <span>
            NEXUS <small>PTW AI</small>
          </span>
        </a>
        <div className="workspace-label">SEGURANÇA DO TRABALHO</div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? 'nav active' : 'nav'}
              onClick={() => {
                setTab(id);
                setSearch('');
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'approvals' && needsMe.length > 0 && <b>{needsMe.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="pilot-dot" /> Ambiente piloto{' '}
          <small>Uma operação mais segura, etapa por etapa.</small>
        </div>
        <button className="profile" onClick={() => void logout()} title="Sair">
          <span className="avatar">{ws.user.name.slice(0, 2).toUpperCase()}</span>
          <span>
            {ws.user.name}
            <small>{unit.role}</small>
          </span>
          <LogOut size={17} />
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{unit.company_name || 'Ambev'}</strong>
          </div>
          <div className="topbar-right">
            <span className={'connection ' + (!online ? 'offline' : '')}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              <span>{online ? 'Conectado' : 'Offline'}</span>
            </span>
            <label className="unit-selector">
              <Building2 size={16} />
              <select
                aria-label="Unidade ativa"
                value={unit.id}
                disabled={!online || pending.length > 0}
                onChange={(e) => void load(e.target.value)}
              >
                {ws.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.company_name} · {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">NEXUS / {unit.name}</div>
              <h1>{title}</h1>
              <p>
                {tab === 'overview'
                  ? 'Acompanhe os riscos, as permissões e as pessoas da sua operação.'
                  : tab === 'APR'
                    ? 'Planeje cada etapa do serviço e suas medidas de controle.'
                    : tab === 'PT'
                      ? 'Organize as permissões vinculadas às análises de risco.'
                      : 'Gestão da segurança com rastreabilidade em cada decisão.'}
              </p>
            </div>
            {['overview', 'APR', 'PT'].includes(tab) && (
              <button className="primary" onClick={() => create(tab === 'PT' ? 'PT' : 'APR')}>
                <Plus size={18} />
                {tab === 'PT' ? 'Nova PT' : 'Nova APR'}
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="alert error">
              <AlertCircle size={19} />
              <span>{error}</span>
              <button aria-label="Fechar erro" onClick={() => setError('')}>
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert">
              <CheckCircle2 size={19} />
              <span>{notice}</span>
              <button aria-label="Fechar aviso" onClick={() => setNotice('')}>
                <X size={17} />
              </button>
            </div>
          )}
          {pending.length > 0 && (
            <div className="sync-panel">
              <div>
                <strong>{pending.length} item(ns) aguardando sincronização</strong>
                <small>Os dados continuam salvos neste dispositivo.</small>
                {pending
                  .filter((p) => p.error)
                  .map((p) => (
                    <p key={p.id} className="sync-error">
                      {p.error}
                    </p>
                  ))}
              </div>
              <button
                className="secondary"
                disabled={!online || syncing}
                onClick={() => void sync()}
              >
                <RefreshCw size={16} className={syncing ? 'spin' : ''} />
                {syncing ? 'Sincronizando' : 'Tentar envio'}
              </button>
            </div>
          )}
          {tab === 'overview' && (
            <>
              <div className="stats">
                {[
                  [
                    'APRs cadastradas',
                    ws.documents.filter((d) => d.kind === 'APR').length,
                    FileCheck2,
                    'Planejamento de atividades',
                    'teal',
                  ],
                  [
                    'PTs cadastradas',
                    ws.documents.filter((d) => d.kind === 'PT').length,
                    ClipboardList,
                    'Permissões por serviço',
                    'blue',
                  ],
                  [
                    'Minhas aprovações',
                    needsMe.length,
                    Clock3,
                    'Decisões aguardando análise',
                    'amber',
                  ],
                  [
                    'Terceirizadas',
                    ws.contractors.length,
                    Building2,
                    'Autorizadas nesta unidade',
                    'purple',
                  ],
                ].map(([label, value, Icon, detail, color]) => {
                  const I = Icon as typeof FileCheck2;
                  return (
                    <article className="stat-card" key={String(label)}>
                      <div>
                        <span>{String(label)}</span>
                        <i className={String(color)}>
                          <I size={20} />
                        </i>
                      </div>
                      <strong>{String(value)}</strong>
                      <small>{String(detail)}</small>
                    </article>
                  );
                })}
              </div>
              <div className="overview-grid">
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <h2>Documentos recentes</h2>
                      <p>Últimas movimentações da unidade</p>
                    </div>
                    <button className="text-button" onClick={() => setTab('APR')}>
                      Ver análises <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <DocumentTable
                    docs={docs.slice(0, 6)}
                    contractors={ws.contractors}
                    onOpen={(d) => setEditor(asInput(d))}
                  />
                </section>
                <section className="card operation">
                  <span className="eyebrow">CONTROLE OPERACIONAL</span>
                  <div className="operation-icon">
                    <ShieldCheck size={34} />
                  </div>
                  <h2>
                    Segurança começa
                    <br />
                    com planejamento.
                  </h2>
                  <p>Registre os riscos, defina os controles e acompanhe cada aprovação.</p>
                  <div className="checkline">
                    <CheckCircle2 size={17} /> Histórico de decisões
                  </div>
                  <div className="checkline">
                    <CheckCircle2 size={17} /> Evidências no encerramento
                  </div>
                  <div className="checkline">
                    <MapPin size={17} /> Organização por unidade
                  </div>
                  <button className="secondary" onClick={() => create('APR')}>
                    Criar análise de risco <ChevronRight size={16} />
                  </button>
                </section>
              </div>
              <div className="alert neutral">
                <AlertCircle size={19} />
                <span>
                  <strong>Fase de estruturação do MVP.</strong> PTs podem ser preenchidas; liberação
                  operacional e assinatura eletrônica aguardam as regras do contratante e a
                  integração com o fornecedor de assinatura.
                </span>
              </div>
            </>
          )}
          {(tab === 'APR' || tab === 'PT') && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>
                    {tab === 'APR' ? 'Análises preliminares de riscos' : 'Permissões de trabalho'}
                  </h2>
                  <p>Documentos e rascunhos da unidade</p>
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder="Buscar documento…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {local
                .filter((d) => d.kind === tab)
                .map((d) => (
                  <button className="local-draft" key={d.id} onClick={() => setEditor(d)}>
                    <Clock3 size={18} />
                    <span>
                      {d.title || 'Novo rascunho'}
                      <small>Salvo neste dispositivo · aguardando envio</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              <DocumentTable
                docs={docs.filter((d) => d.kind === tab)}
                contractors={ws.contractors}
                onOpen={(d) => setEditor(asInput(d))}
              />
            </section>
          )}
          {tab === 'approvals' && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>Caixa de aprovações</h2>
                  <p>
                    Decisões internas registradas por versão; não equivalem à assinatura eletrônica.
                  </p>
                </div>
              </div>
              {needsMe.length === 0 ? (
                <Empty
                  title="Nenhuma decisão pendente"
                  text="Suas solicitações de aprovação aparecerão aqui."
                />
              ) : (
                ws.documents
                  .filter((d) => needsMe.some((a) => a.document_id === d.id))
                  .map((d) => (
                    <div className="approval-row" key={d.id}>
                      <div>
                        <span className="doc-kind">{d.kind}</span>
                        <h3>{d.title}</h3>
                        <p>
                          Revisão {d.version} · {d.location}
                        </p>
                        <small>
                          {needsMe
                            .filter((a) => a.document_id === d.id)
                            .map((a) => a.profile)
                            .join(' · ')}
                        </small>
                      </div>
                      <div className="actions">
                        <button className="secondary" onClick={() => setEditor(asInput(d))}>
                          Conferir
                        </button>
                        <button
                          className="danger"
                          disabled={!online}
                          onClick={() => void workflow(d, 'reject')}
                        >
                          Rejeitar
                        </button>
                        <button
                          className="primary"
                          disabled={!online}
                          onClick={() => void workflow(d, 'approve')}
                        >
                          Aprovar
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </section>
          )}
          {tab === 'contractors' && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>Terceirizadas autorizadas</h2>
                  <p>O vínculo é específico para esta unidade.</p>
                </div>
              </div>
              {ws.contractors.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>CNPJ</th>
                        <th>Vínculo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ws.contractors.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td>{c.cnpj}</td>
                          <td>
                            <span className="badge aprovado">Autorizada</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Cadastre a primeira terceirizada"
                  text="Use Cadastros para autorizar uma empresa nesta unidade."
                />
              )}
            </section>
          )}
          {tab === 'approvals' && <NotificationPanel unitId={unit.id} online={online} />}
          {tab === 'people' && (
            <PeoplePanel key={unit.id} ws={ws} online={online} reload={() => load(unit.id)} />
          )}
          {tab === 'registrations' && (
            <AdminPanel
              ws={ws}
              online={online}
              reload={() => load(unit.id)}
              onError={setError}
              onManagePeople={() => setTab('people')}
            />
          )}
          {tab === 'settings' && (
            <SettingsPanel
              ws={ws}
              online={online}
              reload={() => load(unit.id)}
              onError={setError}
            />
          )}
          <footer className="page-footer">
            <span>Nexus PTW AI</span>
            <span>Planejar. Proteger. Registrar.</span>
          </footer>
        </main>
      </div>
      {editor && (
        <DocumentEditor
          key={`${editor.id}:${editor.version}`}
          value={editor}
          ws={ws}
          online={online}
          onClose={() => setEditor(null)}
          onSave={save}
          onReassigned={async () => {
            await load(unit.id);
            setNotice('Responsável pendente substituído. O motivo foi registrado no histórico.');
          }}
          onRevise={async (reason) => {
            if (busy.current || pending.some((job) => job.id === editor.id))
              throw new Error('Aguarde a sincronização antes de criar uma revisão.');
            await api(`/api/documents/${editor.id}/workflow`, {
              action: 'revise',
              version: editor.version,
              comment: reason,
            });
            const refreshed = await load(unit.id);
            const revised = refreshed?.documents.find(
              (document: DocumentRow) => document.id === editor.id,
            );
            if (revised) setEditor(asInput(revised));
            setNotice(
              'Nova revisão criada. A versão anterior e os vínculos das PTs foram preservados.',
            );
          }}
          onSubmit={async () => {
            const d = ws.documents.find((d) => d.id === editor.id);
            if (d) {
              await workflow(d, 'submit');
              setEditor(null);
            }
          }}
          onPhotoQueued={async () => {
            setPending(await offline.jobs(ws.user.id));
            if (online) await sync();
          }}
        />
      )}
    </div>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span>
        <FileCheck2 size={27} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function DocumentTable({
  docs,
  contractors,
  onOpen,
}: {
  docs: DocumentRow[];
  contractors: WorkspaceData['contractors'];
  onOpen: (d: DocumentRow) => void;
}) {
  if (!docs.length)
    return (
      <Empty
        title="Tudo pronto para começar"
        text="Crie o primeiro documento para organizar a segurança da operação."
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Documento / atividade</th>
            <th>Terceirizada</th>
            <th>Período previsto</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="document-link" onClick={() => onOpen(d)}>
                  <span className={'file-icon ' + d.kind}>
                    <FileCheck2 size={19} />
                  </span>
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {d.kind}-{String(d.number).padStart(5, '0')} · Revisão {d.version}
                    </small>
                  </span>
                </button>
              </td>
              <td>{contractors.find((c) => c.id === d.contractor_id)?.name || '—'}</td>
              <td className="nowrap">
                {dateLabel(d.starts_at)}
                <small>até {dateLabel(d.ends_at)}</small>
              </td>
              <td>
                <span className={'badge ' + d.status}>
                  <i />
                  {statuses[d.status]}
                </span>
              </td>
              <td>
                <button
                  aria-label={'Abrir ' + d.title}
                  className="icon-button"
                  onClick={() => onOpen(d)}
                >
                  <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Login({ error, onLogin }: { error: string; onLogin: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(error);
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <ShieldCheck />
          </span>
          <span>
            NEXUS <small>PTW AI</small>
          </span>
        </div>
        <span className="eyebrow">SEGURANÇA DO TRABALHO</span>
        <h1>
          Cada etapa planejada.
          <br />
          Cada pessoa protegida.
        </h1>
        <p>Análises de risco, permissões de trabalho e evidências em um único lugar.</p>
        <div className="login-grid">
          <span>
            <FileCheck2 />
            Planejamento
          </span>
          <span>
            <ShieldCheck />
            Aprovações
          </span>
          <span>
            <MapPin />
            Rastreabilidade
          </span>
        </div>
        <small>Da análise ao encerramento da atividade.</small>
      </div>
      <div className="login-form">
        <div>
          <span className="eyebrow">BEM-VINDO AO NEXUS</span>
          <h2>Acesse sua operação</h2>
          <p>Entre com sua conta individual para continuar.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage('');
              const f = new FormData(e.currentTarget);
              try {
                await api('/api/auth', { email: f.get('email'), password: f.get('password') });
                const result = await onLogin();
                if (!result)
                  setMessage(
                    'Não foi possível abrir o workspace. Verifique seu acesso ativo com o administrador.',
                  );
              } catch (err) {
                setMessage((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="voce@empresa.com.br"
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Sua senha"
                maxLength={256}
              />
            </label>
            {message && (
              <div className="alert error" role="alert">
                {message}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar no workspace'}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="login-help">Seu acesso é disponibilizado pelo administrador da unidade.</p>
        </div>
        <small>Nexus PTW AI · Ambiente piloto</small>
      </div>
    </div>
  );
}
