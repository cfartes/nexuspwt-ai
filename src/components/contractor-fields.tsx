'use client';
import { useRef, useState } from 'react';
import type { ContractorDetails } from '@/lib/contractors';
import { api } from './workspace';
import MaskedInput from './masked-input';
export default function ContractorFields({
  unitId,
  initial = {},
  requiredFields = false,
  municipality = false,
}: {
  unitId: string;
  initial?: Partial<ContractorDetails> & { municipalityCode?: string };
  requiredFields?: boolean;
  municipality?: boolean;
}) {
  const [details, setDetails] = useState<
      Partial<ContractorDetails> & { municipalityCode?: string }
    >(initial),
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
        if (municipality && d.municipalityCode === previous.municipalityCode)
          next.municipalityCode = result.municipalityCode;
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
        <MaskedInput
          kind="cep"
          name="cep"
          required={requiredFields}
          autoComplete="postal-code"
          value={details.cep || ''}
          onValueChange={(cep) => {
            setDetails((d) => ({ ...d, cep }));
            setMessage('');
            setBusy(false);
            void find(cep);
          }}
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
      {municipality && (
        <label>
          Código IBGE do município
          <input
            name="municipalityCode"
            value={details.municipalityCode || ''}
            inputMode="numeric"
            maxLength={7}
            pattern="[0-9]{7}"
            onChange={(e) =>
              setDetails((d) => ({
                ...d,
                municipalityCode: e.target.value.replace(/\D/g, '').slice(0, 7),
              }))
            }
          />
        </label>
      )}
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
