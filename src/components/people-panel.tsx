'use client';
import { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { Person, WorkspaceData } from '@/lib/types';
import { api } from './workspace';

export default function PeoplePanel({
  ws,
  online,
  reload,
}: {
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<Person | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const canManage = ws.unit.role === 'admin';
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Pessoas e acessos da unidade</h2>
          <p>Contato, perfil e vínculo com a terceirizada são específicos desta unidade.</p>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      {selected && canManage && (
        <form
          className="admin-form"
          key={`${selected.id}:${selected.membership_version}`}
          onSubmit={async (e) => {
            e.preventDefault();
            const fields = new FormData(e.currentTarget);
            setError('');
            setNotice('');
            setBusy(true);
            try {
              await api('/api/admin', {
                action: 'updateMembership',
                unitId: ws.unit.id,
                userId: selected.id,
                version: selected.membership_version,
                phone: fields.get('phone') || '',
                role: fields.get('role'),
                contractorId: fields.get('contractorId') || null,
                active: fields.get('active') === 'on',
              });
              setSelected(null);
              await reload();
              setNotice(
                'Acesso atualizado nesta unidade. As demais unidades mantêm suas configurações.',
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{selected.name}</h3>
          <p className="muted">
            {selected.email} · A conta e os registros históricos serão preservados.
          </p>
          <fieldset disabled={!online || busy} className="form-grid">
            <label>
              Telefone para esta unidade
              <input
                name="phone"
                type="tel"
                defaultValue={selected.phone}
                maxLength={25}
                placeholder="+55 11 99999-9999"
              />
              <small>Deixe vazio para não receber avisos por WhatsApp nesta unidade.</small>
            </label>
            <label>
              Perfil
              <select name="role" defaultValue={selected.role}>
                <option value="executante">Executante</option>
                <option value="aprovador">Aprovador</option>
                <option value="gestor">Gestor</option>
                <option value="admin">Administrador da unidade</option>
              </select>
            </label>
            <label>
              Vínculo nesta unidade
              <select name="contractorId" defaultValue={selected.contractor_id || ''}>
                <option value="">Equipe própria da contratante</option>
                {ws.contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-line">
              <input type="checkbox" name="active" defaultChecked={selected.active} />
              Acesso ativo nesta unidade
            </label>
          </fieldset>
          <p className="muted">
            Usuários vinculados a uma terceirizada só acessam documentos dela. Alterações de acesso
            exigem conexão e não apagam dados já baixados em dispositivos offline.
          </p>
          <div className="actions">
            <button type="submit" className="primary" disabled={!online || busy}>
              <Save size={16} />
              {busy ? 'Salvando…' : 'Salvar acesso'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              <X size={16} />
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome / e-mail</th>
              <th>Telefone</th>
              <th>Vínculo</th>
              <th>Perfil</th>
              <th>Situação</th>
              {canManage && <th>Ação</th>}
            </tr>
          </thead>
          <tbody>
            {ws.people.map((person) => (
              <tr key={person.id}>
                <td>
                  <strong>{person.name}</strong>
                  <small>{person.email}</small>
                </td>
                <td>{person.phone || 'Não informado'}</td>
                <td>
                  {person.contractor_id
                    ? ws.contractors.find((c) => c.id === person.contractor_id)?.name ||
                      'Terceirizada'
                    : 'Equipe própria'}
                </td>
                <td>
                  <span className="badge">{person.role}</span>
                </td>
                <td>
                  <span className={'badge ' + (person.active ? 'aprovado' : 'rejeitado')}>
                    {person.active ? 'Ativo' : 'Desativado'}
                  </span>
                </td>
                {canManage && (
                  <td>
                    <button
                      className="secondary"
                      disabled={!online || busy}
                      onClick={() => {
                        setSelected(person);
                        setError('');
                        setNotice('');
                      }}
                    >
                      Editar acesso
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
