'use client';
import { useState } from 'react';
import type { WorkspaceData } from '@/lib/types';
import type { Company } from '@/lib/companies';
import { companyDetails } from '@/lib/companies';
import Popup from './popup';
import CompanyFields from './company-fields';
import { api } from './workspace';
import MaskedInput from './masked-input';

export default function CompanyEditor({
  ws,
  company,
  online,
  reload,
  onClose,
}: {
  ws: WorkspaceData;
  company: Company;
  online: boolean;
  reload: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Popup title="Dados da empresa" onClose={onClose} busy={busy}>
      <form
        className="admin-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          setBusy(true);
          setError('');
          try {
            await api('/api/admin', {
              action: 'updateCompany',
              unitId: ws.unit.id,
              id: company.id,
              version: company.version,
              name: fields.get('name'),
              cnpj: fields.get('cnpj'),
              details: Object.fromEntries(
                Object.keys(companyDetails.shape).map((key) => [key, fields.get(key) || '']),
              ),
            });
            await reload();
            onClose();
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
        <fieldset className="form-grid" disabled={busy || !online}>
          <label>
            Razão social *
            <input name="name" required minLength={2} maxLength={200} defaultValue={company.name} />
          </label>
          <label>
            CNPJ *
            <MaskedInput kind="cnpj" name="cnpj" required initial={company.cnpj || ''} />
          </label>
          <CompanyFields unitId={ws.unit.id} initial={company.details} />
        </fieldset>
        <button className="primary" disabled={busy || !online}>
          {busy ? 'Salvando…' : 'Salvar empresa'}
        </button>
      </form>
    </Popup>
  );
}
