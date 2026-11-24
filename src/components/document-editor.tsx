'use client';
import { useEffect, useRef, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  Send,
  Printer,
  Camera,
  CheckCircle2,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { documentSchema, type DocumentInput } from '@/lib/validation';
import { aprProfiles, permissionTypes, ppeOptions, visibleSections } from '@/lib/forms';
import { statuses, type WorkspaceData } from '@/lib/types';
import { enqueue } from '@/lib/offline';
import { api } from './workspace';
import DocumentHistory from './document-history';
import ReassignApproval from './reassign-approval';
import { ptToday, ptCreationError, ptEndError, ptAprError } from '@/lib/pt-calendar';
import PtLifecycleControls from './pt-lifecycle-controls';
import type { PtAction } from '@/lib/pt-lifecycle';
type Photo = {
  id: string;
  caption: string;
  captured_at: string;
  latitude: number;
  longitude: number;
  accuracy: number;
};
export default function DocumentEditor({
  value,
  ws,
  online,
  onClose,
  onSave,
  onSubmit,
  onRevise,
  onReassigned,
  onPhotoQueued,
  onPtChanged,
}: {
  value: DocumentInput;
  ws: WorkspaceData;
  online: boolean;
  onClose: () => void;
  onSave: (d: DocumentInput) => Promise<void>;
  onSubmit: () => Promise<void>;
  onRevise: (reason: string) => Promise<void>;
  onReassigned: () => Promise<void>;
  onPhotoQueued: () => Promise<void>;
  onPtChanged: (action: PtAction, reason: string, endTime: string) => Promise<void>;
}) {
  const modal = useRef<HTMLElement>(null);
  const [d, setD] = useState(value),
    [page, setPage] = useState('identity'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false),
    [photos, setPhotos] = useState<Photo[]>([]);
  const saved = ws.documents.find((doc) => doc.id === d.id);
  const aprError =
    d.kind === 'PT' && (!saved || saved.apr_id !== d.aprId)
      ? ptAprError(
          ws.documents.find((apr) => apr.id === d.aprId),
          d.startsAt,
        )
      : null;
  const readOnly =
    ws.unit.role === 'aprovador' ||
    (!!saved &&
      (['aprovado', 'em_aprovacao', 'encerrado'].includes(saved.status) ||
        (saved.created_by !== ws.user.id &&
          !['admin', 'gestor', 'seguranca_trabalho'].includes(ws.unit.role))));
  const update = (patch: Partial<DocumentInput>) => setD((prev) => ({ ...prev, ...patch }));
  const answer = (key: string, value: string) =>
    setD((prev) => ({
      ...prev,
      data: { ...prev.data, answers: { ...prev.data.answers, [key]: value } },
    }));
  const toggle = (key: 'types' | 'ppe', value: string) =>
    setD((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        [key]: prev.data[key].includes(value)
          ? prev.data[key].filter((v) => v !== value)
          : [...prev.data[key], value],
      },
    }));
  useEffect(() => {
    if (saved && d.kind === 'PT' && online)
      api(`/api/documents/${d.id}/photos`)
        .then(setPhotos)
        .catch((e) => setError(e.message));
  }, [d.id, d.kind, online, saved]);
  const tabs = [
    ['identity', 'Identificação'],
    [
      d.kind === 'APR' ? 'risks' : 'checklists',
      d.kind === 'APR' ? 'Etapas e riscos' : 'Tipos e checklists',
    ],
    ['executors', 'Executantes'],
    ['approvals', 'Aprovações'],
    ['history', 'Histórico'],
    ...(d.kind === 'PT' ? [['photos', 'Evidências']] : []),
  ];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (camera) return;
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        modal.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKey);
      previous?.focus();
    };
  }, [camera, onClose]);
  return (
    <div className="modal-backdrop">
      <section
        ref={modal}
        className="document-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${d.kind}: ${d.title || 'Novo documento'}`}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">
              {d.kind === 'APR' ? 'ANÁLISE PRELIMINAR DE RISCOS' : 'PERMISSÃO DE TRABALHO'}
            </span>
            <h2>
              {saved ? `${d.kind}-${String(saved.number).padStart(5, '0')}` : `Nova ${d.kind}`}{' '}
              <span className={'badge ' + (saved?.status || 'rascunho')}>
                {statuses[saved?.status || 'rascunho']}
              </span>
            </h2>
          </div>
          <button autoFocus className="icon-button" aria-label="Fechar documento" onClick={onClose}>
            <X />
          </button>
        </header>
        {saved?.kind === 'PT' &&
          saved.status === 'aprovado' &&
          (saved.starts_at.slice(0, 10) !== ptToday() ||
            ptEndError(saved.data.answers['general.endsAt'] || '')) && (
            <p className="alert error">
              O prazo desta PT terminou. Para continuar hoje, solicite prorrogação e nova aprovação.
              Em outro dia, crie uma nova PT.
            </p>
          )}
        <div className="editor-tabs" role="tablist">
          {tabs.map(([key, label]) => (
            <button
              role="tab"
              aria-selected={page === key}
              key={key}
              className={page === key ? 'selected' : ''}
              onClick={() => setPage(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="editor-body">
          {error && (
            <div className="alert error" role="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          {page === 'identity' && (
            <>
              <div className="section-intro">
                <h3>O serviço começa com contexto.</h3>
                <p>Identifique a atividade, o local e o período previsto de execução.</p>
              </div>
              <fieldset disabled={readOnly} className="form-grid">
                <label className="span-2">
                  Descrição dos trabalhos *
                  <textarea
                    value={d.title}
                    onChange={(e) => update({ title: e.target.value })}
                    maxLength={500}
                    placeholder="Descreva a atividade que será realizada"
                  />
                </label>
                <label>
                  Unidade
                  <input value={ws.unit.name} readOnly />
                </label>
                <label>
                  Terceirizada *
                  <select
                    value={d.contractorId}
                    onChange={(e) =>
                      setD((prev) => ({
                        ...prev,
                        contractorId: e.target.value,
                        data: {
                          ...prev.data,
                          answers: {
                            ...prev.data.answers,
                            companyUserId: '',
                            companyOwner: '',
                            companyPhone: '',
                            safetyUserId: '',
                            safetyOwner: '',
                            safetyPhone: '',
                          },
                        },
                      }))
                    }
                  >
                    <option value="">Selecione</option>
                    {ws.contractors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Local da atividade *
                  <input
                    value={d.location}
                    onChange={(e) => update({ location: e.target.value })}
                    placeholder="Setor, área ou equipamento"
                    maxLength={500}
                  />
                </label>
                <label>
                  {d.kind === 'PT' ? 'Data de emissão da PT *' : 'Previsão de início *'}
                  <input
                    type="date"
                    value={d.startsAt}
                    readOnly={d.kind === 'PT'}
                    min={d.kind === 'PT' && !saved ? ptToday() : undefined}
                    max={d.kind === 'PT' && !saved ? ptToday() : undefined}
                    onChange={(e) => update({ startsAt: e.target.value })}
                  />
                </label>
                <label>
                  Previsão de término *
                  <input
                    type="date"
                    min={d.startsAt}
                    readOnly={d.kind === 'PT'}
                    value={d.endsAt}
                    onChange={(e) => update({ endsAt: e.target.value })}
                  />
                </label>
                {d.kind === 'PT' ? (
                  <>
                    <label>
                      Horário previsto de término
                      <input
                        type="time"
                        value={d.data.answers['general.endsAt'] || ''}
                        onChange={(event) => answer('general.endsAt', event.target.value)}
                      />
                    </label>
                    <label className="span-2">
                      APR vinculada *
                      <select
                        value={d.aprId || ''}
                        onChange={(e) => {
                          const apr = ws.documents.find((a) => a.id === e.target.value);
                          setError('');
                          update({
                            aprId: e.target.value || null,
                            ...(apr
                              ? {
                                  contractorId: apr.contractor_id,
                                  location: apr.location,
                                  title: apr.title,
                                }
                              : {}),
                          });
                        }}
                      >
                        <option value="">Selecione a análise de riscos</option>
                        {d.aprId && !ws.documents.some((a) => a.id === d.aprId) && (
                          <option value={d.aprId}>
                            APR vinculada · versão {saved?.apr_version} · consultar pelo link abaixo
                          </option>
                        )}
                        {ws.documents
                          .filter(
                            (a) =>
                              a.kind === 'APR' && (a.status === 'aprovado' || a.id === d.aprId),
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              APR-{a.number} · versão{' '}
                              {saved?.apr_id === a.id ? saved.apr_version : a.version} ·{' '}
                              {saved?.apr_id === a.id ? 'Vínculo preservado' : a.title}
                              {saved?.apr_id !== a.id &&
                                ` · ${a.starts_at.slice(0, 10).split('-').reverse().join('/')} a ${a.ends_at.slice(0, 10).split('-').reverse().join('/')}`}
                            </option>
                          ))}
                      </select>
                      {aprError && (
                        <span className="alert error" role="alert">
                          {aprError}
                        </span>
                      )}
                    </label>
                  </>
                ) : (
                  <>
                    {[
                      { key: 'issuedAt', label: 'Data de elaboração/emissão', type: 'date' },
                      { key: 'revisionDate', label: 'Data da revisão', type: 'date' },
                    ].map((f) => (
                      <label key={f.key}>
                        {f.label}
                        <input
                          type={f.type || (f.key.includes('Phone') ? 'tel' : 'text')}
                          value={d.data.answers[f.key] || ''}
                          onChange={(e) => answer(f.key, e.target.value)}
                        />
                      </label>
                    ))}
                    {(['company', 'safety'] as const).map((prefix) => {
                      const candidates = ws.people.filter(
                        (p) =>
                          p.active &&
                          p.contractor_id === d.contractorId &&
                          p.role !== 'executante' &&
                          (prefix !== 'safety' || p.role === 'seguranca_trabalho'),
                      );
                      const selected = d.data.answers[`${prefix}UserId`] || '';
                      return (
                        <div className="form-grid span-2" key={prefix}>
                          <label>
                            {prefix === 'company'
                              ? 'Responsável da contratada'
                              : 'Responsável pela segurança da contratada'}{' '}
                            *
                            <select
                              value={selected}
                              onChange={(e) => {
                                const person = candidates.find((p) => p.id === e.target.value);
                                setD((prev) => ({
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    answers: {
                                      ...prev.data.answers,
                                      [`${prefix}UserId`]: person?.id || '',
                                      [`${prefix}Owner`]: person?.name || '',
                                      [`${prefix}Phone`]: person?.phone || '',
                                    },
                                  },
                                }));
                              }}
                            >
                              <option value="">Selecione em Pessoas e acessos</option>
                              {selected && !candidates.some((p) => p.id === selected) && (
                                <option value={selected}>
                                  {d.data.answers[`${prefix}Owner`] || 'Responsável vinculado'} ·
                                  confira o cadastro
                                </option>
                              )}
                              {candidates.map((p) => (
                                <option value={p.id} key={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Telefone do responsável da contratada
                            <input
                              type="tel"
                              value={d.data.answers[`${prefix}Phone`] || ''}
                              readOnly
                            />
                          </label>
                          {!selected && d.data.answers[`${prefix}Owner`] && (
                            <p className="muted span-2">
                              Registro anterior: {d.data.answers[`${prefix}Owner`]}. Vincule uma
                              pessoa cadastrada antes de enviar para aprovação.
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <p className="muted span-2">
                      Cadastre os responsáveis com acesso ativo à unidade e vínculo com esta
                      contratada. O responsável pela segurança deve ter perfil Segurança do
                      Trabalho. Os selecionados receberão os dois perfis de aprovação da contratada.
                    </p>
                  </>
                )}
              </fieldset>
              {d.kind === 'PT' && saved?.apr_id === d.aprId && (
                <p className="muted">
                  Esta PT usa a versão {saved.apr_version} da APR.{' '}
                  <a
                    className="text-button"
                    href={`/print/${saved.apr_id}?version=${saved.apr_version}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Consultar versão vinculada
                  </a>
                </p>
              )}
              {!ws.contractors.length && (
                <div className="alert neutral">
                  Cadastre uma terceirizada em Configurações antes de salvar.
                </div>
              )}
            </>
          )}
          {page === 'risks' && (
            <>
              <div className="section-intro">
                <h3>Analise uma etapa de cada vez.</h3>
                <p>Todo risco informado precisa ter uma medida de precaução e controle.</p>
              </div>
              <fieldset disabled={readOnly}>
                {d.data.risks.map((risk, index) => (
                  <section className="risk-card" key={index}>
                    <div className="risk-heading">
                      <h3>
                        <span>{String(index + 1).padStart(2, '0')}</span> Etapa da atividade
                      </h3>
                      <button
                        className="icon-button"
                        aria-label={'Remover etapa ' + (index + 1)}
                        onClick={() =>
                          setD((prev) => ({
                            ...prev,
                            data: {
                              ...prev.data,
                              risks: prev.data.risks.filter((_, i) => i !== index),
                            },
                          }))
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <div className="form-grid">
                      {[
                        { key: 'activity', label: 'Sequência de atividades' },
                        { key: 'tools', label: 'Técnicas, ferramentas e equipamentos' },
                        { key: 'risks', label: 'Descrição dos riscos' },
                        { key: 'controls', label: 'Medidas de precaução e controle' },
                      ].map((f) => (
                        <label key={f.key}>
                          {f.label}
                          <textarea
                            value={risk[f.key as 'activity']}
                            onChange={(e) =>
                              setD((prev) => ({
                                ...prev,
                                data: {
                                  ...prev.data,
                                  risks: prev.data.risks.map((r, i) =>
                                    i === index ? { ...r, [f.key]: e.target.value } : r,
                                  ),
                                },
                              }))
                            }
                          />
                        </label>
                      ))}
                      <label>
                        Possibilidade de SIF
                        <select
                          value={risk.sif}
                          onChange={(e) =>
                            setD((prev) => ({
                              ...prev,
                              data: {
                                ...prev.data,
                                risks: prev.data.risks.map((r, i) =>
                                  i === index
                                    ? { ...r, sif: e.target.value as typeof risk.sif }
                                    : r,
                                ),
                              },
                            }))
                          }
                        >
                          {['N/A', 'Precursor', 'Potencial', 'Real'].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={risk.needsPt}
                          onChange={(e) =>
                            setD((prev) => ({
                              ...prev,
                              data: {
                                ...prev.data,
                                risks: prev.data.risks.map((r, i) =>
                                  i === index ? { ...r, needsPt: e.target.checked } : r,
                                ),
                              },
                            }))
                          }
                        />{' '}
                        Necessita de PT
                      </label>
                    </div>
                  </section>
                ))}
                <button
                  className="secondary"
                  onClick={() =>
                    setD((prev) => ({
                      ...prev,
                      data: {
                        ...prev.data,
                        risks: [
                          ...prev.data.risks,
                          {
                            activity: '',
                            tools: '',
                            risks: '',
                            sif: 'N/A',
                            controls: '',
                            needsPt: false,
                          },
                        ],
                      },
                    }))
                  }
                >
                  <Plus size={17} />
                  Adicionar etapa
                </button>
              </fieldset>
            </>
          )}
          {page === 'checklists' && (
            <>
              <div className="section-intro">
                <h3>Preencha conforme o tipo de trabalho.</h3>
                <p>Os blocos específicos aparecem de acordo com a classificação.</p>
              </div>
              <div className="alert neutral">
                Gatilho de escavação e critérios de bloqueio ainda sujeitos à validação do
                contratante. Este rascunho não autoriza execução.
              </div>
              <fieldset disabled={readOnly}>
                <h3>Classificação da atividade</h3>
                <div className="checkbox-grid">
                  {permissionTypes.map((type) => (
                    <label key={type} className="check-option">
                      <input
                        type="checkbox"
                        checked={d.data.types.includes(type)}
                        onChange={() => toggle('types', type)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
                <h3>EPIs conforme avaliação</h3>
                <div className="checkbox-grid">
                  {ppeOptions.map((ppe) => (
                    <label key={ppe} className="check-option">
                      <input
                        type="checkbox"
                        checked={d.data.ppe.includes(ppe)}
                        onChange={() => toggle('ppe', ppe)}
                      />
                      {ppe}
                    </label>
                  ))}
                </div>
                {d.data.types.includes('Espaço confinado') && (
                  <div className="alert error">
                    PET obrigatória: formulário e anexo ainda dependem de definição com o
                    contratante.
                  </div>
                )}
                {visibleSections(d.data.types, d.data.answers).map((section) => (
                  <section className="checklist-section" key={section.id}>
                    <h3>{section.title}</h3>
                    {section.fields.map((f) => (
                      <label
                        key={f.key}
                        className={f.type === 'answer' ? 'checklist-row' : 'field-row'}
                      >
                        <span>{f.label}</span>
                        {f.type === 'answer' ? (
                          <select
                            aria-label={f.label}
                            value={d.data.answers[`${section.id}.${f.key}`] || ''}
                            onChange={(e) => answer(`${section.id}.${f.key}`, e.target.value)}
                          >
                            <option value="">Selecione</option>
                            {['Sim', 'Não', 'N/A'].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        ) : f.type === 'textarea' ? (
                          <textarea
                            value={d.data.answers[`${section.id}.${f.key}`] || ''}
                            onChange={(e) => answer(`${section.id}.${f.key}`, e.target.value)}
                          />
                        ) : (
                          <input
                            type={f.type === 'date' || f.type === 'time' ? f.type : 'text'}
                            value={
                              d.data.answers[`${section.id}.${f.key}`] ||
                              (section.id === 'general' && f.key === 'date' ? d.startsAt : '')
                            }
                            readOnly={section.id === 'general' && f.key === 'date'}
                            onChange={(e) => answer(`${section.id}.${f.key}`, e.target.value)}
                          />
                        )}
                      </label>
                    ))}
                  </section>
                ))}
              </fieldset>
            </>
          )}
          {page === 'executors' && (
            <>
              <div className="section-intro">
                <h3>Pessoas vinculadas ao trabalho</h3>
                <p>
                  Selecione usuários cadastrados nesta unidade. Assinaturas individuais serão
                  integradas ao fornecedor de assinatura selecionado.
                </p>
              </div>
              <fieldset disabled={readOnly}>
                {ws.people
                  .filter(
                    (person) =>
                      d.data.executors.some((e) => e.userId === person.id) ||
                      (person.active !== false &&
                        (!person.contractor_id || person.contractor_id === d.contractorId)),
                  )
                  .map((person) => {
                    const item = d.data.executors.find((e) => e.userId === person.id);
                    return (
                      <div key={person.id} className="executor-row">
                        <label className="checkbox-line">
                          <input
                            type="checkbox"
                            checked={!!item}
                            disabled={person.active === false && !item}
                            onChange={(e) =>
                              setD((prev) => ({
                                ...prev,
                                data: {
                                  ...prev.data,
                                  executors: e.target.checked
                                    ? [...prev.data.executors, { userId: person.id, role: '' }]
                                    : prev.data.executors.filter((x) => x.userId !== person.id),
                                },
                              }))
                            }
                          />
                          <span>
                            <strong>{person.name}</strong>
                            <small>{person.email}</small>
                            {person.active === false && (
                              <small>Acesso desativado nesta unidade</small>
                            )}
                          </span>
                        </label>
                        {item && (
                          <input
                            aria-label={'Função de ' + person.name}
                            placeholder="Função na atividade"
                            value={item.role}
                            onChange={(e) =>
                              setD((prev) => ({
                                ...prev,
                                data: {
                                  ...prev.data,
                                  executors: prev.data.executors.map((x) =>
                                    x.userId === person.id ? { ...x, role: e.target.value } : x,
                                  ),
                                },
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                {d.data.executors
                  .filter((executor) => !ws.people.some((person) => person.id === executor.userId))
                  .map((executor) => (
                    <div className="executor-row" key={executor.userId}>
                      <span>
                        Executante sem acesso atual<small>{executor.userId}</small>
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          setD((prev) => ({
                            ...prev,
                            data: {
                              ...prev.data,
                              executors: prev.data.executors.filter(
                                (e) => e.userId !== executor.userId,
                              ),
                            },
                          }))
                        }
                      >
                        Remover do rascunho
                      </button>
                    </div>
                  ))}
              </fieldset>
            </>
          )}
          {page === 'approvals' && (
            <>
              <div className="section-intro">
                <h3>Decisões com autoria e versão.</h3>
                <p>Aprovação interna e assinatura eletrônica são registros separados.</p>
              </div>
              <div className="alert neutral">
                Fluxo piloto: aprovações em paralelo. A sequência definitiva depende do contratante.
                A integração com o fornecedor de assinatura ainda não está ativa.
              </div>
              {(d.kind === 'APR'
                ? aprProfiles
                : ['Emitente do turno', 'Responsável pela área', 'Responsável pela atividade']
              ).map((profile) => {
                const decision = ws.approvals.find(
                  (a) => a.document_id === d.id && a.profile === profile,
                );
                const assignment = ws.approvers.find(
                  (a) =>
                    a.kind === d.kind &&
                    a.profile === profile &&
                    a.active &&
                    a.eligible &&
                    (!a.approver_contractor_id || a.approver_contractor_id === d.contractorId),
                );
                const selectedPrefix =
                  d.kind === 'APR' && profile === aprProfiles[0]
                    ? 'company'
                    : d.kind === 'APR' && profile === aprProfiles[1]
                      ? 'safety'
                      : null;
                return (
                  <div className="approval-profile" key={profile}>
                    <CheckCircle2 size={21} />
                    <div>
                      <strong>{profile}</strong>
                      <small>
                        {decision?.user_name ||
                          (selectedPrefix
                            ? d.data.answers[`${selectedPrefix}Owner`] ||
                              'Selecione o responsável na identificação'
                            : '') ||
                          assignment?.user_name ||
                          'Aprovador não configurado'}
                      </small>
                    </div>
                    <span className={'badge ' + (decision?.decision || '')}>
                      {decision?.decision ? statuses[decision.decision] : 'Pendente'}
                    </span>
                    {decision?.comment && <p>{decision.comment}</p>}
                    {decision &&
                      !decision.decision &&
                      saved?.status === 'em_aprovacao' &&
                      ws.unit.role === 'admin' &&
                      online && (
                        <ReassignApproval
                          key={`${decision.id}:${decision.assignment_version}`}
                          approval={decision}
                          unitId={ws.unit.id}
                          people={ws.people}
                          contractorId={d.contractorId}
                          onChanged={onReassigned}
                        />
                      )}
                  </div>
                );
              })}
            </>
          )}
          {page === 'history' &&
            (saved ? (
              <DocumentHistory id={d.id} online={online} />
            ) : (
              <p className="muted">Salve o documento para iniciar seu histórico.</p>
            ))}
          {page === 'photos' && (
            <>
              <div className="section-intro">
                <h3>Evidências de conclusão</h3>
                <p>Registre uma foto com legenda, localização e data/hora do dispositivo.</p>
              </div>
              {!saved ? (
                <div className="alert neutral">
                  Sincronize o rascunho da PT antes de adicionar evidências.
                </div>
              ) : (
                <button className="primary" onClick={() => setCamera(true)}>
                  <Camera size={18} />
                  Capturar evidência
                </button>
              )}
              <div className="photo-grid">
                {photos.map((p) => (
                  <figure key={p.id}>
                    <img src={`/api/photos/${p.id}`} alt={p.caption} />
                    <figcaption>
                      <strong>{p.caption}</strong>
                      <small>{new Date(p.captured_at).toLocaleString('pt-BR')}</small>
                      <small>
                        {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} · ±
                        {Math.round(p.accuracy)} m
                      </small>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>
        <footer className="editor-footer">
          <div>
            <small>
              {readOnly
                ? 'Documento em consulta'
                : online
                  ? 'Salvamento com sincronização'
                  : 'Salvamento local · modo offline'}
            </small>
            {saved && (
              <a
                className="text-button"
                href={`/print/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Printer size={16} />
                Imprimir rascunho/modelo
              </a>
            )}
          </div>
          <div className="actions">
            <button className="secondary" onClick={onClose}>
              Fechar
            </button>
            {saved?.kind === 'PT' && (
              <PtLifecycleControls
                document={saved}
                unit={ws.unit}
                online={online}
                unsaved={busy || JSON.stringify(d) !== JSON.stringify(value)}
                onDone={onPtChanged}
              />
            )}
            {saved?.kind === 'APR' &&
              saved.status === 'aprovado' &&
              online &&
              ws.unit.role !== 'aprovador' &&
              (saved.created_by === ws.user.id ||
                ['admin', 'gestor', 'seguranca_trabalho'].includes(ws.unit.role)) && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    const reason = window.prompt('Informe o motivo da nova revisão da APR:');
                    if (!reason?.trim()) return;
                    setBusy(true);
                    setError('');
                    try {
                      await onRevise(reason.trim());
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Criar revisão
                </button>
              )}
            {saved?.status === 'rascunho' && online && (
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  if (JSON.stringify(d) !== JSON.stringify(value)) {
                    setError('Salve as alterações antes de enviar.');
                    return;
                  }
                  setBusy(true);
                  try {
                    await onSubmit();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Send size={16} />
                Enviar para análise
              </button>
            )}
            {!readOnly && (
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setError('');
                  if (aprError) {
                    setError(aprError);
                    return;
                  }
                  if (d.kind === 'PT' && !saved) {
                    const dateError = ptCreationError(d.startsAt);
                    if (dateError) {
                      setError(dateError);
                      return;
                    }
                  }
                  const result = documentSchema.safeParse(d);
                  if (!result.success) {
                    setError(
                      result.error.issues
                        .map((i) => `${i.path.join('.')}: ${i.message}`)
                        .join(' · '),
                    );
                    return;
                  }
                  setBusy(true);
                  try {
                    await onSave(result.data);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Save size={17} />
                {busy ? 'Salvando…' : 'Salvar rascunho'}
              </button>
            )}
          </div>
        </footer>
      </section>
      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onCapture={async (photo) => {
            await enqueue(ws.user.id, {
              id: photo.id,
              path: `/api/documents/${d.id}/photos`,
              body: photo,
            });
            await onPhotoQueued();
            setCamera(false);
            setError('');
          }}
        />
      )}
    </div>
  );
}
function CameraCapture({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (photo: { id: string; [key: string]: unknown }) => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState(''),
    [caption, setCaption] = useState(''),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      })
      .then((s) => {
        if (disposed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        setReady(true);
      })
      .catch(() => setError('Não foi possível acessar a câmera. Use HTTPS e permita o acesso.'));
    if (!navigator.mediaDevices) setError('Câmera indisponível. Acesse por HTTPS.');
    return () => {
      disposed = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function capture() {
    if (!video.current || !caption.trim()) return;
    setBusy(true);
    setError('');
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }),
      );
      const v = video.current;
      if (!v.videoWidth) throw new Error('Aguarde a câmera iniciar.');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / v.videoWidth);
      canvas.width = v.videoWidth * scale;
      canvas.height = v.videoHeight * scale;
      canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
      const capturedAt = new Date().toISOString();
      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      await onCapture({
        id: crypto.randomUUID(),
        caption: caption.trim(),
        capturedAt,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        mime: 'image/jpeg',
        base64,
      });
    } catch (e) {
      setError((e as Error).message || 'Permita a localização para registrar a evidência.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop camera-backdrop">
      <section
        className="camera-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Captura de evidência"
      >
        <header>
          <h2>
            <Camera size={20} />
            Evidência de conclusão
          </h2>
          <button className="icon-button" aria-label="Fechar câmera" onClick={onClose}>
            <X />
          </button>
        </header>
        <video ref={video} autoPlay playsInline muted />
        <label>
          Legenda obrigatória
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={1000}
            placeholder="O que esta foto comprova?"
          />
        </label>
        <p>
          <MapPin size={15} /> Localização será solicitada ao capturar.
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button
          className="primary"
          disabled={busy || !ready || !caption.trim()}
          onClick={() => void capture()}
        >
          {busy ? 'Obtendo localização e salvando…' : 'Capturar e salvar evidência'}
        </button>
      </section>
    </div>
  );
}
