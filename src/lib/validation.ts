import { z } from 'zod';
import { permissionTypes, ppeOptions, visibleSections } from './forms';
export const uuid = z.uuid();
const text = z.string().trim().max(10000);
export const riskSchema = z.object({
  activity: text,
  tools: text,
  risks: text,
  sif: z.enum(['N/A', 'Precursor', 'Potencial', 'Real']),
  controls: text,
  needsPt: z.boolean(),
});
export const documentSchema = z
  .object({
    id: uuid,
    unitId: uuid,
    contractorId: uuid,
    kind: z.enum(['APR', 'PT']),
    title: z.string().trim().min(3).max(500),
    location: z.string().trim().min(2).max(500),
    startsAt: z.iso.date(),
    endsAt: z.iso.date(),
    aprId: uuid.nullable(),
    version: z.number().int().min(0),
    data: z.object({
      answers: z.record(z.string().max(100), text),
      types: z.array(z.enum(permissionTypes as [string, ...string[]])).max(10),
      ppe: z.array(z.enum(ppeOptions as [string, ...string[]])).max(30),
      risks: z.array(riskSchema).max(100),
      executors: z.array(z.object({ userId: uuid, role: z.string().trim().max(200) })).max(100),
    }),
  })
  .superRefine((d, ctx) => {
    if (d.endsAt < d.startsAt)
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Término anterior ao início.' });
    if (d.kind === 'PT' && !d.aprId)
      ctx.addIssue({ code: 'custom', path: ['aprId'], message: 'Vincule uma APR.' });
    if (d.kind === 'APR' && d.aprId)
      ctx.addIssue({
        code: 'custom',
        path: ['aprId'],
        message: 'APR não pode vincular outra APR.',
      });
    d.data.risks.forEach((r, i) => {
      if (r.risks && !r.controls)
        ctx.addIssue({
          code: 'custom',
          path: ['data', 'risks', i, 'controls'],
          message: 'Risco informado exige medida de controle.',
        });
    });
  });
export type DocumentInput = z.infer<typeof documentSchema>;
export function submissionErrors(d: DocumentInput): string[] {
  const errors: string[] = [];
  if (d.kind === 'APR') {
    if (!d.data.risks.length) errors.push('Informe pelo menos uma etapa na APR.');
    if (d.data.risks.some((r) => !r.activity || !r.risks || !r.controls))
      errors.push('Complete atividade, risco e controle em todas as etapas.');
  } else {
    if (!d.data.types.length) errors.push('Selecione o tipo de trabalho.');
    if (!d.data.executors.length) errors.push('Vincule pelo menos um executante.');
    for (const s of visibleSections(d.data.types, d.data.answers).filter(
      (s) => !['general', 's19', 's21', 's22'].includes(s.id),
    )) {
      for (const f of s.fields.filter((f) => f.type === 'answer')) {
        const value = d.data.answers[`${s.id}.${f.key}`];
        if (!['Sim', 'Não', 'N/A'].includes(value)) errors.push(`Responda: ${f.label}`);
      }
    }
  }
  return errors;
}
