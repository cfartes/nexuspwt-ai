import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { lookupCep } from '../src/lib/address';
import { contractorDetails } from '../src/lib/contractors';
test('CEP: valida antes da consulta, traduz endereço e trata falha sem depender do provedor', async () => {
  const request = mock.method(globalThis, 'fetch', async () =>
    Response.json({
      logradouro: 'Praça da Sé',
      bairro: 'Sé',
      localidade: 'São Paulo',
      uf: 'SP',
      ibge: '3550308',
    }),
  );
  try {
    await assert.rejects(lookupCep('../12345678'), /8 dígitos/);
    assert.equal(request.mock.callCount(), 0);
    assert.deepEqual(await lookupCep('01001000'), {
      cep: '01001000',
      street: 'Praça da Sé',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
      municipalityCode: '3550308',
    });
    assert.equal(
      String(request.mock.calls[0].arguments[0]),
      'https://viacep.com.br/ws/01001000/json/',
    );
    request.mock.mockImplementation(async () =>
      Response.json({
        logradouro: 'Rua',
        bairro: 'Centro',
        localidade: 'Cidade',
        uf: 'SP',
        ibge: 'inválido',
      }),
    );
    assert.equal((await lookupCep('01001000')).municipalityCode, '');
    request.mock.mockImplementation(async () => Response.json({ erro: true }));
    await assert.rejects(lookupCep('99999999'), /não encontrado/);
    request.mock.mockImplementation(async () => {
      throw new Error('timeout');
    });
    await assert.rejects(lookupCep('01001000'), /manualmente/);
    request.mock.mockImplementation(async () => Response.json({ uf: 'XX' }));
    await assert.rejects(lookupCep('01001000'), /manualmente/);
    assert(contractorDetails.safeParse({}).success, 'Cadastro legado não exige completar endereço');
    assert(!contractorDetails.safeParse({ state: 'XX' }).success);
    assert(!contractorDetails.safeParse({ cep: '123' }).success);
  } finally {
    request.mock.restore();
  }
});
