import test from 'node:test';
import assert from 'node:assert/strict';
import { totpQrCode, totpUri } from '../src/lib/totp-qr';

await test('QR do autenticador usa otpauth com conta e parâmetros corretos, sem serviço externo', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const email = 'pessoa+teste&qr@example.com';
  const uri = new URL(totpUri(secret, email));
  assert.equal(uri.protocol, 'otpauth:');
  assert.equal(uri.host, 'totp');
  assert.equal(decodeURIComponent(uri.pathname), `/Nexus PTW:${email}`);
  assert.equal(uri.searchParams.get('secret'), secret);
  assert.equal(uri.searchParams.get('issuer'), 'Nexus PTW');
  assert.equal(uri.searchParams.get('algorithm'), 'SHA1');
  assert.equal(uri.searchParams.get('digits'), '6');
  assert.equal(uri.searchParams.get('period'), '30');
  assert.equal(uri.searchParams.size, 5);
  const image = await totpQrCode(secret, email);
  assert(image.startsWith('data:image/png;base64,'));
  const png = Buffer.from(image.split(',')[1], 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 320);
  assert.equal(png.readUInt32BE(20), 320);
  assert.throws(() => totpUri('secret-invalid', email));
});
