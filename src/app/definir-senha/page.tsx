import DefinePassword from '@/components/define-password';
export const metadata = {
  title: 'Definir senha · Nexus PTW',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default function Page() {
  return <DefinePassword />;
}
