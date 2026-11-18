'use client';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import AdminPanel from './admin-panel';
import PeoplePanel from './people-panel';
import ApproverSettings from './approver-settings';
import Popup from './popup';
import ContractorEditor from './contractor-editor';

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
  reload: () => Promise<unknown>;
}) {
  const [creating, setCreating] = useState(false),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState(''),
    [contractor, setContractor] = useState<WorkspaceData['contractors'][number] | null>(null);
  const section = sections[type];
  const canManage = ws.unit.role === 'admin' && (type !== 'companies' || ws.user.platform_admin);
  const rows =
    type === 'companies'
      ? (ws.companies || []).map((c) => ({ id: c.id, name: c.name, detail: 'Empresa cadastrada' }))
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
                detail: `CNPJ ${c.cnpj} · Autorizada nesta unidade`,
              }))
            : [];
  const filtered = rows.filter((row) =>
    `${row.name} ${row.detail}`
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
          </div>
          {canManage && (
            <button className="primary" disabled={!online} onClick={() => setCreating(true)}>
              <Plus size={17} /> Novo cadastro
            </button>
          )}
        </div>
      </section>
      {creating && canManage && (
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
                    {type === 'contractors' && canManage && <th>Ação</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      <td>{row.detail}</td>
                      {type === 'contractors' && canManage && (
                        <td>
                          <button
                            className="secondary"
                            disabled={!online}
                            onClick={() =>
                              setContractor(ws.contractors.find((c) => c.id === row.id)!)
                            }
                          >
                            Ver / editar cadastro
                          </button>
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
