'use client';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import AdminPanel from './admin-panel';
import PeoplePanel from './people-panel';
import ApproverSettings from './approver-settings';
import Popup from './popup';
import ContractorEditor from './contractor-editor';
import DeleteRegistration from './delete-registration';
import CompanyEditor from './company-editor';
import { mask } from '@/lib/input-masks';
import { companyManager } from '@/lib/permissions';
import { api } from './workspace';

export type RegistrationTab =
  'companies' | 'regions' | 'units' | 'contractors' | 'people' | 'approvers';
const sections = {
  companies: {
    title: 'Empresas',
    action: 'company',
    description: 'Empresas cadastradas na plataforma.',
  },
  regions: { title: 'Regionais', action: 'region', description: 'Regionais da empresa ativa.' },
  units: {
    title: 'Unidades',
    action: 'unit',
    description: 'Unidades da empresa ativa e suas regionais.',
  },
  contractors: {
    title: 'Terceirizadas',
    action: 'contractor',
    description: 'Terceirizadas autorizadas a atender a unidade ativa.',
  },
  people: {
    title: 'Pessoas e acessos',
    action: 'user',
    description: 'Usuários e vínculos na unidade ativa.',
  },
  approvers: {
    title: 'Aprovadores',
    action: 'approver',
    description: 'Perfis locais e regionais aplicáveis à unidade ativa.',
  },
} as const;

export default function RegistrationPanel({
  type,
  ws,
  online,
  reload,
}: {
  type: RegistrationTab;
  ws: WorkspaceData;
  online: boolean;
  reload: (unitId?: string) => Promise<unknown>;
}) {
  const [creating, setCreating] = useState(false),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState(''),
    [company, setCompany] = useState<WorkspaceData['companies'][number] | null>(null),
    [contractor, setContractor] = useState<WorkspaceData['contractors'][number] | null>(null);
  const section = sections[type];
  const companyAccess = companyManager(ws.user, ws.unit);
  const canManage =
    ws.unit.role === 'admin' &&
    (!['companies', 'regions', 'units'].includes(type) || companyAccess);
  const canCreate =
    canManage &&
    (type !== 'companies' || ws.user.platform_admin) &&
    (type !== 'contractors' || companyAccess);
  const canView = canManage || type === 'companies' || type === 'contractors';
  const [linking, setLinking] = useState(false),
    [linkBusy, setLinkBusy] = useState(false),
    [linkError, setLinkError] = useState('');
  const limitReached =
    type === 'units' && !!ws.unitQuota && ws.unitQuota.used >= ws.unitQuota.limit;
  const rows =
    type === 'companies'
      ? (ws.companies || []).map((c) => ({
          id: c.id,
          name: c.name,
          detail: [
            c.cnpj ? `CNPJ ${mask(c.cnpj, 'cnpj')}` : 'Cadastro fiscal pendente',
            c.details.contactName,
            c.details.email,
            c.details.phone,
            [c.details.city, c.details.state].filter(Boolean).join('/'),
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      : type === 'regions'
        ? ws.regions.map((r) => ({ id: r.id, name: r.name, detail: ws.unit.company_name }))
        : type === 'units'
          ? (ws.registeredUnits || []).map((u) => ({
              id: u.id,
              name: u.name,
              detail: `${u.kind} · ${ws.regions.find((r) => r.id === u.region_id)?.name || 'Sem regional'}`,
            }))
          : type === 'contractors'
            ? ws.contractors.map((c) => ({
                id: c.id,
                name: c.name,
                detail: `CNPJ ${mask(c.cnpj, 'cnpj')} · Autorizada nesta unidade`,
              }))
            : [];
  const filtered = rows.filter((row) =>
    `${row.name} ${row.detail} ${row.detail.replace(/\D/g, '')}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR')),
  );
  return (
    <>
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
            {type === 'units' && ws.unitQuota && (
              <p>
                {ws.unitQuota.used} de {ws.unitQuota.limit} unidades contratadas cadastradas.
                {limitReached ? ' Limite atingido; solicite ampliação ao superadmin.' : ''}
              </p>
            )}
          </div>
          {canCreate && (
            <button
              className="primary"
              disabled={!online || limitReached}
              onClick={() => setCreating(true)}
            >
              <Plus size={17} /> Novo cadastro
            </button>
          )}
        </div>
      </section>
      {type === 'contractors' && ws.unit.role === 'admin' && (
        <section className="card">
          <div className="admin-form">
            <button
              className="secondary"
              disabled={!online}
              onClick={() => {
                setLinking(true);
                setLinkError('');
              }}
            >
              Autorizar contratada existente nesta unidade
            </button>
          </div>
        </section>
      )}
      {linking && (
        <Popup
          title="Autorizar contratada nesta unidade"
          busy={linkBusy}
          onClose={() => setLinking(false)}
        >
          <form
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              setLinkBusy(true);
              setLinkError('');
              try {
                await api('/api/admin', {
                  action: 'linkContractor',
                  unitId: ws.unit.id,
                  contractorId: fields.get('contractorId'),
                });
                await reload();
                setLinking(false);
              } catch (error) {
                setLinkError((error as Error).message);
              } finally {
                setLinkBusy(false);
              }
            }}
          >
            {linkError && (
              <p role="alert" className="alert error">
                {linkError}
              </p>
            )}
            <label>
              Contratada
              <select name="contractorId" required disabled={linkBusy}>
                <option value="">Selecione</option>
                {ws.availableContractors
                  ?.filter((c) => !ws.contractors.some((linked) => linked.id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {mask(c.cnpj, 'cnpj')}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary" disabled={linkBusy}>
              Autorizar vínculo
            </button>
          </form>
        </Popup>
      )}
      {creating && canCreate && (
        <Popup title={`Novo cadastro · ${section.title}`} onClose={() => setCreating(false)}>
          <AdminPanel
            key={`${ws.unit.id}:${section.action}`}
            action={section.action}
            ws={ws}
            online={online}
            reload={reload}
            onSaved={() => {
              setCreating(false);
              setNotice('Cadastro salvo. A listagem foi atualizada.');
            }}
          />
        </Popup>
      )}
      {contractor && (
        <ContractorEditor
          ws={ws}
          contractor={contractor}
          online={online}
          reload={reload}
          onClose={() => setContractor(null)}
          readOnly={!companyAccess}
        />
      )}
      {company && (
        <CompanyEditor
          ws={ws}
          company={company}
          online={online}
          reload={reload}
          onClose={() => setCompany(null)}
          readOnly={!companyAccess}
        />
      )}
      {type !== 'people' && type !== 'approvers' && (
        <section className="card">
          <div className="admin-form">
            <label>
              <Search size={16} /> Buscar em {section.title.toLocaleLowerCase('pt-BR')}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou dados do cadastro"
              />
            </label>
            <p className="muted" role="status">
              {filtered.length} de {rows.length} registros
            </p>
          </div>
          {filtered.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>
                      {type === 'units'
                        ? 'Tipo e regional'
                        : type === 'contractors'
                          ? 'CNPJ e vínculo'
                          : 'Vínculo'}
                    </th>
                    {canView && <th>Ação</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      <td>{row.detail}</td>
                      {canView && (
                        <td>
                          <div className="actions">
                            {type === 'companies' && (
                              <button
                                className="secondary"
                                disabled={!online}
                                onClick={() =>
                                  setCompany(ws.companies.find((c) => c.id === row.id)!)
                                }
                              >
                                Ver / editar cadastro
                              </button>
                            )}
                            {type === 'contractors' && (
                              <button
                                className="secondary"
                                disabled={!online}
                                onClick={() =>
                                  setContractor(ws.contractors.find((c) => c.id === row.id)!)
                                }
                              >
                                Ver / editar cadastro
                              </button>
                            )}
                            {canManage && (type !== 'companies' || ws.user.platform_admin) && (
                              <DeleteRegistration
                                unitId={ws.unit.id}
                                kind={section.action}
                                id={row.id}
                                name={row.name}
                                online={online}
                                version={
                                  type === 'companies'
                                    ? ws.companies.find((c) => c.id === row.id)?.version
                                    : type === 'contractors'
                                      ? ws.contractors.find((c) => c.id === row.id)?.version
                                      : undefined
                                }
                                onDeleted={async () => {
                                  await reload(
                                    type === 'units' && row.id === ws.unit.id
                                      ? ws.units.find((u) => u.id !== row.id)?.id
                                      : undefined,
                                  );
                                  setNotice('Cadastro excluído deste contexto.');
                                }}
                              />
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="settings-empty">
              {search
                ? 'Nenhum cadastro encontrado para esta busca.'
                : 'Nenhum cadastro disponível neste contexto.'}
            </div>
          )}
        </section>
      )}
      {type === 'people' && <PeoplePanel ws={ws} online={online} reload={reload} />}
      {type === 'approvers' && <ApproverSettings ws={ws} online={online} reload={reload} />}
    </>
  );
}
