'use client';
import { useEffect, useState } from 'react';
import { FileCheck2, Save } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import type { IntegrationSettings } from '@/lib/integrations';
import { api } from './workspace';
import WhatsappSettings from './whatsapp-settings';

type ConfigResponse = {
  integrations: IntegrationSettings[];
  encryptionReady: boolean;
  openwaDefaultUrl: string;
};
export default function IntegrationPanel({
  ws,
  online,
  reload,
  onError,
}: {
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const [config, setConfig] = useState<ConfigResponse | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const canManage = ws.unit.role === 'admin';
  async function load() {
    const data = await api(`/api/integrations?unit=${ws.unit.id}`);
    setConfig(data);
    return data as ConfigResponse;
  }
  useEffect(() => {
    setConfig(null);
    setError('');
    setNotice('');
    if (!canManage || !online || !ws.user.platform_admin) return;
    let active = true;
    api(`/api/integrations?unit=${ws.unit.id}`)
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [ws.unit.id, online, canManage, ws.user.platform_admin]);
  if (!canManage)
    return (
      <div className="alert neutral">
        Integrações por empresa: somente o administrador da plataforma pode alterar fornecedores e
        credenciais.
      </div>
    );
  if (!online)
    return (
      <div className="alert neutral">
        Conecte-se para configurar integrações. Credenciais não são salvas no dispositivo.
      </div>
    );
  if (error)
    return (
      <div className="alert error" role="alert">
        {error}
        <button
          className="text-button"
          onClick={() => {
            setError('');
            load().catch((e) => setError(e.message));
          }}
        >
          Recarregar
        </button>
      </div>
    );
  if (!ws.user.platform_admin)
    return <WhatsappSettings key={ws.unit.company_id} unitId={ws.unit.id} superadmin={false} />;
  if (!config)
    return (
      <p className="muted" role="status">
        Carregando integrações da empresa…
      </p>
    );
  const signature = config.integrations.find((row) => row.service === 'signature');
  async function save(body: unknown) {
    setNotice('');
    await api('/api/integrations', body);
    await load();
    await reload();
    setNotice(
      'Configuração salva. O envio de avisos depende da habilitação da empresa e do processo de notificações.',
    );
  }
  return (
    <>
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      <div className="alert neutral">
        Estas configurações valem para todas as unidades de {ws.unit.company_name || 'sua empresa'}.
        Tokens e chaves ficam criptografados no servidor.
      </div>
      {!config.encryptionReady && (
        <div className="alert neutral">
          O servidor ainda precisa da chave de criptografia para armazenar credenciais. Você pode
          selecionar o fornecedor e preparar os dados de configuração.
        </div>
      )}
      <div className="settings-grid">
        <SignatureSettings
          key={`signature-${ws.unit.company_id}-${signature?.version || 0}`}
          unitId={ws.unit.id}
          row={signature}
          encryptionReady={config.encryptionReady}
          save={save}
          onError={onError}
        />
        <WhatsappSettings key={ws.unit.company_id} unitId={ws.unit.id} superadmin />
      </div>
    </>
  );
}
function SignatureSettings({
  unitId,
  row,
  encryptionReady,
  save,
  onError,
}: {
  unitId: string;
  row?: IntegrationSettings;
  encryptionReady: boolean;
  save: (data: unknown) => Promise<void>;
  onError: (s: string) => void;
}) {
  const [provider, setProvider] = useState(
      row?.provider === 'certisign' ? 'certisign' : 'docusign',
    ),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState(''),
    [clearSecret, setClearSecret] = useState(false);
  const existing = !!row?.hasSecret && row.provider === provider;
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>
            <FileCheck2 size={18} /> Assinatura eletrônica
          </h2>
          <p>Selecione o fornecedor da empresa</p>
        </div>
        <span className="badge">Configuração · integração pendente</span>
      </div>
      <form
        className="integration-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await save({
              service: 'signature',
              unitId,
              version: row?.version || 0,
              provider,
              environment: data.get('environment'),
              accountId: data.get('accountId') || '',
              clientId: data.get('clientId') || '',
              secret,
              clearSecret,
            });
            setSecret('');
          } catch (error) {
            onError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="form-grid">
          <label>
            Fornecedor
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setSecret('');
                setClearSecret(false);
              }}
            >
              <option value="docusign">DocuSign</option>
              <option value="certisign">Certisign</option>
            </select>
          </label>
          <label>
            Ambiente
            <select name="environment" defaultValue={row?.settings.environment || 'sandbox'}>
              <option value="sandbox">Homologação</option>
              <option value="production">Produção</option>
            </select>
          </label>
          {provider === 'docusign' && (
            <>
              <label>
                ID da conta
                <input
                  name="accountId"
                  defaultValue={row?.provider === provider ? row.settings.accountId : ''}
                  maxLength={200}
                />
              </label>
              <label>
                ID da integração / aplicação
                <input
                  name="clientId"
                  defaultValue={row?.provider === provider ? row.settings.clientId : ''}
                  maxLength={200}
                />
              </label>
            </>
          )}
          <label className="span-2">
            {provider === 'certisign' ? 'Token de integração' : 'Client Secret (OAuth)'}
            <input
              type="password"
              autoComplete="new-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              disabled={!encryptionReady || clearSecret}
              maxLength={16000}
              placeholder={
                existing
                  ? 'Credencial salva · deixe vazio para manter'
                  : 'Informe a credencial completa'
              }
            />
            <small>
              {existing
                ? 'Uma credencial já está armazenada. Seu conteúdo não é exibido.'
                : 'Nenhuma credencial salva para este fornecedor.'}
            </small>
          </label>
          {existing && (
            <label className="checkbox-line span-2">
              <input
                type="checkbox"
                checked={clearSecret}
                onChange={(e) => {
                  setClearSecret(e.target.checked);
                  setSecret('');
                }}
              />
              Remover a credencial salva
            </label>
          )}
        </fieldset>
        <p className="muted">
          {provider === 'certisign'
            ? 'Use o token de integração da plataforma Assinaturas Certisign.'
            : 'Informe os dados da aplicação OAuth DocuSign. A autorização da conta ainda não está implementada.'}{' '}
          Salvar os dados não envia documentos nem coleta assinaturas.
        </p>
        {row && row.provider !== provider && row.hasSecret && (
          <p className="muted">
            Ao salvar a troca de fornecedor, a credencial anterior será removida.
          </p>
        )}
        <button className="primary" disabled={busy}>
          <Save size={16} />
          {busy ? 'Salvando…' : 'Salvar assinatura'}
        </button>
      </form>
    </section>
  );
}
