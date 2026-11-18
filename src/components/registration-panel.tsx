'use client';
import { useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import AdminPanel from './admin-panel';
import PeoplePanel from './people-panel';
import ApproverSettings from './approver-settings';

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
  onError,
}: {
  type: RegistrationTab;
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false),
    [search, setSearch] = useState('');
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
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </div>
          {canManage && (
            <button className="primary" disabled={!online} onClick={() => setCreating(!creating)}>
              {creating ? <X size={17} /> : <Plus size={17} />}{' '}
              {creating ? 'Fechar cadastro' : 'Novo cadastro'}
            </button>
          )}
        </div>
      </section>
      {creating && canManage && (
        <AdminPanel
          key={`${ws.unit.id}:${section.action}`}
          action={section.action}
          ws={ws}
          online={online}
          reload={reload}
          onError={onError}
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
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      <td>{row.detail}</td>
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
