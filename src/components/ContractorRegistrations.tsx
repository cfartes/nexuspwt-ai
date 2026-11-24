'use client';
import { useEffect, useState } from 'react';
import type { WorkspaceData } from '@/lib/types';
import type { ContractorRegistrationData } from '@/lib/contractorRegistration';
import { contractorRoleLabels } from '@/lib/contractorRoles';
import { mask } from '@/lib/input-masks';
import { api } from './workspace';
import Popup from './popup';

type Registration = {
  id: string;
  email: string;
  status: string;
  version: number;
  reason: string | null;
  deliveryStatus: string;
  deliveryError: string | null;
  hasCard: boolean;
  data: ContractorRegistrationData | null;
};
const statuses: Record<string, string> = {
  invited: 'Aguardando preenchimento',
  submitted: 'Aguardando conferência',
  changes_requested: 'Correção solicitada',
  approved: 'Aprovado e vinculado',
};
const deliveryStatuses: Record<string, string> = {
  pending: 'Na fila',
  blocked: 'Bloqueado',
  sending: 'Enviando',
  sent: 'Aceito pelo provedor',
  uncertain: 'Resultado incerto',
  cancelled: 'Encerrado',
};
export default function ContractorRegistrations({
  ws,
  online,
  reload,
}: {
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
}) {
  const [rows, setRows] = useState<Registration[]>([]),
    [selected, setSelected] = useState<Registration | 'invite' | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setRows([]);
    setSelected(null);
    setError('');
    if (online)
      void api(`/api/contractor-registrations?unit=${ws.unit.id}`)
        .then((result: { registrations: Registration[] }) => {
          if (active) setRows(result.registrations);
        })
        .catch((error) => {
          if (active) setError((error as Error).message);
        });
    return () => {
      active = false;
    };
  }, [ws.unit.id, online, refresh]);
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Convites e conferência de contratadas</h2>
          <p>
            A contratada preenche os dados e escolhe os perfis dos colaboradores. O vínculo e os
            acessos só são liberados após a aprovação.
          </p>
        </div>
        <div className="actions">
          <button
            className="secondary"
            disabled={!online || busy}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Atualizar lista
          </button>
          <button
            className="primary"
            disabled={!online || busy}
            onClick={() => {
              setSelected('invite');
              setError('');
            }}
          >
            Enviar link de cadastro
          </button>
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
        <p className="settings-empty">Convites e conferência exigem internet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Responsável</th>
                <th>Contratada</th>
                <th>Situação</th>
                <th>E-mail do link</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{row.data?.name || 'Ainda não preenchida'}</td>
                  <td>{statuses[row.status]}</td>
                  <td>
                    {deliveryStatuses[row.deliveryStatus]}
                    {row.deliveryError && <small>{row.deliveryError}</small>}
                  </td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => {
                        setSelected(row);
                        setError('');
                      }}
                    >
                      Consultar / conferir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="settings-empty">Nenhum convite nesta unidade.</p>}
        </div>
      )}
      {selected && (
        <Popup
          title={
            selected === 'invite'
              ? 'Enviar link de cadastro da contratada'
              : 'Conferir cadastro da contratada'
          }
          busy={busy}
          onClose={() => {
            setSelected(null);
            setError('');
          }}
        >
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              setBusy(true);
              setError('');
              try {
                const input =
                  selected === 'invite'
                    ? { action: 'invite', email: fields.get('email') }
                    : {
                        action: fields.get('action'),
                        id: selected.id,
                        version: selected.version,
                        ...(fields.get('action') === 'resend'
                          ? {}
                          : { reason: fields.get('reason') }),
                        confirmed: fields.get('confirmed') === 'on',
                      };
                await api('/api/contractor-registrations', { ...input, unitId: ws.unit.id });
                setSelected(null);
                setRefresh((value) => value + 1);
                await reload();
                setNotice('Solicitação registrada. Confira a situação do envio e dos acessos.');
              } catch (error) {
                setError((error as Error).message);
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
            {selected === 'invite' ? (
              <>
                <label>
                  E-mail do responsável da contratada *
                  <input type="email" name="email" required maxLength={254} />
                </label>
                <p>
                  O link será enviado pelo Resend, com validade de sete dias. A unidade de destino é{' '}
                  {ws.unit.name}. Nenhuma conta é criada antes da aprovação.
                </p>
                <button className="primary" disabled={busy}>
                  Enviar link por e-mail
                </button>
              </>
            ) : (
              <>
                <p>
                  <strong>{statuses[selected.status]}</strong> · {selected.email}
                </p>
                {selected.reason && <p className="alert neutral">{selected.reason}</p>}
                {selected.data && (
                  <>
                    <h3>{selected.data.name}</h3>
                    <p>CNPJ: {mask(selected.data.cnpj, 'cnpj')}</p>
                    <dl>
                      {Object.entries(selected.data.details).map(([key, value]) => (
                        <div key={key}>
                          <dt>
                            {{
                              tradeName: 'Nome fantasia',
                              contactName: 'Responsável',
                              phone: 'Telefone',
                              email: 'E-mail',
                              cep: 'CEP',
                              street: 'Logradouro',
                              number: 'Número',
                              complement: 'Complemento',
                              district: 'Bairro',
                              city: 'Cidade',
                              state: 'UF',
                            }[key] || key}
                          </dt>
                          <dd>{key === 'cep' ? mask(value, 'cep') : value || 'Não informado'}</dd>
                        </div>
                      ))}
                    </dl>
                    <h3>Colaboradores e perfis solicitados</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Nome e CPF</th>
                            <th>Contato</th>
                            <th>Perfil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.data.people.map((person) => (
                            <tr key={person.email}>
                              <td>
                                {person.name}
                                <small>{mask(person.cpf, 'cpf')}</small>
                              </td>
                              <td>
                                {person.email}
                                <small>{person.phone}</small>
                              </td>
                              <td>{contractorRoleLabels[person.role]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {selected.hasCard ? (
                  <a
                    className="secondary"
                    href={`/api/contractor-registrations/${selected.id}/card`}
                    download
                  >
                    Baixar Cartão CNPJ para conferir
                  </a>
                ) : (
                  <p>Cartão CNPJ não enviado (opcional).</p>
                )}
                {selected.status === 'submitted' ? (
                  <>
                    <p>
                      Confira razão social, CNPJ, endereço, responsável e todos os colaboradores.
                      Para CNPJ já existente, a aprovação autoriza esta unidade e mantém os dados
                      compartilhados existentes; não os sobrescreve.
                    </p>
                    <label>
                      Resultado
                      <select name="action">
                        <option value="approve">Aprovar e vincular à unidade</option>
                        <option value="changes">Solicitar correção à contratada</option>
                      </select>
                    </label>
                    <label>
                      Registro da conferência ou motivo da devolução *
                      <textarea name="reason" required minLength={5} maxLength={1000} />
                    </label>
                    <label className="checkbox-line">
                      <input type="checkbox" name="confirmed" required />
                      Conferi os dados, vínculos e perfis solicitados.
                    </label>
                    <button className="primary" disabled={busy}>
                      Registrar resultado
                    </button>
                  </>
                ) : (
                  selected.status !== 'approved' && (
                    <>
                      <input type="hidden" name="action" value="resend" />
                      <label className="checkbox-line">
                        <input type="checkbox" name="confirmed" required />
                        Conferi o envio anterior e desejo reenviar o link, mesmo com risco de
                        duplicidade.
                      </label>
                      <button className="primary" disabled={busy}>
                        Reenviar link por e-mail
                      </button>
                    </>
                  )
                )}
              </>
            )}
          </form>
        </Popup>
      )}
    </section>
  );
}
