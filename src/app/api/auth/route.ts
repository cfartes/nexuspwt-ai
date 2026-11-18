import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { db, transaction } from '@/lib/db';
import { assertOrigin, digest, hashPassword, verifyPassword, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
const dummyHash = hashPassword(randomBytes(32).toString('hex'));
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { email, password } = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(1).max(256),
      })
      .parse(await request.json());
    const user = await transaction(async (c) => {
      await c.query('INSERT INTO login_attempts(email) VALUES($1) ON CONFLICT DO NOTHING', [email]);
      const {
        rows: [attempt],
      } = await c.query('SELECT * FROM login_attempts WHERE email=$1 FOR UPDATE', [email]);
      if (Date.now() - new Date(attempt.window_at).getTime() > 900000)
        await c.query('UPDATE login_attempts SET failures=0,window_at=now() WHERE email=$1', [
          email,
        ]);
      else if (attempt.failures >= 8) return null;
      const {
        rows: [u],
      } = await c.query('SELECT * FROM users WHERE email=$1 AND active', [email]);
      const valid = verifyPassword(password, u?.password_hash || dummyHash);
      if (!u || !valid || u.password_pending) {
        await c.query('UPDATE login_attempts SET failures=failures+1 WHERE email=$1', [email]);
        return null;
      }
      await c.query('DELETE FROM login_attempts WHERE email=$1', [email]);
      return u;
    });
    if (!user)
      throw new HttpError(
        401,
        'Credenciais inválidas ou limite de tentativas atingido. Tente novamente em 15 minutos.',
      );
    const token = randomBytes(32).toString('hex');
    await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')", [
      digest(token),
      user.id,
    ]);
    (await cookies()).set('nexus_session', token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 43200,
      path: '/',
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    const jar = await cookies();
    const token = jar.get('nexus_session')?.value;
    if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
    jar.delete('nexus_session');
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
