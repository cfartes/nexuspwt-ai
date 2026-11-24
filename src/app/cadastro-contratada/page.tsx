import ContractorPublicRegistration from '@/components/ContractorPublicRegistration';
export const metadata = {
  title: 'Cadastro da contratada · Nexus PTW',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default function Page() {
  return <ContractorPublicRegistration />;
}
