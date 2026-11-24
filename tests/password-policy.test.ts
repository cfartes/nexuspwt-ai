import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { newPassword, passwordPattern } from '../src/lib/password-policy';
import PasswordInput from '../src/components/password-input';

await test('nova senha exige oito caracteres, maiúscula e símbolo, sem exigir número', () => {
  for (const value of ['Abcdefg!', 'Nova!123', 'Ábcdefg!', 'A!      ']) {
    assert(newPassword.safeParse(value).success, value);
    assert(new RegExp(`^(?:${passwordPattern})$`, 'u').test(value));
  }
  for (const value of [
    '',
    'Abcde!1',
    'abcdefgh!',
    'ABCDEFGH',
    'Abcdefg ',
    '1234567!',
    'A!' + 'a'.repeat(255),
  ]) {
    assert.equal(newPassword.safeParse(value).success, false, value);
    assert.equal(new RegExp(`^(?:${passwordPattern})$`, 'u').test(value), false);
  }
});

await test('senha começa oculta e oferece botão acessível que não submete o formulário', () => {
  const html = renderToStaticMarkup(
    createElement(PasswordInput, {
      name: 'password',
      required: true,
      autoComplete: 'current-password',
      disabled: true,
    }),
  );
  assert.match(html, /type="password"/);
  assert.match(html, /name="password"/);
  assert.match(html, /type="button"/);
  assert.match(html, /aria-label="Mostrar senha"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-controls=/);
  assert.match(html, /disabled=""/);
});
