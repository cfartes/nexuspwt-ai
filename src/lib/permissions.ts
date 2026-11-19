export const roleLabels: Record<string, string> = {
  admin_empresa: 'Admin da empresa',
  admin: 'Admin da unidade',
  gestor: 'Gestor',
  seguranca_trabalho: 'Segurança do Trabalho',
  aprovador: 'Aprovador',
  executante: 'Executante',
  admin_contratada: 'Responsável da contratada',
};
export type AccessUnit = { role: string; company_admin?: boolean; contractor_id?: string | null };
export const companyManager = (user: { platform_admin: boolean }, unit: AccessUnit) =>
  user.platform_admin || !!unit.company_admin;
export const canViewAudit = (unit: AccessUnit) => !!unit.company_admin;
export function allowedMenus(user: { platform_admin: boolean }, unit: AccessUnit) {
  const menus = ['overview', 'APR', 'PT', 'account'];
  if (unit.role === 'admin_contratada') return ['team', 'account'];
  if (['admin', 'gestor'].includes(unit.role) && !unit.contractor_id) menus.push('team');
  if (unit.role !== 'executante') menus.push('approvals');
  if (['admin', 'gestor', 'seguranca_trabalho'].includes(unit.role)) menus.push('contractors');
  if (unit.role === 'admin') menus.push('people', 'approvers', 'regions', 'units', 'companies');
  if (companyManager(user, unit)) menus.push('settings');
  if (canViewAudit(unit)) menus.push('audit');
  return menus;
}
export const ACCESS_POLICY_VERSION = 4;
