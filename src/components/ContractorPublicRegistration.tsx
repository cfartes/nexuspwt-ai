'use client';
import { useEffect, useRef, useState } from 'react';
import { contractorDetails } from '@/lib/contractors';
import type { ContractorRegistrationData } from '@/lib/contractorRegistration';
import { contractorRoleLabels, type ContractorRole } from '@/lib/contractorRoles';
import ContractorFields from './contractor-fields';
import MaskedInput from './masked-input';
import { fileData } from './contractor-team';

type RegistrationView = {
  email: string;
  version: number;
  status: string;
  reason: string | null;
  hasCard: boolean;
  company_name: string;
  unit_name: string;
  data: ContractorRegistrationData | null;
};
type Employee = { name: string; cpf: string; email: string; phone: string; role: ContractorRole };
async function registrationRequest<T>(body: object): Promise<T> {
  const response = await fetch('/api/contractor-registration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir.');
  return result;
}
export default function ContractorPublicRegistration() {
  const [token, setToken] = useState(''),
    [view, setView] = useState<RegistrationView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [people, setPeople] = useState<Employee[]>([]);
  const initialized = useRef(false);
  const refresh = async (value: string) => {
    const result = await registrationRequest<RegistrationView>({ action: 'read', token: value });
    setView(result);
    setPeople(
      result.data?.people || [
        { name: '', cpf: '', email: result.email, phone: '', role: 'gestor' },
      ],
    );
  };
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    window.history.replaceState(null, '', window.location.pathname);
    setToken(value);
    void refresh(value).catch((error) => setError((error as Error).message));
  }, []);
  const update = (index: number, patch: Partial<Employee>) =>
    setPeople((list) =>
      list.map((person, position) => (position === index ? { ...person, ...patch } : person)),
    );
  return (
    <main className="password-page">
      <section className="card" style={{ width: 'min(100%, 1000px)' }}>
        <div className="card-heading">
          <div>
            <h1>Cadastro da contratada</h1>
            <p>{view ? `${view.company_name} · ${view.unit_name}` : 'Convite Nexus PTW'}</p>
          </div>
        </div>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {!view ? (
          <p className="admin-form">
            Abra o link recebido por e-mail. O link é pessoal e tem validade de sete dias.
          </p>
        ) : ['submitted', 'approved'].includes(view.status) ? (
          <div className="admin-form">
            <h2>
              {view.status === 'approved'
                ? 'Cadastro aprovado'
                : 'Cadastro enviado para conferência'}
            </h2>
            <p>
              {view.status === 'approved'
                ? 'Os convites para definir senha foram enfileirados para as contas novas do responsável e dos colaboradores. Quem já possui senha mantém seu acesso individual.'
                : 'Ainda não foram criados acessos nem vínculos com a unidade. Aguarde a conferência do responsável interno.'}
            </p>
            <button
              className="secondary"
              onClick={() => {
                void refresh(token).catch((error) => setError((error as Error).message));
              }}
            >
              Atualizar situação
            </button>
          </div>
        ) : (
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              const fields = new FormData(event.currentTarget);
              try {
                const card = fields.get('card');
                await registrationRequest({
                  action: 'submit',
                  token,
                  version: view.version,
                  data: {
                    name: fields.get('name'),
                    cnpj: fields.get('cnpj'),
                    details: Object.fromEntries(
                      Object.keys(contractorDetails.shape).map((key) => [
                        key,
                        fields.get(key) || '',
                      ]),
                    ),
                    people,
                  },
                  ...(card instanceof File && card.size ? { card: await fileData(card) } : {}),
                });
                await refresh(token);
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {view.reason && <p className="alert neutral">Correção solicitada: {view.reason}</p>}
            <p>
              Preencha a empresa e todos os colaboradores, incluindo o responsável. Cada pessoa deve
              ter e-mail individual e CPF válido. Escolha pelo menos um Gestor Contratada.
            </p>
            <fieldset className="form-grid" disabled={busy}>
              <label>
                Razão social *
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={200}
                  defaultValue={view.data?.name || ''}
                />
              </label>
              <label>
                CNPJ *
                <MaskedInput kind="cnpj" name="cnpj" required initial={view.data?.cnpj || ''} />
              </label>
              <ContractorFields
                unitId=""
                initial={{ ...view.data?.details, email: view.email }}
                requiredFields
                emailReadOnly
                addressLookup={(cep) => registrationRequest({ action: 'address', token, cep })}
              />
              <label className="span-2">
                Cartão CNPJ para conferência (opcional)
                <input type="file" name="card" accept=".pdf,.jpg,.jpeg,.png" />
                <small>
                  PDF, JPG ou PNG, até 5 MB.{' '}
                  {view.hasCard
                    ? 'O arquivo anterior será mantido se nenhum novo for escolhido.'
                    : ''}{' '}
                  Guarda mínima de cinco anos após o envio.
                </small>
              </label>
            </fieldset>
            <h2>Colaboradores da contratada</h2>
            {people.map((person, index) => (
              <fieldset className="form-grid" disabled={busy} key={index}>
                <legend>Colaborador {index + 1}</legend>
                <label>
                  Nome completo *
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={person.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </label>
                <label>
                  CPF *
                  <MaskedInput
                    kind="cpf"
                    name={`cpf-${index}`}
                    required
                    value={person.cpf}
                    onValueChange={(cpf) => update(index, { cpf })}
                  />
                </label>
                <label>
                  E-mail individual *
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={person.email}
                    onChange={(event) => update(index, { email: event.target.value })}
                  />
                </label>
                <label>
                  Telefone com DDD *
                  <input
                    type="tel"
                    required
                    maxLength={25}
                    value={person.phone}
                    onChange={(event) => update(index, { phone: event.target.value })}
                  />
                </label>
                <label>
                  Perfil *
                  <select
                    value={person.role}
                    onChange={(event) =>
                      update(index, { role: event.target.value as ContractorRole })
                    }
                  >
                    {Object.entries(contractorRoleLabels).map(([role, label]) => (
                      <option key={role} value={role}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary"
                  type="button"
                  disabled={people.length === 1}
                  onClick={() =>
                    setPeople((list) => list.filter((_, position) => position !== index))
                  }
                >
                  Remover colaborador
                </button>
              </fieldset>
            ))}
            <div className="actions">
              <button
                className="secondary"
                type="button"
                disabled={busy || people.length >= 100}
                onClick={() =>
                  setPeople((list) => [
                    ...list,
                    { name: '', cpf: '', email: '', phone: '', role: 'executante' },
                  ])
                }
              >
                Adicionar colaborador
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar cadastro para conferência'}
              </button>
            </div>
            <p className="muted">
              O envio não libera o acesso. Somente após aprovação e vínculo com a unidade as contas
              novas receberão convite para criar senha. Este formulário exige internet; fechar sem
              enviar perde o preenchimento não enviado. Não compartilhe o link nem use e-mails de
              outras pessoas.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
