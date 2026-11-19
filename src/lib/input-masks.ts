export type MaskKind = 'cpf' | 'cnpj' | 'cep';
export function unmask(value: string, kind: MaskKind, allowLetters = false) {
  return value
    .toUpperCase()
    .replace(kind === 'cnpj' && allowLetters ? /[^A-Z0-9]/g : /\D/g, '')
    .slice(0, kind === 'cpf' ? 11 : kind === 'cnpj' ? 14 : 8);
}
export function mask(value: string, kind: MaskKind) {
  const raw = unmask(value, kind, kind === 'cnpj');
  const groups = kind === 'cep' ? [5, 3] : kind === 'cpf' ? [3, 3, 3, 2] : [2, 3, 3, 4, 2];
  const separators =
    kind === 'cep' ? ['-'] : kind === 'cpf' ? ['.', '.', '-'] : ['.', '.', '/', '-'];
  let offset = 0;
  return groups
    .map((size, i) => {
      const part = raw.slice(offset, offset + size);
      offset += size;
      return part ? (i ? separators[i - 1] : '') + part : '';
    })
    .join('');
}
