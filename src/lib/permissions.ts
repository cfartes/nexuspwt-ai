import { isContractorManager, contractorRoleLabels } from './contractorRoles';
export const roleLabels: Record<string, string> = {
  admin_empresa: 'Admin da empresa',
  admin: 'Admin da unidade',
  gestor: 'Gestor',
  seguranca_trabalho: 'Segurança do Trabalho',
  aprovador: 'Aprovador',
  executante: 'Executante',
  admin_contratada: 'Responsável da contratada',
};
export type AccessUnit = {
  role: string;
  company_admin?: boolean;
  contractor_id?: string | null;
  identity_upload_enabled?: boolean;
};
export const companyManager = (user: { platform_admin: boolean }, unit: AccessUnit) =>
  user.platform_admin || !!unit.company_admin;
export const canViewAudit = (unit: AccessUnit) => !!unit.company_admin;
export function canRemovePt(
  user: { id: string; platform_admin: boolean },
  unit: AccessUnit,
  document: { kind: string; status: string; created_by: string; contractor_id: string },
) {
  if (
    document.kind !== 'PT' ||
    (unit.contractor_id && unit.contractor_id !== document.contractor_id)
  )
    return false;
  if (user.platform_admin) return true;
  return (
    document.status === 'rascunho' &&
    (document.created_by === user.id ||
      !!unit.company_admin ||
      unit.role === 'admin' ||
      isContractorManager(unit))
  );
}
export function allowedMenus(user: { platform_admin: boolean }, unit: AccessUnit) {
  const menus = ['overview', 'APR', 'PT', 'account'];
  const personal = unit.identity_upload_enabled && unit.contractor_id ? ['identity'] : [];
  if (unit.role === 'admin_contratada') return ['team', 'account', ...personal];
  if (isContractorManager(unit)) menus.push('team');
  menus.push(...personal);
  if (['admin', 'gestor'].includes(unit.role) && !unit.contractor_id) menus.push('team');
  if (unit.role !== 'executante') menus.push('approvals');
  if (['admin', 'gestor', 'seguranca_trabalho'].includes(unit.role)) menus.push('contractors');
  if (unit.role === 'admin') menus.push('people', 'approvers', 'regions', 'units', 'companies');
  if (companyManager(user, unit)) menus.push('settings');
  if (canViewAudit(unit)) menus.push('audit');
  return menus;
}
export const ACCESS_POLICY_VERSION = 6;
export function personRoleLabel(role: string, contractorId?: string | null): string {
  if (contractorId && role in contractorRoleLabels)
    return contractorRoleLabels[role as keyof typeof contractorRoleLabels];
  if (contractorId && role === 'admin_contratada') return 'Gestor Contratada (legado)';
  return roleLabels[role] || role;
}
