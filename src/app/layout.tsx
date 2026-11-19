import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppUpdateNotice from '@/components/AppUpdateNotice';
export const metadata: Metadata = {
  title: 'Nexus PTW AI · Segurança em cada etapa',
  description: 'Gestão de análises preliminares de riscos e permissões de trabalho',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Nexus PTW' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#122d43',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <AppUpdateNotice />
      </body>
    </html>
  );
}
