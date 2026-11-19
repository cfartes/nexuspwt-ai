import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedMenus, canViewAudit, companyManager } from '../src/lib/permissions';

await test('menus seguem a matriz e somente administradores da empresa acessam configurações compartilhadas', () => {
  const ordinary = { platform_admin: false };
  for (const role of ['gestor', 'seguranca_trabalho', 'aprovador', 'executante']) {
    const menus = allowedMenus(ordinary, { role });
    assert(menus.includes('account'));
    for (const denied of [
      'people',
      'approvers',
      'regions',
      'units',
      'companies',
      'settings',
      'audit',
    ])
      assert(!menus.includes(denied), `${role}: ${denied}`);
    assert.equal(menus.includes('contractors'), ['gestor', 'seguranca_trabalho'].includes(role));
    assert.equal(menus.includes('approvals'), role !== 'executante');
  }
  assert(!allowedMenus(ordinary, { role: 'admin' }).includes('settings'));
  assert(allowedMenus(ordinary, { role: 'admin', company_admin: true }).includes('settings'));
  assert(companyManager({ platform_admin: true }, { role: 'admin' }));
  assert(!canViewAudit({ role: 'admin' }));
  assert(!allowedMenus({ platform_admin: true }, { role: 'admin' }).includes('audit'));
  assert(allowedMenus(ordinary, { role: 'admin', company_admin: true }).includes('audit'));
  assert.deepEqual(allowedMenus(ordinary, { role: 'admin_contratada', contractor_id: 'own' }), [
    'team',
    'account',
  ]);
  assert(!allowedMenus(ordinary, { role: 'gestor', contractor_id: 'external' }).includes('team'));
});
