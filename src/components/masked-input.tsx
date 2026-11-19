'use client';
import { useRef, useState } from 'react';
import { mask, unmask, type MaskKind } from '@/lib/input-masks';

export default function MaskedInput({
  kind,
  name,
  initial = '',
  value,
  onValueChange,
  required,
  readOnly,
  autoComplete,
}: {
  kind: MaskKind;
  name?: string;
  initial?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
}) {
  const [local, setLocal] = useState(initial);
  // Preserva CNPJs alfanuméricos já cadastrados ao editar os demais dados da empresa.
  const allowLetters = kind === 'cnpj' && /[A-Z]/i.test(initial);
  const input = useRef<HTMLInputElement>(null);
  const raw = value ?? local;
  return (
    <>
      {name && <input type="hidden" name={name} value={raw} />}
      <input
        ref={input}
        inputMode={allowLetters ? 'text' : 'numeric'}
        autoComplete={autoComplete}
        required={required}
        readOnly={readOnly}
        value={mask(raw, kind)}
        maxLength={kind === 'cep' ? 9 : kind === 'cpf' ? 14 : 18}
        pattern={
          kind === 'cep'
            ? '[0-9]{5}-[0-9]{3}'
            : kind === 'cpf'
              ? '[0-9]{3}\\.[0-9]{3}\\.[0-9]{3}-[0-9]{2}'
              : '[A-Z0-9]{2}\\.[A-Z0-9]{3}\\.[A-Z0-9]{3}/[A-Z0-9]{4}-[0-9]{2}'
        }
        onChange={(event) => {
          const element = event.currentTarget;
          const before = element.value.slice(0, element.selectionStart ?? element.value.length);
          const count = unmask(before, kind, allowLetters).length;
          const next = unmask(element.value, kind, allowLetters);
          setLocal(next);
          onValueChange?.(next);
          requestAnimationFrame(() => {
            const current = input.current;
            if (!current || document.activeElement !== current) return;
            let position = 0,
              seen = 0;
            while (position < current.value.length && seen < count) {
              if (/[A-Z0-9]/.test(current.value[position])) seen++;
              position++;
            }
            current.setSelectionRange(position, position);
          });
        }}
      />
    </>
  );
}
