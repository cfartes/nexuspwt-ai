'use client';
import { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { Person, WorkspaceData } from '@/lib/types';
import { api } from './workspace';
import Popup from './popup';
import AdminPanel from './admin-panel';
import DeleteRegistration from './delete-registration';

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
  const deliveryLabels: Record<string, string> = {
    pending: 'Na fila',
    blocked: 'Bloqueado',
    sending: 'Enviando',
    sent: 'Aceito pelo provedor',
    uncertain: 'Resultado incerto',
    cancelled: 'Cancelado',
  };
  const [linkEmail, setLinkEmail] = useState('');
  const available = (ws.companyPeople || []).filter(
    (p) => !ws.people.some((member) => member.id === p.id),
  );
  return (
    <section className="card">
      {linkEmail && (
        <Popup title="Vincular usuário à unidade" onClose={() => setLinkEmail('')}>
          <AdminPanel
            ws={ws}
            online={online}
            reload={reload}
            action="user"
            initialMode="membership"
            initialEmail={linkEmail}
            onSaved={() => {
              setLinkEmail('');
              setNotice('Usuário vinculado à unidade.');
            }}
          />
        </Popup>
      )}
      <div className="card-heading">
        <div>
          <h2>Pessoas e acessos da unidade</h2>
          <p>Contato, perfil e vínculo com a terceirizada são específicos desta unidade.</p>
        </div>
      </div>
      {canManage && available.length > 0 && (
        <div className="admin-form">
          <h3>Usuários da empresa sem acesso nesta unidade</h3>
          <p className="muted">
            As contas já existem. Use Vincular para definir o acesso à unidade atual.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome / e-mail</th>
                  <th>Unidades cadastradas</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {available.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <strong>{person.name}</strong>
                      <small>{person.email}</small>
                    </td>
                    <td>{person.units.join(', ')}</td>
                    <td>
                      <button
                        className="secondary"
                        disabled={!online}
                        onClick={() => {
                          setLinkEmail(person.email);
                          setError('');
                          setNotice('');
                        }}
                      >
                        Vincular à unidade
                      </button>
                      {ws.user.platform_admin && person.id !== ws.user.id && (
                        <DeleteRegistration
                          unitId={ws.unit.id}
                          kind="account"
                          id={person.id}
                          name={person.name}
                          online={online}
                          onDeleted={async () => {
                            await reload();
                            setNotice('Usuário excluído da plataforma e da lista de vinculação.');
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && !selected && (
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
        <Popup
          title="Editar cadastro"
          onClose={() => {
            setSelected(null);
            setError('');
          }}
          busy={busy}
        >
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
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
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
              Usuários vinculados a uma terceirizada só acessam documentos dela. Alterações de
              acesso exigem conexão e não apagam dados já baixados em dispositivos offline.
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
                onClick={() => {
                  setSelected(null);
                  setError('');
                }}
              >
                <X size={16} />
                Cancelar
              </button>
            </div>
          </form>
        </Popup>
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
              {canManage && <th>Convite de acesso</th>}
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
                  {person.password_pending && <small>Aguardando definição de senha</small>}
                </td>
                {canManage && (
                  <td>
                    {person.password_pending ? (
                      <>
                        <div>
                          {['email', 'whatsapp'].map((channel) => {
                            const delivery = person.invitation_status?.[channel];
                            return (
                              <small key={channel}>
                                {channel === 'email' ? 'E-mail' : 'WhatsApp'}:{' '}
                                {delivery
                                  ? deliveryLabels[delivery.status] || delivery.status
                                  : 'Sem convite'}
                                {delivery?.error && ` · ${delivery.error}`}
                              </small>
                            );
                          })}
                        </div>
                        <button
                          className="secondary"
                          disabled={!online || busy || !person.active}
                          onClick={async () => {
                            setBusy(true);
                            setError('');
                            setNotice('');
                            try {
                              await api('/api/invitations', {
                                unitId: ws.unit.id,
                                userId: person.id,
                              });
                              await reload();
                              setNotice(
                                'Novo convite enfileirado por e-mail e WhatsApp. O link anterior foi invalidado.',
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Reenviar convite
                        </button>
                      </>
                    ) : (
                      'Senha definida'
                    )}
                  </td>
                )}
                {canManage && (
                  <td>
                    <div className="actions">
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
                      <DeleteRegistration
                        unitId={ws.unit.id}
                        kind="user"
                        id={person.id}
                        version={person.membership_version}
                        name={person.name}
                        online={online}
                        onDeleted={async () => {
                          await reload();
                          setNotice('Acesso excluído desta unidade.');
                        }}
                      />
                      {ws.user.platform_admin && person.id !== ws.user.id && (
                        <DeleteRegistration
                          unitId={ws.unit.id}
                          kind="account"
                          id={person.id}
                          name={person.name}
                          online={online}
                          onDeleted={async () => {
                            await reload();
                            setNotice('Usuário excluído da plataforma em todas as unidades.');
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
    </section>
  );
}
