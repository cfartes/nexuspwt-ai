'use client';
import { useState } from 'react';
import type { WorkspaceData } from '@/lib/types';
import { contractorDetails } from '@/lib/contractors';
import Popup from './popup';
import ContractorFields from './contractor-fields';
import { api } from './workspace';
import MaskedInput from './masked-input';
export default function ContractorEditor({
  ws,
  contractor,
  online,
  reload,
  onClose,
}: {
  ws: WorkspaceData;
  contractor: WorkspaceData['contractors'][number];
  online: boolean;
  reload: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Popup title="Dados da contratada" onClose={onClose} busy={busy}>
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          setError('');
          setBusy(true);
          try {
            const details = contractorDetails.parse(
              Object.fromEntries(
                Object.keys(contractorDetails.shape).map((key) => [key, fields.get(key) || '']),
              ),
            );
            await api('/api/admin', {
              action: 'updateContractor',
              unitId: ws.unit.id,
              id: contractor.id,
              version: contractor.version,
              name: fields.get('name'),
              details,
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
        <p className="muted">
          O cadastro é compartilhado com as unidades desta empresa que atendem o mesmo CNPJ.
        </p>
        <fieldset className="form-grid" disabled={busy || !online}>
          <label>
            Razão social *
            <input
              name="name"
              required
              minLength={2}
              maxLength={200}
              defaultValue={contractor.name}
            />
          </label>
          <label>
            CNPJ
            <MaskedInput kind="cnpj" initial={contractor.cnpj} readOnly />
          </label>
          <ContractorFields unitId={ws.unit.id} initial={contractor.details} />
        </fieldset>
        <button className="primary" disabled={busy || !online}>
          {busy ? 'Salvando…' : 'Salvar contratada'}
        </button>
      </form>
    </Popup>
  );
}
