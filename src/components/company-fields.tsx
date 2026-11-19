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
      <ContractorFields unitId={unitId} initial={initial} requiredFields />
      {(
        ['municipalRegistration', 'stateRegistration', 'municipalityCode', 'billingEmail'] as const
      ).map((key) => (
        <label key={key}>
          {
            {
              municipalRegistration: 'Inscrição municipal (se houver)',
              stateRegistration: 'Inscrição estadual (ou ISENTO)',
              municipalityCode: 'Código IBGE do município',
              billingEmail: 'E-mail financeiro / recebimento da NFS-e',
            }[key]
          }
          <input
            name={key}
            defaultValue={initial[key] || ''}
            type={key === 'billingEmail' ? 'email' : 'text'}
            maxLength={key === 'billingEmail' ? 254 : key === 'municipalityCode' ? 7 : 50}
            inputMode={key === 'municipalityCode' ? 'numeric' : undefined}
            pattern={key === 'municipalityCode' ? '[0-9]{7}' : undefined}
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
