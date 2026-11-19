import { z } from 'zod';
import { contractorDetails } from './contractors';

export const companyDetails = contractorDetails
  .extend({
    contactName: z.string().trim().min(2).max(200),
    email: z.email().max(254),
    phone: contractorDetails.shape.phone.refine(
      (v) => v.replace(/\D/g, '').length >= 10,
      'Informe telefone com DDD.',
    ),
    cep: z.string().regex(/^\d{8}$/, 'Informe um CEP de 8 dígitos.'),
    street: z.string().trim().min(2).max(200),
    number: z.string().trim().min(1).max(30),
    district: z.string().trim().min(2).max(200),
    city: z.string().trim().min(2).max(200),
    state: contractorDetails.shape.state.refine(Boolean, 'Informe a UF.'),
    municipalRegistration: z.string().trim().max(50).default(''),
    stateRegistration: z.string().trim().max(50).default(''),
    municipalityCode: z
      .string()
      .regex(/^$|^\d{7}$/, 'Código IBGE deve ter 7 dígitos.')
      .default(''),
    billingEmail: z.union([z.email().max(254), z.literal('')]).default(''),
  })
  .strict();
export const companyInput = z
  .object({
    name: z.string().trim().min(2).max(200),
    cnpj: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{12}\d{2}$/, 'Informe o CNPJ com 14 posições, sem pontuação.'),
    details: companyDetails,
  })
  .strict();
export type CompanyDetails = z.infer<typeof companyDetails>;
export type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  details: Partial<CompanyDetails>;
  version: number;
};
