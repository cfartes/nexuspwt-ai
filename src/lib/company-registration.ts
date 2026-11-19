import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { User } from './auth';
import { HttpError } from './security';
import { companyInput } from './companies';

export async function saveCompany(
  c: PoolClient,
  actor: User,
  input: z.infer<typeof companyInput>,
  existing?: { id: string; version: number },
) {
  const { rowCount: companyAdmin } =
    existing && !actor.platform_admin
      ? await c.query(
          'SELECT 1 FROM company_admins WHERE company_id=$1 AND user_id=$2 AND active',
          [existing.id, actor.id],
        )
      : { rowCount: 0 };
  if (!actor.platform_admin && !companyAdmin)
    throw new HttpError(403, 'Somente o superadmin pode cadastrar ou alterar empresas.');
  const data = companyInput.parse(input);
  if (existing) {
    const {
      rows: [row],
    } = await c.query('SELECT version FROM companies WHERE id=$1 FOR UPDATE', [existing.id]);
    if (!row) throw new HttpError(404, 'Empresa não encontrada.');
    if (row.version !== existing.version)
      throw new HttpError(409, 'Empresa alterada. Atualize a lista antes de salvar.');
  }
  const { rowCount } = await c.query(
    'SELECT 1 FROM companies WHERE cnpj=$1 AND ($2::uuid IS NULL OR id<>$2)',
    [data.cnpj, existing?.id || null],
  );
  if (rowCount) throw new HttpError(409, 'Já existe uma empresa com este CNPJ.');
  const {
    rows: [row],
  } = existing
    ? await c.query(
        'UPDATE companies SET name=$2,cnpj=$3,details=$4,version=version+1 WHERE id=$1 RETURNING id',
        [existing.id, data.name, data.cnpj, JSON.stringify(data.details)],
      )
    : await c.query('INSERT INTO companies(name,cnpj,details) VALUES($1,$2,$3) RETURNING id', [
        data.name,
        data.cnpj,
        JSON.stringify(data.details),
      ]);
  return row.id as string;
}
