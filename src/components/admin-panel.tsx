'use client';
import { useState } from 'react';
import { Building2, Plus, Server, ShieldCheck } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import { aprProfiles, ptProfiles } from '@/lib/forms';
import { api } from './workspace';
export default function AdminPanel({
  ws,
  online,
  reload,
  onError,
}: {
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
  onError: (s: string) => void;
}) {
  const [action, setAction] = useState('contractor'),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState('APR'),
    [success, setSuccess] = useState('');
  const admin = ws.unit.role === 'admin';
  return (
    <>
      <div className="settings-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>
                <Server size={18} /> Integrações
              </h2>
              <p>Serviços externos do workspace</p>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>Documenso</strong>
              <small>Assinatura eletrônica dos documentos</small>
            </div>
            <span className="badge">
              {ws.integrations.documenso
                ? 'Credenciais informadas · não validado'
                : 'Aguardando instalação'}
            </span>
          </div>
          <div className="setting-row">
            <div>
              <strong>OpenWA</strong>
              <small>Um número de WhatsApp por empresa</small>
            </div>
            <span className="badge">Integração pendente</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Guarda documental</strong>
              <small>Requisito definido para o produto</small>
            </div>
            <span className="badge">5 anos · backup a configurar</span>
          </div>
        </section>
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>
                <ShieldCheck size={18} /> Aprovação por perfil
              </h2>
              <p>Atribuições locais e regionais</p>
            </div>
          </div>
          {ws.approvers.length ? (
            ws.approvers.map((a) => (
              <div className="setting-row" key={a.id}>
                <div>
                  <strong>{a.profile}</strong>
                  <small>
                    {a.kind} · {a.user_name}
                  </small>
                </div>
                <span className="badge">{a.region_id ? 'Regional' : 'Unidade'}</span>
              </div>
            ))
          ) : (
            <div className="settings-empty">Nenhum aprovador configurado.</div>
          )}
        </section>
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>
              <Building2 size={19} /> Cadastros da operação
            </h2>
            <p>Empresa, regionais, unidades, terceirizadas e acessos.</p>
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
              setBusy(true);
              setSuccess('');
              try {
                await api('/api/admin', data);
                await reload();
                form.reset();
                setSuccess('Cadastro salvo.');
              } catch (err) {
                onError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              O que deseja cadastrar?
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setSuccess('');
                }}
              >
                <option value="contractor">Terceirizada / autorizar CNPJ nesta unidade</option>
                <option value="user">Novo usuário</option>
                <option value="membership">Vincular usuário existente da empresa</option>
                <option value="approver">Aprovador local ou regional</option>
                <option value="region">Regional</option>
                <option value="unit">Unidade</option>
                {ws.user.platform_admin && <option value="company">Empresa</option>}
              </select>
            </label>
            <fieldset disabled={!online || busy} key={action} className="form-grid">
              {['contractor', 'user', 'region', 'unit', 'company'].includes(action) && (
                <label>
                  Nome *<input name="name" required minLength={2} maxLength={200} />
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
                </>
              )}
              {['user', 'membership'].includes(action) && (
                <>
                  <label>
                    E-mail *<input name="email" type="email" required />
                  </label>
                  <label>
                    Perfil nesta unidade
                    <select name="role">
                      <option value="executante">Executante</option>
                      <option value="aprovador">Aprovador</option>
                      <option value="gestor">Gestor</option>
                      <option value="admin">Administrador da unidade</option>
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
                  <p className="muted span-2">
                    Primeiro acesso administrado no piloto. Convite e recuperação de senha ainda não
                    estão disponíveis.
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
                        .filter((p) => p.role !== 'executante')
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
                      <option value="region">Todas as unidades da regional</option>
                    </select>
                  </label>
                </>
              )}
            </fieldset>
            {success && (
              <p role="status" className="success">
                {success}
              </p>
            )}
            <button className="primary" disabled={!online || busy}>
              <Plus size={17} />
              {busy ? 'Salvando…' : 'Salvar cadastro'}
            </button>
            {!online && <p className="muted">Cadastros de acesso exigem conexão.</p>}
          </form>
        )}
      </section>
    </>
  );
}
