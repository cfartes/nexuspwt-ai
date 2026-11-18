import { z } from 'zod';
import { currentUser, unitAccess } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { assertOrigin, hashPassword, HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { uuid } from '@/lib/validation';
import { aprProfiles, ptProfiles } from '@/lib/forms';
import { saveMembership } from '@/lib/memberships';
import { whatsappChatId } from '@/lib/openwa';
import {
  eligibleApprover,
  grantRegionalAccess,
  updateApprover,
  reassignApproval,
} from '@/lib/approvers';
const name = z.string().trim().min(2).max(200);
const phone = z
  .string()
  .trim()
  .max(25)
  .refine((value) => {
    try {
      whatsappChatId(value);
      return true;
    } catch {
      return false;
    }
  }, 'Informe telefone internacional com DDI e DDD.');
const role = z.enum(['admin', 'gestor', 'aprovador', 'executante']);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('company'), unitId: uuid, name }),
  z.object({ action: z.literal('region'), unitId: uuid, name }),
  z.object({
    action: z.literal('unit'),
    unitId: uuid,
    name,
    kind: z.enum(['CDD', 'Fábrica', 'Escritório']),
    regionId: uuid.nullable(),
  }),
  z.object({
    action: z.literal('contractor'),
    unitId: uuid,
    name,
    cnpj: z.string().regex(/^\d{14}$/, 'Informe 14 dígitos.'),
  }),
  z.object({ action: z.literal('linkContractor'), unitId: uuid, contractorId: uuid }),
  z.object({
    action: z.literal('user'),
    unitId: uuid,
    name,
    email: z.email().transform((v) => v.toLowerCase()),
    phone,
    password: z.string().min(12).max(256),
    role,
    contractorId: uuid.nullable().default(null),
  }),
  z.object({
    action: z.literal('membership'),
    unitId: uuid,
    email: z.email().transform((v) => v.toLowerCase()),
    role,
    contractorId: uuid.nullable().default(null),
  }),
  z
    .object({
      action: z.literal('updateMembership'),
      unitId: uuid,
      userId: uuid,
      version: z.number().int().positive(),
      role,
      active: z.boolean(),
      contractorId: uuid.nullable(),
      phone: z.union([phone, z.literal('')]),
    })
    .strict(),
  z.object({
    action: z.literal('approver'),
    unitId: uuid,
    userId: uuid,
    kind: z.enum(['APR', 'PT']),
    profile: name,
    scope: z.enum(['unit', 'region']),
  }),
  z
    .object({
      action: z.literal('updateApprover'),
      unitId: uuid,
      id: uuid,
      version: z.number().int().positive(),
      userId: uuid,
      active: z.boolean(),
      reason: z.string().trim().min(3).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal('reassignApproval'),
      unitId: uuid,
      id: uuid,
      assignmentVersion: z.number().int().positive(),
      userId: uuid,
      reason: z.string().trim().min(3).max(2000),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    const input = schema.parse(await request.json());
    const unit = await unitAccess(user, input.unitId, ['admin']);
    await transaction(async (c) => {
      // Serialize shared access/configuration changes before taking individual unit or membership locks.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `company-access:${unit.company_id}`,
      ]);
      await unitAccess(user, unit.id, ['admin'], c);
      const company = unit.company_id;
      switch (input.action) {
        case 'company': {
          if (!user.platform_admin)
            throw new HttpError(
              403,
              'Cadastro de empresa restrito ao administrador da plataforma.',
            );
          const {
            rows: [co],
          } = await c.query('INSERT INTO companies(name) VALUES($1) RETURNING id', [input.name]);
          const {
            rows: [u],
          } = await c.query(
            "INSERT INTO units(company_id,name,kind) VALUES($1,'Unidade inicial','Escritório') RETURNING id",
            [co.id],
          );
          await c.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
            user.id,
            u.id,
          ]);
          break;
        }
        case 'region':
          await c.query('INSERT INTO regions(company_id,name) VALUES($1,$2)', [
            company,
            input.name,
          ]);
          break;
        case 'unit': {
          const {
            rows: [u],
          } = await c.query(
            'INSERT INTO units(company_id,name,kind,region_id) VALUES($1,$2,$3,$4) RETURNING id',
            [company, input.name, input.kind, input.regionId],
          );
          await c.query("INSERT INTO memberships(user_id,unit_id,role) VALUES($1,$2,'admin')", [
            user.id,
            u.id,
          ]);
          await c.query(
            "INSERT INTO memberships(user_id,unit_id,role) SELECT DISTINCT user_id,$1::uuid,'aprovador' FROM approvers WHERE region_id=$2 AND active ON CONFLICT DO NOTHING",
            [u.id, input.regionId],
          );
          break;
        }
        case 'contractor': {
          const {
            rows: [co],
          } = await c.query(
            'INSERT INTO contractors(company_id,name,cnpj) VALUES($1,$2,$3) ON CONFLICT(company_id,cnpj) DO UPDATE SET name=contractors.name RETURNING id',
            [company, input.name, input.cnpj],
          );
          await c.query('INSERT INTO contractor_units VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [
            company,
            co.id,
            unit.id,
          ]);
          break;
        }
        case 'linkContractor':
          await c.query('INSERT INTO contractor_units VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [
            company,
            input.contractorId,
            unit.id,
          ]);
          break;
        case 'user': {
          const {
            rows: [u],
          } = await c.query(
            'INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id',
            [input.name, input.email, input.phone, hashPassword(input.password)],
          );
          await saveMembership(c, user, unit.id, u.id, input);
          break;
        }
        case 'membership': {
          // Existing accounts must already belong to this company; prevents inviting an unrelated account by guessing its email.
          const {
            rows: [u],
          } = await c.query(
            'SELECT u.id FROM users u WHERE u.email=$1 AND EXISTS(SELECT 1 FROM memberships m JOIN units un ON un.id=m.unit_id WHERE m.user_id=u.id AND un.company_id=$2)',
            [input.email, company],
          );
          if (!u) throw new HttpError(404, 'Usuário não encontrado nesta empresa.');
          await saveMembership(c, user, unit.id, u.id, input);
          break;
        }
        case 'updateMembership': {
          await saveMembership(c, user, unit.id, input.userId, input);
          break;
        }
        case 'approver': {
          if (!(input.kind === 'APR' ? aprProfiles : ptProfiles).includes(input.profile))
            throw new HttpError(400, 'Perfil de aprovação inválido.');
          if (input.scope === 'region' && !unit.region_id)
            throw new HttpError(400, 'Esta unidade não pertence a uma regional.');
          if (input.scope === 'region' && !user.platform_admin)
            throw new HttpError(
              403,
              'Atribuições regionais são gerenciadas pelo administrador da plataforma.',
            );
          await eligibleApprover(c, input.userId, unit.id, input.scope === 'region');
          await c.query(
            'INSERT INTO approvers(company_id,unit_id,region_id,user_id,kind,profile) VALUES($1,$2,$3,$4,$5,$6)',
            [
              company,
              input.scope === 'unit' ? unit.id : null,
              input.scope === 'region' ? unit.region_id : null,
              input.userId,
              input.kind,
              input.profile,
            ],
          );
          if (input.scope === 'region') await grantRegionalAccess(c, input.userId, unit.region_id);
          break;
        }
        case 'updateApprover':
          await updateApprover(c, user, unit.id, input);
          break;
        case 'reassignApproval':
          await reassignApproval(c, user, unit.id, input);
          break;
      }
      await c.query('INSERT INTO audit_events(actor_id,action,details) VALUES($1,$2,$3)', [
        user.id,
        `cadastro.${input.action}`,
        JSON.stringify({ unitId: unit.id }),
      ]);
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
