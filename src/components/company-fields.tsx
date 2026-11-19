'use client';
import type { CompanyDetails } from '@/lib/companies';
import ContractorFields from './contractor-fields';

export default function CompanyFields({
  unitId,
  initial = {},
}: {
  unitId: string;
  initial?: Partial<CompanyDetails>;
}) {
  return (
    <>
      <ContractorFields unitId={unitId} initial={initial} requiredFields municipality />
      {(['municipalRegistration', 'stateRegistration', 'billingEmail'] as const).map((key) => (
        <label key={key}>
          {
            {
              municipalRegistration: 'Inscrição municipal (se houver)',
              stateRegistration: 'Inscrição estadual (ou ISENTO)',
              billingEmail: 'E-mail financeiro / recebimento da NFS-e',
            }[key]
          }
          <input
            name={key}
            defaultValue={initial[key] || ''}
            type={key === 'billingEmail' ? 'email' : 'text'}
            maxLength={key === 'billingEmail' ? 254 : 50}
          />
        </label>
      ))}
      <p className="muted span-2">
        Dados para faturamento da assinatura do SaaS. A emissão de NFS-e será integrada
        separadamente.
      </p>
    </>
  );
}
