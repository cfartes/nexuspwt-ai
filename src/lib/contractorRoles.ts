export const contractorRoleLabels = {
  gestor: 'Gestor Contratada',
  seguranca_trabalho: 'Seg. Trabalho Contratada',
  executante: 'Executor Contratada',
} as const;
export type ContractorRole = keyof typeof contractorRoleLabels;
export const contractorRoleValues = ['gestor', 'seguranca_trabalho', 'executante'] as const;
export const isContractorManager = (unit: { role: string; contractor_id?: string | null }) =>
  !!unit.contractor_id && ['gestor', 'admin_contratada'].includes(unit.role);
