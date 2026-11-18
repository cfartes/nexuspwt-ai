'use client';
import { useState } from 'react';
import { Building2, Save } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import { api } from './workspace';
export default function UnitLimitSettings({
  ws,
  online,
  reload,
}: {
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const quota = ws.unitQuota;
  if (!quota) return null;
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>
            <Building2 size={18} /> Limite de unidades
          </h2>
          <p>{ws.unit.company_name} · configuração exclusiva do superadmin</p>
        </div>
        <span className="badge">
          {quota.used} de {quota.limit} cadastradas
        </span>
      </div>
      <form
        className="integration-form"
        key={quota.version}
        onSubmit={async (e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          setNotice('');
          try {
            await api('/api/admin', {
              action: 'setUnitLimit',
              unitId: ws.unit.id,
              limit: Number(fields.get('limit')),
              version: quota.version,
            });
            await reload();
            setNotice('Limite de unidades atualizado.');
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
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        <label>
          Máximo de unidades cadastradas
          <input
            type="number"
            name="limit"
            required
            min={Math.max(1, quota.used)}
            max={2147483647}
            step={1}
            defaultValue={quota.limit}
            disabled={!online || busy}
          />
        </label>
        <p className="muted">
          A unidade inicial também ocupa uma vaga. O limite vale para toda a empresa e não pode ser
          menor que o número de unidades existentes. Usuários, APRs e PTs não consomem vagas de
          unidades.
        </p>
        <button className="primary" disabled={!online || busy}>
          <Save size={16} /> {busy ? 'Salvando…' : 'Salvar limite'}
        </button>
      </form>
    </section>
  );
}
