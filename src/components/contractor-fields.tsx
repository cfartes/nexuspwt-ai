'use client';
import { useRef, useState } from 'react';
import type { ContractorDetails } from '@/lib/contractors';
import { api } from './workspace';
export default function ContractorFields({
  unitId,
  initial = {},
  requiredFields = false,
}: {
  unitId: string;
  initial?: Partial<ContractorDetails>;
  requiredFields?: boolean;
}) {
  const [details, setDetails] = useState<Partial<ContractorDetails>>(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const current = useRef(details);
  current.current = details;
  const last = useRef('');
  async function find(cep: string) {
    if (cep.length !== 8 || cep === last.current) return;
    last.current = cep;
    setBusy(true);
    setMessage('Buscando endereço…');
    const previous = current.current;
    try {
      const result = await api(`/api/address?unit=${unitId}&cep=${cep}`);
      if (current.current.cep !== cep) return;
      setDetails((d) => {
        const next = { ...d };
        for (const key of ['street', 'district', 'city', 'state'] as const)
          if (d[key] === previous[key]) next[key] = result[key];
        return next;
      });
      setMessage('Endereço preenchido. Confira e informe número e complemento.');
    } catch (e) {
      if (current.current.cep === cep) {
        setMessage((e as Error).message);
        last.current = '';
      }
    } finally {
      if (current.current.cep === cep) setBusy(false);
    }
  }
  return (
    <>
      {(['tradeName', 'contactName', 'phone', 'email'] as const).map((key) => (
        <label key={key}>
          {
            {
              tradeName: 'Nome fantasia',
              contactName: 'Responsável de contato',
              phone: 'Telefone',
              email: 'E-mail',
            }[key]
          }
          <input
            name={key}
            required={requiredFields && key !== 'tradeName'}
            type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
            defaultValue={initial[key] || ''}
            maxLength={key === 'email' ? 254 : key === 'phone' ? 25 : 200}
          />
        </label>
      ))}
      <label>
        CEP
        <input
          name="cep"
          required={requiredFields}
          inputMode="numeric"
          autoComplete="postal-code"
          value={details.cep || ''}
          maxLength={9}
          onChange={(e) => {
            const cep = e.target.value.replace(/\D/g, '');
            setDetails((d) => ({ ...d, cep }));
            setMessage('');
            setBusy(false);
            void find(cep);
          }}
          onBlur={() => void find(details.cep || '')}
        />
      </label>
      <button
        className="secondary"
        type="button"
        disabled={busy || (details.cep || '').length !== 8}
        onClick={() => {
          last.current = '';
          void find(details.cep || '');
        }}
      >
        Buscar CEP
      </button>
      {message && (
        <p className="muted span-2" role="status">
          {message}
        </p>
      )}
      {(['street', 'number', 'complement', 'district', 'city', 'state'] as const).map((key) => (
        <label key={key}>
          {
            {
              street: 'Logradouro',
              number: 'Número',
              complement: 'Complemento',
              district: 'Bairro',
              city: 'Cidade',
              state: 'UF',
            }[key]
          }
          <input
            name={key}
            required={requiredFields && key !== 'complement'}
            value={details[key] || ''}
            maxLength={key === 'state' ? 2 : key === 'number' ? 30 : 200}
            onChange={(e) =>
              setDetails((d) => ({
                ...d,
                [key]: key === 'state' ? e.target.value.toUpperCase() : e.target.value,
              }))
            }
          />
        </label>
      ))}
    </>
  );
}
