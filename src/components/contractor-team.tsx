'use client';
import { useEffect, useState } from 'react';
import type { WorkspaceData } from '@/lib/types';
import Popup from './popup';
import { api } from './workspace';

type Person = {
  id: string;
  name: string;
  email: string;
  phone: string;
  contractor_name: string;
  submission_id: string | null;
  document_type: string;
  status: string | null;
  reason: string | null;
  version: number;
  files: { id: string; mime: string; retain_until: string }[];
};
type Team = { people: Person[]; reviewer: boolean; nextCursor: string | null };
const statuses: Record<string, string> = {
  pending: 'Aguardando validação',
  approved: 'Validado',
  rejected: 'Devolvido para correção',
};
function fileData(file: File): Promise<{ mime: string; base64: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Cada arquivo deve ter no máximo 5 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => resolve({ mime: file.type, base64: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  });
}
export default function ContractorTeam({ ws, online }: { ws: WorkspaceData; online: boolean }) {
  const [data, setData] = useState<Team | null>(null),
    [selected, setSelected] = useState<Person | 'new' | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [cursors, setCursors] = useState<string[]>([]),
    [notice, setNotice] = useState('');
  const before = cursors.at(-1);
  useEffect(() => {
    let active = true;
    setData(null);
    setSelected(null);
    setError('');
    if (online)
      api(`/api/contractor-team?unit=${ws.unit.id}${before ? '&before=' + before : ''}`)
        .then((result) => {
          if (active) setData(result);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [ws.unit.id, online, before, reload]);
  const reviewer = ['admin', 'gestor'].includes(ws.unit.role) && !ws.unit.contractor_id;
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>{reviewer ? 'Validação de executores' : 'Executores da contratada'}</h2>
          <p>
            {reviewer
              ? 'Confira o documento e o cadastro antes de validar a pessoa para a unidade.'
              : 'Cadastre seus executores e envie RG, CNH ou passaporte para conferência da unidade.'}
          </p>
        </div>
        <div className="actions">
          <button
            className="secondary"
            disabled={!online || busy}
            onClick={() => setReload((n) => n + 1)}
          >
            Atualizar
          </button>
          {!reviewer && (
            <button
              className="primary"
              disabled={!online || busy}
              onClick={() => {
                setSelected('new');
                setError('');
              }}
            >
              Novo executor
            </button>
          )}
        </div>
      </div>
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      {error && !selected && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!online ? (
        <p className="settings-empty">Envio e consulta de documentos pessoais exigem internet.</p>
      ) : !data ? (
        <p className="settings-empty">Carregando executores…</p>
      ) : (
        <>
          {!data.people.length ? (
            <p className="settings-empty">Nenhum executor nesta página.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Executor</th>
                    <th>Contratada</th>
                    <th>Documento</th>
                    <th>Situação</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <strong>{person.name}</strong>
                        <small>{person.email}</small>
                        <small>{person.phone}</small>
                      </td>
                      <td>{person.contractor_name}</td>
                      <td>{person.document_type || 'Não enviado'}</td>
                      <td>
                        {statuses[person.status || ''] || 'Documento não enviado'}
                        {person.reason && <small>{person.reason}</small>}
                      </td>
                      <td>
                        <button
                          className="secondary"
                          onClick={() => {
                            setSelected(person);
                            setError('');
                          }}
                        >
                          {reviewer ? 'Conferir cadastro' : 'Consultar / reenviar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="actions" style={{ padding: 24 }}>
            <button
              className="secondary"
              disabled={!cursors.length}
              onClick={() => setCursors((c) => c.slice(0, -1))}
            >
              Anterior
            </button>
            <span>Página {cursors.length + 1}</span>
            <button
              className="secondary"
              disabled={!data.nextCursor}
              onClick={() => setCursors((c) => [...c, data.nextCursor!])}
            >
              Próxima
            </button>
          </div>
        </>
      )}
      {selected && online && (
        <Popup
          title={
            selected === 'new'
              ? 'Novo executor'
              : reviewer
                ? 'Conferir documento do executor'
                : 'Documentos do executor'
          }
          busy={busy}
          onClose={() => {
            setSelected(null);
            setError('');
          }}
        >
          <form
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              try {
                if (reviewer && selected !== 'new')
                  await api('/api/contractor-team', {
                    action: 'review',
                    unitId: ws.unit.id,
                    id: selected.submission_id,
                    version: selected.version,
                    decision: fd.get('decision'),
                    reason: fd.get('reason'),
                    confirmed: fd.get('confirmed') === 'on',
                  });
                else {
                  const files = fd
                    .getAll('files')
                    .filter((f): f is File => f instanceof File && f.size > 0);
                  if (files.length < 1 || files.length > 2)
                    throw new Error('Envie um PDF ou até duas imagens (frente e verso).');
                  await api('/api/contractor-team', {
                    action: selected === 'new' ? 'register' : 'resubmit',
                    unitId: ws.unit.id,
                    ...(selected === 'new'
                      ? { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone') }
                      : { userId: selected.id }),
                    documentType: fd.get('documentType'),
                    files: await Promise.all(files.map(fileData)),
                  });
                }
                setSelected(null);
                setReload((n) => n + 1);
                setNotice(
                  reviewer
                    ? 'Conferência registrada.'
                    : 'Documento enviado. Aguarde a validação da unidade.',
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            {selected !== 'new' && (
              <>
                <h3>{selected.name}</h3>
                <p>
                  {selected.email} · {selected.phone}
                </p>
                <p>{statuses[selected.status || ''] || 'Documento ainda não enviado'}</p>
                {selected.files.map((file, i) => (
                  <p key={file.id}>
                    <a className="secondary" href={`/api/executor-files/${file.id}`} download>
                      Baixar documento {i + 1}
                    </a>
                    <small>
                      {' '}
                      Guarda até {new Date(file.retain_until).toLocaleDateString('pt-BR')}
                    </small>
                  </p>
                ))}
              </>
            )}
            <fieldset className="form-grid" disabled={busy}>
              {!reviewer ? (
                <>
                  {selected === 'new' && (
                    <>
                      <label>
                        Nome completo *<input name="name" required minLength={2} maxLength={200} />
                      </label>
                      <label>
                        E-mail *<input name="email" type="email" required maxLength={254} />
                      </label>
                      <label>
                        Telefone com DDI e DDD *
                        <input name="phone" type="tel" required maxLength={25} />
                      </label>
                    </>
                  )}
                  <label>
                    Documento *
                    <select
                      name="documentType"
                      defaultValue={selected === 'new' ? 'RG' : selected.document_type}
                    >
                      {['RG', 'CNH', 'Passaporte'].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="span-2">
                    Arquivo do documento *
                    <input
                      name="files"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple
                      required
                    />
                    <small>
                      Um PDF ou até duas imagens de frente e verso. Limite de 5 MB por arquivo.
                      Guarda por cinco anos.
                    </small>
                  </label>
                  <p className="muted span-2">
                    O envio não confirma a identidade automaticamente. Novo envio suspende a
                    validação anterior até nova conferência da unidade.
                  </p>
                  <button className="primary">Enviar para validação</button>
                </>
              ) : selected !== 'new' && selected.status === 'pending' ? (
                <>
                  <label>
                    Resultado *
                    <select name="decision">
                      <option value="approved">Validar documento e identidade</option>
                      <option value="rejected">Devolver para correção</option>
                    </select>
                  </label>
                  <label className="span-2">
                    Registro da conferência ou motivo da devolução *
                    <textarea name="reason" required minLength={5} maxLength={1000} />
                    <small>Não copie números de documentos para este campo.</small>
                  </label>
                  <label className="checkbox-line span-2">
                    <input name="confirmed" type="checkbox" required />
                    Conferi o documento, os dados e o vínculo da pessoa com a contratada.
                  </label>
                  <button className="primary">Registrar conferência</button>
                </>
              ) : (
                <p>Somente o envio atual pendente pode ser analisado.</p>
              )}
            </fieldset>
          </form>
        </Popup>
      )}
    </section>
  );
}
