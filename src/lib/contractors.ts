import { z } from 'zod';
const text = z.string().trim().max(200).default('');
export const contractorDetails = z
  .object({
    tradeName: text,
    contactName: text,
    phone: z
      .string()
      .trim()
      .max(25)
      .regex(/^$|^\+?[\d ()-]{8,25}$/, 'Telefone inválido.')
      .default(''),
    email: z.union([z.email().max(254), z.literal('')]).default(''),
    cep: z
      .string()
      .regex(/^$|^\d{8}$/, 'Informe um CEP de 8 dígitos.')
      .default(''),
    street: text,
    number: z.string().trim().max(30).default(''),
    complement: text,
    district: text,
    city: text,
    state: z
      .string()
      .regex(
        /^$|^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
        'UF inválida.',
      )
      .default(''),
  })
  .strict();
export type ContractorDetails = z.infer<typeof contractorDetails>;
