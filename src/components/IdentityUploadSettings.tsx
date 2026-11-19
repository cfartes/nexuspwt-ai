'use client';
import { useState } from 'react';
import type { WorkspaceData } from '@/lib/types';
import { api } from './workspace';

export default function IdentityUploadSettings({
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
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Documentos dos colaboradores da contratada</h2>
          <p>Ativação opcional para todas as unidades desta empresa.</p>
        </div>
        <span className="badge">{ws.identityPolicy?.enabled ? 'Ativado' : 'Desativado'}</span>
      </div>
      <form
        className="admin-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          setBusy(true);
          setError('');
          setNotice('');
          try {
            await api('/api/identity-policy', {
              unitId: ws.unit.id,
              enabled: fields.get('enabled') === 'on',
              version: ws.identityPolicy?.version,
            });
            await reload();
            setNotice('Configuração de documentos atualizada para a empresa.');
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="checkbox-line">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={ws.identityPolicy?.enabled}
            disabled={!online || busy}
          />
          Exigir documento no primeiro acesso dos colaboradores da contratada
        </label>
        <p className="muted">
          Quando ativado, todos os perfis vinculados a uma contratada devem enviar RG, CNH ou
          passaporte e aguardar validação do admin/gestor interno da unidade. Documentos já
          validados são reaproveitados nas unidades da mesma empresa e contratada.
        </p>
        <p className="muted">
          Desativado: não solicita upload nem bloqueia a operação por falta de documento. Arquivos e
          históricos já enviados são preservados, inclusive sua guarda mínima de cinco anos.
        </p>
        <p className="muted">
          Ao ativar, a exigência também vale para colaboradores já cadastrados que ainda não tenham
          documento validado.
        </p>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="alert" role="status">
            {notice}
          </p>
        )}
        <button className="primary" disabled={!online || busy || !ws.identityPolicy}>
          {busy ? 'Salvando…' : 'Salvar configuração de documentos'}
        </button>
      </form>
    </section>
  );
}
