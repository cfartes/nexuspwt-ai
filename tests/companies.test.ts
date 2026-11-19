import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { companyInput } from '../src/lib/companies';
import { saveCompany } from '../src/lib/company-registration';
import type { User } from '../src/lib/auth';

const data = {
  name: 'Empresa teste',
  cnpj: '00000000e08g12',
  details: {
    contactName: 'Responsável',
    email: 'contato@example.com',
    phone: '11999999999',
    cep: '01001000',
    street: 'Praça da Sé',
    number: 's/n',
    district: 'Sé',
    city: 'São Paulo',
    state: 'SP',
  },
};
await test('empresa exige dados de contato e endereço; aceita CNPJ numérico e alfanumérico', () => {
  assert.equal(companyInput.parse(data).cnpj, '00000000E08G12');
  assert.equal(companyInput.parse({ ...data, cnpj: '11222333000181' }).cnpj, '11222333000181');
  assert.equal(companyInput.safeParse({ name: 'Só o nome' }).success, false);
  for (const key of [
    'contactName',
    'email',
    'phone',
    'cep',
    'street',
    'number',
    'district',
    'city',
    'state',
  ]) {
    assert.equal(
      companyInput.safeParse({ ...data, details: { ...data.details, [key]: '' } }).success,
      false,
      key,
    );
  }
  assert.equal(
    companyInput.safeParse({ ...data, details: { ...data.details, municipalityCode: '123' } })
      .success,
    false,
  );
  assert.equal(
    companyInput.safeParse({ ...data, details: { ...data.details, billingEmail: 'invalid' } })
      .success,
    false,
  );
});

await test('administrador da unidade não pode alterar cadastro fiscal de empresa', async () => {
  const client = {
    query() {
      throw new Error('Não deve consultar o banco');
    },
  } as unknown as PoolClient;
  await assert.rejects(
    saveCompany(client, { platform_admin: false } as User, companyInput.parse(data)),
    (error: unknown) => (error as { status: number }).status === 403,
  );
});
