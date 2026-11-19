import test from 'node:test';
import assert from 'node:assert/strict';
import { mask, unmask } from '../src/lib/input-masks';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MaskedInput from '../src/components/masked-input';

await test('máscaras CPF, CNPJ e CEP são progressivas e guardam valores sem pontuação', () => {
  for (const [kind, raw, formatted] of [
    ['cpf', '12345678901', '123.456.789-01'],
    ['cnpj', '11222333000181', '11.222.333/0001-81'],
    ['cep', '01001000', '01001-000'],
  ] as const) {
    assert.equal(mask(raw, kind), formatted);
    assert.equal(unmask(formatted, kind), raw);
    assert.equal(mask('', kind), '');
    for (let i = 0; i <= raw.length; i++) {
      const partial = mask(raw.slice(0, i), kind);
      assert.equal(unmask(partial, kind), raw.slice(0, i));
      assert(!/[./-]$/.test(partial));
    }
  }
  assert.equal(unmask('abc01001-00099', 'cep'), '01001000');
  assert.equal(unmask('abc11.222.333/0001-81', 'cnpj'), '11222333000181');
  assert.equal(mask('00000000E08G12', 'cnpj'), '00.000.000/E08G-12');
  assert.equal(unmask('00.000.000/E08G-12', 'cnpj', true), '00000000E08G12');
});

await test('campo exibe máscara e envia somente o valor sem pontuação no formulário', () => {
  const html = renderToStaticMarkup(
    createElement(MaskedInput, {
      kind: 'cnpj',
      name: 'cnpj',
      initial: '11222333000181',
      required: true,
    }),
  );
  assert.match(html, /type="hidden" name="cnpj" value="11222333000181"/);
  assert.match(html, /value="11\.222\.333\/0001-81"/);
  assert.match(html, /inputMode="numeric"/);
  assert.match(html, /required=""/);
});
