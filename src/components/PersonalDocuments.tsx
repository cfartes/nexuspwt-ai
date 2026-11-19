'use client';
import { useState } from 'react';
import type { WorkspaceData } from '@/lib/types';
import { api } from './workspace';
import { fileData } from './contractor-team';

const statusLabels = {
  disabled: 'Envio de documentos desativado',
  not_required: 'Documento não exigido',
  missing: 'Envie seu documento',
  pending: 'Aguardando validação da unidade',
  approved: 'Documento validado',
  rejected: 'Documento devolvido para correção',
};
export default function PersonalDocuments({
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
  const identity = ws.identityOnboarding;
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Meu documento de identificação</h2>
          <p>
            {ws.user.name} · {ws.unit.company_name}
          </p>
        </div>
      </div>
      <div className="admin-form">
        <p role="status">
          <strong>{identity ? statusLabels[identity.status] : 'Consultando situação…'}</strong>
        </p>
        {identity?.documentType && <p>Documento enviado: {identity.documentType}</p>}
        {identity?.reason && <p className="alert neutral">{identity.reason}</p>}
        {identity?.required && (
          <p>
            Até a validação, seu acesso nesta empresa fica limitado ao envio do documento e à
            consulta desta situação.
          </p>
        )}
        <button
          type="button"
          className="secondary"
          disabled={!online || busy}
          onClick={() => {
            void reload().catch((error) => setError((error as Error).message));
          }}
        >
          Atualizar situação
        </button>
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
        {ws.identityPolicy?.enabled && (
          <form
            style={{ marginTop: 24 }}
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              setNotice('');
              const fields = new FormData(event.currentTarget);
              try {
                const files = fields
                  .getAll('files')
                  .filter((file): file is File => file instanceof File && file.size > 0);
                if (!files.length || files.length > 2)
                  throw new Error('Envie um PDF ou até duas imagens (frente e verso).');
                await api('/api/my-identity', {
                  unitId: ws.unit.id,
                  documentType: fields.get('documentType'),
                  files: await Promise.all(files.map(fileData)),
                });
                await reload();
                setNotice('Documento enviado. Aguarde a conferência da unidade.');
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="form-grid" disabled={!online || busy}>
              <label>
                Tipo de documento
                <select name="documentType" defaultValue={identity?.documentType || 'RG'}>
                  {['RG', 'CNH', 'Passaporte'].map((documentType) => (
                    <option key={documentType}>{documentType}</option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                Arquivo do seu documento *
                <input type="file" name="files" accept=".pdf,.jpg,.jpeg,.png" multiple required />
                <small>
                  PDF, JPG ou PNG. Até dois arquivos de 5 MB. Guarda mínima de cinco anos para
                  conferência de identidade e registro do vínculo.
                </small>
              </label>
              <p className="muted span-2">
                O envio não valida a identidade automaticamente. Um novo envio suspende a validação
                anterior até nova conferência. Não envie documentos de outras pessoas.
              </p>
              <button className="primary">
                {busy ? 'Enviando…' : 'Enviar meu documento para análise'}
              </button>
            </fieldset>
          </form>
        )}
        {!online && (
          <p className="alert neutral">
            O envio e a consulta de documentos pessoais exigem internet.
          </p>
        )}
      </div>
    </section>
  );
}
