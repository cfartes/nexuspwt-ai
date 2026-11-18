'use client';
import { useState } from 'react';
import type { Approval, Person } from '@/lib/types';
import { api } from './workspace';
export default function ReassignApproval({
  approval,
  unitId,
  people,
  contractorId,
  onChanged,
}: {
  approval: Approval;
  unitId: string;
  people: Person[];
  contractorId: string;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!editing)
    return (
      <button className="text-button" onClick={() => setEditing(true)}>
        Substituir responsável pendente
      </button>
    );
  return (
    <form
      className="form-grid"
      style={{ width: '100%' }}
      onSubmit={async (e) => {
        e.preventDefault();
        const fields = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        try {
          await api('/api/admin', {
            action: 'reassignApproval',
            unitId,
            id: approval.id,
            assignmentVersion: approval.assignment_version,
            userId: fields.get('userId'),
            reason: fields.get('reason'),
          });
          await onChanged();
          setEditing(false);
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="span-2 form-grid">
        <label>
          Novo responsável *
          <select name="userId" required defaultValue="">
            <option value="">Selecione</option>
            {people
              .filter(
                (p) =>
                  p.active &&
                  p.role !== 'executante' &&
                  p.id !== approval.user_id &&
                  (!p.contractor_id || p.contractor_id === contractorId),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Motivo *<input name="reason" required minLength={3} maxLength={2000} />
        </label>
      </fieldset>
      {error && (
        <div className="alert error span-2" role="alert">
          {error}
        </div>
      )}
      <p className="muted span-2">
        Somente este perfil pendente será transferido. Decisões já registradas permanecem. O novo
        responsável receberá um aviso conforme a configuração do WhatsApp; envios incertos continuam
        exigindo conferência.
      </p>
      <div className="actions span-2">
        <button className="primary" disabled={busy}>
          {busy ? 'Substituindo…' : 'Confirmar substituição'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
