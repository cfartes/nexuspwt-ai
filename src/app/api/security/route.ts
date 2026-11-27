import { z } from 'zod';
import { currentUser, unitAccess } from '@/lib/auth';
import { db, transaction } from '@/lib/db';
import { assertOrigin, HttpError } from '@/lib/security';
import { apiError, readJsonBody } from '@/lib/http';
import { encryptSecret } from '@/lib/integrations';
import { newTotpSecret } from '@/lib/totp';
import { totpQrCode } from '@/lib/totp-qr';
import { authenticateDecision, recordIdentity } from '@/lib/approval-security';
import { companyManager } from '@/lib/permissions';
import { sessionEvidence } from '@/lib/session-security';
import { cookies } from 'next/headers';
import { digest } from '@/lib/security';

const schema = z
  .object({
    action: z.enum(['begin', 'confirm', 'policy', 'verify', 'reset']),
    unitId: z.uuid(),
    password: z.string().max(256).default(''),
    code: z
      .string()
      .regex(/^$|^\d{6}$/)
      .default(''),
    userId: z.uuid().optional(),
    cpf: z
      .string()
      .regex(/^\d{11}$/)
      .optional(),
    reference: z.string().trim().min(5).max(500).optional(),
    confirmed: z.boolean().optional(),
    required: z.boolean().optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const unit = await unitAccess(
      user,
      z.uuid().parse(new URL(request.url).searchParams.get('unit')),
    );
    const {
      rows: [company],
    } = await db.query(
      'SELECT approval_mfa_required required,security_version version FROM companies WHERE id=$1',
      [unit.company_id],
    );
    const {
      rows: [self],
    } = await db.query('SELECT enabled_at FROM user_security WHERE user_id=$1', [user.id]);
    return Response.json(
      { ...company, enabled: !!self?.enabled_at },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const input = schema.parse(await readJsonBody(request));
    const admin = ['policy', 'verify', 'reset'].includes(input.action);
    const unit = await unitAccess(user, input.unitId, admin ? ['admin'] : undefined);
    if (['policy', 'reset'].includes(input.action) && !companyManager(user, unit))
      throw new HttpError(403, 'Operação restrita ao Admin da empresa.');
    const {
      rows: [policy],
    } = await db.query(
      'SELECT approval_mfa_required required,security_version version FROM companies WHERE id=$1',
      [unit.company_id],
    );
    if (input.action === 'policy' && (input.required === undefined || input.version === undefined))
      throw new HttpError(400, 'Informe a configuração e sua versão.');
    if (
      ['verify', 'reset'].includes(input.action) &&
      (!input.userId || !input.reference || !input.confirmed || input.version === undefined)
    )
      throw new HttpError(400, 'Confirme a conferência humana e informe a referência.');
    if (input.action === 'verify' && !input.cpf)
      throw new HttpError(400, 'Informe o CPF conferido.');
    const evidence =
      input.action === 'verify' && !input.password
        ? sessionEvidence(user)
        : await authenticateDecision(
            db,
            user,
            input.password,
            input.code,
            input.action === 'confirm'
              ? 'confirm'
              : admin && !user.platform_admin && (policy.required || input.required === true)
                ? 'totp'
                : 'password',
          );
    let secret: string | undefined;
    if (input.action !== 'confirm')
      await transaction(async (c) => {
        if (input.action === 'reset')
          await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `authenticator-reset:${input.userId}`,
          ]);
        const freshUnit = await unitAccess(user, unit.id, admin ? ['admin'] : undefined, c);
        if (['policy', 'reset'].includes(input.action) && !companyManager(user, freshUnit))
          throw new HttpError(403, 'Operação restrita ao Admin da empresa.');
        const {
          rows: [current],
        } = await c.query(
          'SELECT approval_mfa_required required,security_version version FROM companies WHERE id=$1 FOR UPDATE',
          [unit.company_id],
        );
        if (
          admin &&
          !user.platform_admin &&
          current.required &&
          evidence.method !== 'password_totp'
        )
          throw new HttpError(409, 'A política mudou. Confirme novamente com o autenticador.');
        if (admin && !user.platform_admin && (current.required || input.required === true)) {
          const {
            rows: [factor],
          } = await c.query('SELECT enabled_at FROM user_security WHERE user_id=$1 FOR SHARE', [
            user.id,
          ]);
          if (
            !factor?.enabled_at ||
            new Date(factor.enabled_at).toISOString() !== evidence.enabledAt
          )
            throw new HttpError(409, 'Autenticador alterado. Confirme sua identidade novamente.');
        }
        if (input.action === 'begin') {
          const {
            rows: [self],
          } = await c.query('SELECT enabled_at FROM user_security WHERE user_id=$1 FOR UPDATE', [
            user.id,
          ]);
          if (self.enabled_at) throw new HttpError(409, 'Seu autenticador já está configurado.');
          secret = newTotpSecret();
          await c.query(
            "UPDATE user_security SET pending_ciphertext=$2,pending_expires_at=now()+interval '10 minutes' WHERE user_id=$1",
            [user.id, encryptSecret(secret, user.id, 'totp')],
          );
        } else if (input.action === 'policy') {
          if (current.version !== input.version)
            throw new HttpError(409, 'Configuração alterada. Recarregue antes de salvar.');
          await c.query(
            'UPDATE companies SET approval_mfa_required=$2,security_version=security_version+1 WHERE id=$1',
            [unit.company_id, input.required],
          );
          if (evidence.method === 'password_totp') {
            const token = (await cookies()).get('nexus_session')?.value;
            if (token)
              await c.query(
                'UPDATE sessions SET mfa_verified_at=now(),factor_enabled_at=$2 WHERE token_hash=$1',
                [digest(token), evidence.enabledAt],
              );
          }
          await c.query(
            "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'seguranca.politica_atualizada',$2)",
            [
              user.id,
              JSON.stringify({
                companyId: unit.company_id,
                required: input.required,
                method: evidence.method,
              }),
            ],
          );
        } else if (input.action === 'verify') {
          await recordIdentity(
            c,
            user,
            unit.id,
            input.userId!,
            input.cpf!,
            input.reference!,
            input.version!,
          );
        } else if (input.action === 'reset') {
          if (input.userId === user.id)
            throw new HttpError(403, 'Outro administrador deve realizar a recuperação assistida.');
          const {
            rows: [target],
          } = await c.query(
            'SELECT u.platform_admin,m.version FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.unit_id=$2 AND u.active AND m.active FOR UPDATE OF m',
            [input.userId, unit.id],
          );
          if (!target || (target.platform_admin && !user.platform_admin))
            throw new HttpError(403, 'Conta indisponível.');
          if (target.version !== input.version)
            throw new HttpError(409, 'Cadastro alterado. Recarregue antes de recuperar o acesso.');
          await c.query(
            'SELECT unit_id FROM memberships WHERE user_id=$1 ORDER BY unit_id FOR UPDATE',
            [input.userId],
          );
          await c.query(
            'UPDATE user_security SET secret_ciphertext=NULL,enabled_at=NULL,last_step=-1,pending_ciphertext=NULL,pending_expires_at=NULL WHERE user_id=$1',
            [input.userId],
          );
          await c.query(
            'UPDATE memberships SET identity_verified_at=NULL,identity_verified_by=NULL,identity_snapshot=NULL,version=version+1 WHERE user_id=$1',
            [input.userId],
          );
          await c.query('DELETE FROM sessions WHERE user_id=$1', [input.userId]);
          await c.query(
            "INSERT INTO audit_events(actor_id,action,details) VALUES($1,'seguranca.recuperacao_assistida',$2)",
            [
              user.id,
              JSON.stringify({
                userId: input.userId,
                unitId: unit.id,
                reference: input.reference,
                method: evidence.method,
              }),
            ],
          );
        }
      });
    return Response.json(
      { ok: true, ...(secret ? { secret, qrCode: await totpQrCode(secret, user.email) } : {}) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
