'use client';
import { Server } from 'lucide-react';
import type { WorkspaceData } from '@/lib/types';
import IntegrationPanel from './integration-settings';
import ResendSettings from './resend-settings';
import UnitLimitSettings from './unit-limit-settings';
import SecuritySettings from './security-settings';
import IdentityUploadSettings from './IdentityUploadSettings';

export default function SettingsPanel({
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
  return (
    <>
      <IdentityUploadSettings key={ws.unit.company_id} ws={ws} online={online} reload={reload} />
      <SecuritySettings
        mode="company"
        key={`${ws.unit.company_id}:${ws.unit.id}`}
        ws={ws}
        online={online}
        reload={reload}
      />
      {ws.user.platform_admin && ws.unit.role === 'admin' && (
        <UnitLimitSettings key={ws.unit.company_id} ws={ws} online={online} reload={reload} />
      )}
      <IntegrationPanel ws={ws} online={online} reload={reload} onError={onError} />
      {ws.user.platform_admin && ws.unit.role === 'admin' && online && <ResendSettings />}
      <div className="settings-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>
                <Server size={18} /> Guarda documental
              </h2>
              <p>Requisitos de retenção da operação</p>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>Guarda documental</strong>
              <small>Requisito definido para o produto</small>
            </div>
            <span className="badge">5 anos · backup a configurar</span>
          </div>
        </section>
      </div>
    </>
  );
}
