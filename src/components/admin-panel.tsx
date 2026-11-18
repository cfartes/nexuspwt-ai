'use client';
import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import { aprProfiles, ptProfiles } from '@/lib/forms';
import { api } from './workspace';
import ContractorFields from './contractor-fields';
import { contractorDetails } from '@/lib/contractors';
export default function AdminPanel({
  ws,
  online,
  reload,
  onSaved,
  initialEmail = '',
  initialMode,
  action: initialAction,
}: {
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
  onSaved: () => void;
  initialEmail?: string;
  initialMode?: 'membership';
  action: 'contractor' | 'company' | 'region' | 'unit' | 'user' | 'approver';
}) {
  const [action, setAction] = useState<string>(initialMode || initialAction),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState('APR'),
    [profile, setProfile] = useState('executante'),
    [error, setError] = useState('');
  const admin = ws.unit.role === 'admin';
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>
            <Building2 size={19} /> Novo cadastro
          </h2>
          <p>
            {initialAction === 'company'
              ? 'Cadastro de empresa na plataforma.'
              : `Cadastro em ${ws.unit.company_name} · ${ws.unit.name}.`}
          </p>
        </div>
      </div>
      {!admin ? (
        <div className="settings-empty">Seu perfil não permite gerenciar cadastros.</div>
      ) : (
        <form
          className="admin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const data: Record<string, unknown> = { action, unitId: ws.unit.id };
            fd.forEach((value, key) => {
              data[key] = value;
            });
            if (action === 'unit') data.regionId = data.regionId || null;
            if (action === 'contractor') {
              data.details = Object.fromEntries(
                Object.keys(contractorDetails.shape).map((key) => [key, fd.get(key) || '']),
              );
              for (const key of Object.keys(contractorDetails.shape)) delete data[key];
            }
            if (['user', 'membership'].includes(action))
              data.contractorId = data.contractorId || null;
            setBusy(true);
            setError('');
            try {
              await api('/api/admin', data);
              await reload();
              form.reset();
              onSaved();
            } catch (err) {
              setError((err as Error).message);
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
          {initialAction === 'user' && (
            <label>
              Tipo de acesso
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setError('');
                }}
              >
                <option value="user">Novo usuário</option>
                <option value="membership">Vincular usuário existente da empresa</option>
              </select>
            </label>
          )}
          <fieldset disabled={!online || busy} key={action} className="form-grid">
            {['contractor', 'user', 'region', 'unit', 'company'].includes(action) && (
              <label>
                {action === 'contractor' ? 'Razão social' : 'Nome'} *
                <input name="name" required minLength={2} maxLength={200} />
              </label>
            )}
            {action === 'contractor' && (
              <>
                <label>
                  CNPJ (somente números) *
                  <input
                    name="cnpj"
                    inputMode="numeric"
                    pattern="[0-9]{14}"
                    minLength={14}
                    maxLength={14}
                    required
                  />
                </label>
                <p className="muted span-2">
                  Se o CNPJ já existir nesta empresa, será criado somente o vínculo com a unidade
                  atual.
                </p>
                <ContractorFields unitId={ws.unit.id} />
              </>
            )}
            {['user', 'membership'].includes(action) && (
              <>
                <label>
                  E-mail *<input name="email" type="email" required defaultValue={initialEmail} />
                </label>
                <label>
                  Perfil nesta unidade
                  <select name="role" value={profile} onChange={(e) => setProfile(e.target.value)}>
                    <option value="executante">Executante</option>
                    <option value="aprovador">Aprovador</option>
                    <option value="gestor">Gestor</option>
                    <option value="admin">Administrador da unidade</option>
                  </select>
                </label>
                <label>
                  Vínculo nesta unidade
                  <select name="contractorId">
                    <option value="">Equipe própria da contratante</option>
                    {ws.contractors.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {action === 'user' && (
              <>
                <label>
                  Telefone com DDI e DDD *
                  <input name="phone" type="tel" placeholder="+55 11 99999-9999" required />
                </label>
                {profile !== 'aprovador' && (
                  <label>
                    Senha inicial *
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={256}
                      required
                    />
                  </label>
                )}
                <p className="muted span-2">
                  {profile === 'aprovador'
                    ? 'O aprovador receberá um link por e-mail e WhatsApp para definir a própria senha. O convite expira em 24 horas.'
                    : 'Para este perfil, informe uma senha inicial de pelo menos 12 caracteres.'}
                </p>
              </>
            )}
            {action === 'unit' && (
              <>
                <label>
                  Tipo
                  <select name="kind">
                    <option>Fábrica</option>
                    <option>CDD</option>
                    <option>Escritório</option>
                  </select>
                </label>
                <label>
                  Regional
                  <select name="regionId">
                    <option value="">Sem regional</option>
                    {ws.regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {action === 'approver' && (
              <>
                <label>
                  Usuário
                  <select name="userId" required>
                    <option value="">Selecione</option>
                    {ws.people
                      .filter((p) => p.role !== 'executante' && p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Documento
                  <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option>APR</option>
                    <option>PT</option>
                  </select>
                </label>
                <label>
                  Perfil de aprovação
                  <select name="profile">
                    {(kind === 'APR' ? aprProfiles : ptProfiles).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Abrangência
                  <select name="scope">
                    <option value="unit">Somente esta unidade</option>
                    <option value="region" disabled={!ws.user.platform_admin}>
                      Todas as unidades da regional (administração da plataforma)
                    </option>
                  </select>
                </label>
              </>
            )}
          </fieldset>
          <button className="primary" disabled={!online || busy}>
            <Plus size={17} />
            {busy ? 'Salvando…' : 'Salvar cadastro'}
          </button>
          {!online && <p className="muted">Cadastros de acesso exigem conexão.</p>}
        </form>
      )}
    </section>
  );
}
