import type { PoolClient } from 'pg';
import type { DocumentInput } from './validation';
import { uuid } from './validation';
import { aprProfiles } from './forms';
import { HttpError } from './security';

export async function aprResponsibles(c: PoolClient, d: DocumentInput, required = false) {
  const people: { profile: string; user_id: string }[] = [];
  if (d.kind !== 'APR') return people;
  for (const [index, prefix] of ['company', 'safety'].entries()) {
    const id = d.data.answers[`${prefix}UserId`];
    if (!id && !required) continue;
    if (!uuid.safeParse(id).success)
      throw new HttpError(400, 'Selecione os responsáveis da contratada no cadastro de pessoas.');
    const {
      rows: [person],
    } = await c.query(
      `SELECT u.id,u.name,COALESCE(m.phone,u.phone) phone,m.role FROM users u JOIN memberships m ON m.user_id=u.id
       WHERE u.id=$1 AND m.unit_id=$2 AND m.contractor_id=$3 AND u.active AND m.active
       AND m.role IN ('admin','gestor','aprovador','seguranca_trabalho') FOR SHARE OF u,m`,
      [id, d.unitId, d.contractorId],
    );
    if (!person)
      throw new HttpError(
        400,
        'Responsável deve estar ativo, habilitado para aprovação e vinculado à contratada nesta unidade.',
      );
    if (prefix === 'safety' && person.role !== 'seguranca_trabalho')
      throw new HttpError(
        400,
        'Selecione uma pessoa com perfil Segurança do Trabalho para a segurança da contratada.',
      );
    if (!person.phone)
      throw new HttpError(400, 'Informe o telefone do responsável em Pessoas e acessos.');
    d.data.answers[`${prefix}Owner`] = person.name;
    d.data.answers[`${prefix}Phone`] = person.phone;
    people.push({ profile: aprProfiles[index], user_id: person.id });
  }
  return people;
}
