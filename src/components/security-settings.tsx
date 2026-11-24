'use client';
import PasswordInput from './password-input';
import { useState } from 'react';
import type { WorkspaceData } from '@/lib/types';
import { api } from './workspace';
import Popup from './popup';
import { companyManager } from '@/lib/permissions';

export default function SecuritySettings({
  ws,
  online,
  reload,
  mode = 'account',
}: {
  ws: WorkspaceData;
  online: boolean;
  reload: () => Promise<unknown>;
  mode?: 'account' | 'company';
}) {
  const [open, setOpen] = useState(false),
    [secret, setSecret] = useState(''),
    [qrCode, setQrCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const self = ws.people.find((p) => p.id === ws.user.id);
  const enabled = ws.authenticatorEnabled ?? self?.authenticator_enabled;
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Segurança das aprovações</h2>
          <p>
            {ws.user.platform_admin
              ? 'Conta de administração Nexus: conferência de identidade e autenticador dispensados.'
              : 'As decisões usam sua sessão autenticada. O autenticador no login pode ser exigido pela empresa.'}
          </p>
        </div>
      </div>
      <div className="admin-form">
        {notice && (
          <p role="status" className="alert">
            {notice}
          </p>
        )}
        {mode === 'account' && ws.user.platform_admin && (
          <p>
            Acesso exclusivo da Nexus. A política de autenticador da empresa se aplica aos demais
            usuários.
          </p>
        )}
        {mode === 'account' && !ws.user.platform_admin && (
          <p>Seu autenticador: {enabled ? 'Configurado' : 'Não configurado'}.</p>
        )}
        {mode === 'account' && !ws.user.platform_admin && !enabled && (
          <button
            className="secondary"
            disabled={!online}
            onClick={() => {
              setOpen(true);
              setError('');
              setSecret('');
              setQrCode('');
            }}
          >
            Configurar meu autenticador
          </button>
        )}
        {mode === 'account' && !ws.user.platform_admin && (
          <p className="muted">
            Cadastre uma conta por pessoa no Google Authenticator, Microsoft Authenticator ou
            aplicativo TOTP compatível. Recuperação após perda do aparelho exige nova conferência
            por outro administrador e encerra suas sessões. Se a empresa exigir MFA, será necessário
            configurar novamente o autenticador para entrar.
          </p>
        )}
        {mode === 'company' && companyManager(ws.user, ws.unit) && (
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              setNotice('');
              try {
                await api('/api/security', {
                  action: 'policy',
                  unitId: ws.unit.id,
                  version: ws.securityPolicy?.version,
                  required: fields.get('required') === 'on',
                  password: fields.get('password'),
                  code: fields.get('code') || '',
                });
                await reload();
                setNotice('Política de segurança atualizada para todas as unidades desta empresa.');
                (e.target as HTMLFormElement).reset();
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="form-grid span-2" disabled={busy || !online}>
              <label className="checkbox-line span-2">
                <input
                  name="required"
                  type="checkbox"
                  defaultChecked={ws.securityPolicy?.required}
                />
                Exigir autenticador no login dos usuários da empresa
              </label>
              <label>
                Sua senha
                <PasswordInput
                  name="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                />
              </label>
              {!ws.user.platform_admin && (
                <label>
                  Seu código do autenticador
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </label>
              )}
              <p className="muted span-2">
                {ws.user.platform_admin
                  ? 'Esta exigência vale para os usuários da empresa. O Superadmin Nexus confirma a alteração com sua senha, sem autenticador.'
                  : 'Configure seu autenticador antes de ativar esta opção. Ativar ou desativar a exigência requer seu código. Com a opção desativada, as decisões continuam vinculadas à sessão autenticada.'}
              </p>
              <button className="primary">Salvar política de segurança</button>
            </fieldset>
          </form>
        )}
        {error && !open && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
      </div>
      {open && (
        <Popup
          title="Configurar meu autenticador"
          busy={busy}
          onClose={() => {
            setOpen(false);
            setSecret('');
            setQrCode('');
            setError('');
          }}
        >
          <form
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              try {
                const result = await api('/api/security', {
                  action: secret ? 'confirm' : 'begin',
                  unitId: ws.unit.id,
                  password: fields.get('password'),
                  code: fields.get('code') || '',
                });
                if (result.secret) {
                  setSecret(result.secret);
                  setQrCode(result.qrCode || '');
                } else {
                  setSecret('');
                  setQrCode('');
                  setOpen(false);
                  await reload();
                  setNotice(
                    'Autenticador confirmado. Aguarde o próximo código para outra confirmação.',
                  );
                }
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <fieldset className="form-grid" disabled={busy || !online}>
              <label className="span-2">
                Sua senha
                <PasswordInput
                  name="password"
                  required
                  autoComplete="current-password"
                  maxLength={256}
                />
              </label>
              {secret && (
                <>
                  <p className="span-2">
                    No Google Authenticator ou Microsoft Authenticator, adicione uma conta e escolha
                    a opção de ler um QR Code. Aponte a câmera do aplicativo para o código abaixo.
                  </p>
                  {qrCode && (
                    <div className="span-2">
                      <img
                        src={qrCode}
                        width={320}
                        height={320}
                        style={{ maxWidth: '100%', height: 'auto' }}
                        alt="QR Code para cadastrar sua conta Nexus PTW no aplicativo autenticador. Não compartilhe."
                      />
                    </div>
                  )}
                  <p className="muted span-2">
                    Depois de escanear, informe abaixo os seis números gerados no celular. Não
                    compartilhe o QR Code nem a chave.
                  </p>
                  <label className="span-2">
                    Chave manual alternativa (TOTP, 6 dígitos, 30 segundos)
                    <input value={secret} readOnly autoComplete="off" />
                  </label>
                  <p className="muted span-2">
                    Esta chave não será mostrada após a confirmação. A configuração pendente expira
                    em 10 minutos.
                  </p>
                  <label>
                    Código gerado no aplicativo
                    <input
                      name="code"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                    />
                  </label>
                </>
              )}
              <button className="primary">
                {secret ? 'Confirmar autenticador' : 'Gerar QR Code'}
              </button>
            </fieldset>
          </form>
        </Popup>
      )}
    </section>
  );
}
