'use client';
import { useState } from 'react';
import { ShieldCheck, Save } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import { api } from './workspace';
import Popup from './popup';
import DeleteRegistration from './delete-registration';
type Assignment = WorkspaceData['approvers'][number];
export default function ApproverSettings({
  ws,
  online,
  reload,
}: {
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<Assignment | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>
            <ShieldCheck size={18} />
            Aprovação por perfil
          </h2>
          <p>Alterações de configuração valem para novas submissões.</p>
          <p>
            Na APR, os dois perfis da contratada são definidos pelas pessoas selecionadas na
            identificação. Os perfis da contratante usam esta configuração.
          </p>
        </div>
      </div>
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
      {selected && (
        <Popup
          title="Editar cadastro"
          onClose={() => {
            setSelected(null);
            setError('');
          }}
          busy={busy}
        >
          <form
            key={`${selected.id}:${selected.version}`}
            className="integration-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              setNotice('');
              try {
                await api('/api/admin', {
                  action: 'updateApprover',
                  unitId: ws.unit.id,
                  id: selected.id,
                  version: selected.version,
                  userId: fields.get('userId'),
                  active: fields.get('active') === 'on',
                  reason: fields.get('reason'),
                });
                setSelected(null);
                await reload();
                setNotice(
                  'Atribuição atualizada. Decisões e responsáveis de documentos já enviados foram preservados.',
                );
              } catch (error) {
                setError((error as Error).message);
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
            <h3>
              {selected.kind} · {selected.profile}
            </h3>
            <p className="muted">
              {selected.region_id ? 'Todas as unidades da regional' : 'Somente esta unidade'}.
              Desativar a atribuição não desativa o acesso da pessoa e não substitui pendências
              existentes.
            </p>
            <fieldset disabled={!online || busy} className="form-grid">
              <label className="span-2">
                Responsável
                <select name="userId" defaultValue={selected.user_id}>
                  <option value={selected.user_id}>{selected.user_name} (atual)</option>
                  {ws.people
                    .filter(
                      (p) =>
                        p.active &&
                        p.role !== 'executante' &&
                        p.id !== selected.user_id &&
                        (!selected.region_id || !p.contractor_id),
                    )
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="span-2">
                Motivo *<textarea name="reason" required minLength={3} maxLength={2000} />
              </label>
              <label className="checkbox-line span-2">
                <input name="active" type="checkbox" defaultChecked={selected.active} />
                Atribuição ativa para novas submissões
              </label>
            </fieldset>
            <div className="actions">
              <button className="primary" disabled={!online || busy}>
                <Save size={16} />
                {busy ? 'Salvando…' : 'Salvar atribuição'}
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
                Cancelar
              </button>
            </div>
          </form>
        </Popup>
      )}
      {!ws.approvers.length ? (
        <div className="settings-empty">Nenhum aprovador configurado.</div>
      ) : (
        ws.approvers.map((a) => (
          <div className="setting-row" key={a.id}>
            <div>
              <strong>{a.profile}</strong>
              <small>
                {a.kind} · {a.user_name}
              </small>
              <small>
                {a.region_id ? 'Regional' : 'Unidade'} ·{' '}
                {!a.active
                  ? 'Desativada'
                  : !a.eligible
                    ? 'Responsável sem acesso habilitado'
                    : 'Ativa'}
              </small>
            </div>
            {ws.unit.role === 'admin' && (!a.region_id || ws.user.platform_admin) && (
              <div className="actions">
                <button
                  className="secondary"
                  disabled={!online || busy}
                  onClick={() => {
                    setSelected(a);
                    setError('');
                    setNotice('');
                  }}
                >
                  {a.active ? 'Editar / desativar' : 'Reativar'}
                </button>
                <DeleteRegistration
                  unitId={ws.unit.id}
                  kind="approver"
                  id={a.id}
                  version={a.version}
                  name={`${a.kind} · ${a.profile} · ${a.user_name}`}
                  online={online}
                  onDeleted={async () => {
                    await reload();
                    setNotice(
                      'Atribuição excluída. Decisões e pendências anteriores foram preservadas.',
                    );
                  }}
                />
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
