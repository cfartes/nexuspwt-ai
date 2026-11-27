import PasswordRecovery from '@/components/PasswordRecovery';
import DefinePassword from '@/components/define-password';

export const metadata = {
  title: 'Recuperar senha · Nexus PTW',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ confirmar?: string }>;
}) {
  const parameters = await searchParams;
  return parameters.confirmar === '1' ? <DefinePassword recovery /> : <PasswordRecovery />;
}
