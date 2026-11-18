import { HttpError } from './security';
export async function lookupCep(cep: string) {
  if (!/^\d{8}$/.test(cep)) throw new HttpError(400, 'Informe um CEP de 8 dígitos.');
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Falha na consulta');
    const value = await response.json();
    if (value.erro)
      throw new HttpError(
        404,
        'CEP não encontrado. Confira o número ou preencha o endereço manualmente.',
      );
    if (
      typeof value.logradouro !== 'string' ||
      typeof value.bairro !== 'string' ||
      typeof value.localidade !== 'string' ||
      !/^[A-Z]{2}$/.test(value.uf)
    )
      throw new Error('Resposta inválida');
    return {
      cep,
      street: value.logradouro,
      district: value.bairro,
      city: value.localidade,
      state: value.uf,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      'Não foi possível consultar o CEP. Preencha o endereço manualmente ou tente novamente.',
    );
  }
}
