import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function assertOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  if (request.headers.get('origin') !== expected)
    throw new HttpError(403, 'Origem da solicitação inválida.');
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
