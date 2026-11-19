export const roleLabels: Record<string, string> = {
  admin_empresa: 'Admin da empresa',
  admin: 'Admin da unidade',
  gestor: 'Gestor',
  seguranca_trabalho: 'Segurança do Trabalho',
  aprovador: 'Aprovador',
  executante: 'Executante',
};
export type AccessUnit = { role: string; company_admin?: boolean };
export const companyManager = (user: { platform_admin: boolean }, unit: AccessUnit) =>
  user.platform_admin || !!unit.company_admin;
export function allowedMenus(user: { platform_admin: boolean }, unit: AccessUnit) {
  const menus = ['overview', 'APR', 'PT', 'account'];
  if (unit.role !== 'executante') menus.push('approvals');
  if (['admin', 'gestor', 'seguranca_trabalho'].includes(unit.role)) menus.push('contractors');
  if (unit.role === 'admin') menus.push('people', 'approvers', 'regions', 'units', 'companies');
  if (companyManager(user, unit)) menus.push('settings');
  return menus;
}
export const ACCESS_POLICY_VERSION = 2;
