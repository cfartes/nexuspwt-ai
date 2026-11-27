import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { csrfCookieName } from '@/lib/csrf';

export async function GET() {
  const jar = await cookies();
  const secure = process.env.COOKIE_SECURE === 'true';
  const name = csrfCookieName(secure);
  const current = jar.get(name)?.value;
  const token =
    current && /^[a-f\d]{64}$/.test(current) ? current : randomBytes(32).toString('hex');
  jar.set(name, token, { secure, httpOnly: true, sameSite: 'strict', path: '/' });
  return Response.json(
    { token },
    { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } },
  );
}
