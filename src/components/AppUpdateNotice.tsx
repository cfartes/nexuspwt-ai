'use client';
import { useEffect, useState } from 'react';

export default function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_APP_RELEASE === 'development') return;
    let active = true;
    const check = async () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/version', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return;
        const version: { release?: unknown } = await response.json();
        if (active && typeof version.release === 'string' && version.release)
          setAvailable(version.release !== process.env.NEXT_PUBLIC_APP_RELEASE);
      } catch {
        // An offline device keeps its drafts and checks again after reconnecting.
        return;
      }
    };
    const refresh = () => {
      void check();
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  if (!available) return null;
  return (
    <aside className="app-update-notice" role="status" aria-live="polite">
      <strong>Uma nova versão do Nexus PTW está disponível.</strong>
      <p>
        Salve os formulários abertos antes de atualizar. Rascunhos salvos e envios pendentes serão
        preservados.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm('Você salvou os formulários abertos? Atualizar recarrega esta tela.'))
            return;
          setBusy(true);
          setError('');
          try {
            if (!navigator.onLine) throw new Error('Conecte-se à internet para atualizar.');
            const response = await fetch('/api/version', {
              cache: 'no-store',
              signal: AbortSignal.timeout(5000),
            });
            if (!response.ok)
              throw new Error('Não foi possível confirmar a atualização. Tente novamente.');
            const registration = await navigator.serviceWorker?.getRegistration();
            if (registration) {
              await registration.update();
              registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
            }
            window.location.reload();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Não foi possível atualizar. Tente novamente.',
            );
            setBusy(false);
          }
        }}
      >
        {busy ? 'Atualizando…' : 'Atualizar aplicativo'}
      </button>
    </aside>
  );
}
