import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return bits
    .match(/.{5}/g)!
    .map((part) => alphabet[parseInt(part, 2)])
    .join('');
}
export function totp(secret: string, step: number, digits = 6) {
  if (!/^[A-Z2-7]{16,128}$/.test(secret) || !Number.isSafeInteger(step) || step < 0)
    throw new Error('Parâmetros TOTP inválidos.');
  let bits = '';
  for (const letter of secret) bits += alphabet.indexOf(letter).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((part) => parseInt(part, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
}
export function totpStep(secret: string, code: string, lastStep: number, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code)))
      return step;
  }
  return null;
}
