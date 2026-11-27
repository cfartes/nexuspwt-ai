import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { db, transaction } from '@/lib/db';
import { assertOrigin, digest, hashPassword, verifyPassword, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { requiresLoginMfa } from '@/lib/session-security';
import { authenticateDecision } from '@/lib/approval-security';
import { newTotpSecret } from '@/lib/totp';
import { encryptSecret } from '@/lib/integrations';
import { totpQrCode } from '@/lib/totp-qr';
const dummyHash = hashPassword(randomBytes(32).toString('hex'));
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { email, password, code, enroll } = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(1).max(256),
        code: z
          .string()
          .regex(/^$|^\d{6}$/)
          .default(''),
        enroll: z.boolean().default(false),
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
    let factorEnabledAt: string | null = null;
    const mfa = !user.platform_admin && (await requiresLoginMfa(db, user.id));
    if (mfa) {
      const {
        rows: [factor],
      } = await db.query('SELECT enabled_at FROM user_security WHERE user_id=$1', [user.id]);
      if (!code) {
        const jar = await cookies();
        jar.delete('nexus_session');
        if (enroll && !factor?.enabled_at) {
          await authenticateDecision(db, user, password);
          const secret = newTotpSecret();
          await db.query(
            "UPDATE user_security SET pending_ciphertext=$2,pending_expires_at=now()+interval '10 minutes' WHERE user_id=$1 AND enabled_at IS NULL",
            [user.id, encryptSecret(secret, user.id, 'totp')],
          );
          return Response.json(
            {
              mfaRequired: true,
              setupRequired: true,
              secret,
              qrCode: await totpQrCode(secret, user.email),
            },
            { headers: { 'Cache-Control': 'no-store' } },
          );
        }
        return Response.json(
          { mfaRequired: true, setupRequired: !factor?.enabled_at },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      await authenticateDecision(db, user, password, code, factor?.enabled_at ? 'totp' : 'confirm');
      const {
        rows: [current],
      } = await db.query('SELECT enabled_at FROM user_security WHERE user_id=$1', [user.id]);
      factorEnabledAt = new Date(current.enabled_at).toISOString();
    }
    const token = randomBytes(32).toString('hex');
    await transaction(async (c) => {
      const {
        rows: [fresh],
      } = await c.query(
        'SELECT active,password_pending,password_hash FROM users WHERE id=$1 FOR SHARE',
        [user.id],
      );
      if (!fresh?.active || fresh.password_pending || fresh.password_hash !== user.password_hash)
        throw new HttpError(401, 'Conta indisponível ou senha alterada. Entre novamente.');
      if (mfa) {
        const {
          rows: [factor],
        } = await c.query('SELECT enabled_at FROM user_security WHERE user_id=$1 FOR SHARE', [
          user.id,
        ]);
        if (!factor?.enabled_at || new Date(factor.enabled_at).toISOString() !== factorEnabledAt)
          throw new HttpError(401, 'Autenticador alterado. Entre novamente.');
      }
      await c.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at,mfa_verified_at,factor_enabled_at) VALUES($1,$2,now()+interval '8 hours',$3,$4)",
        [digest(token), user.id, mfa ? new Date() : null, factorEnabledAt],
      );
    });
    (await cookies()).set('nexus_session', token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 28800,
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
