import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedMenus, canViewAudit, companyManager, canRemovePt } from '../src/lib/permissions';

await test('PT em rascunho: autor e admins responsáveis podem excluir, sem atravessar contratadas', () => {
  const user = { id: 'person', platform_admin: false };
  const document = { kind: 'PT', status: 'rascunho', created_by: 'author', contractor_id: 'own' };
  for (const role of ['executante', 'gestor', 'seguranca_trabalho', 'aprovador'])
    assert.equal(canRemovePt(user, { role }, document), false);
  assert(canRemovePt({ ...user, id: 'author' }, { role: 'executante' }, document));
  assert(canRemovePt(user, { role: 'admin' }, document));
  assert(canRemovePt(user, { role: 'admin', company_admin: true }, document));
  assert(canRemovePt(user, { role: 'gestor', contractor_id: 'own' }, document));
  assert(canRemovePt(user, { role: 'admin', contractor_id: 'own' }, document));
  assert(!canRemovePt(user, { role: 'admin', contractor_id: 'other' }, document));
  assert(canRemovePt(user, { role: 'admin_contratada', contractor_id: 'own' }, document));
  assert(!canRemovePt(user, { role: 'gestor', contractor_id: 'other' }, document));
  assert(
    !canRemovePt(
      { ...user, id: 'author' },
      { role: 'executante', contractor_id: 'other' },
      document,
    ),
  );
  for (const status of ['em_aprovacao', 'aprovado', 'rejeitado', 'encerrado']) {
    const changed = { ...document, status };
    assert(!canRemovePt({ ...user, id: 'author' }, { role: 'executante' }, changed));
    assert(!canRemovePt(user, { role: 'admin', company_admin: true }, changed));
    assert(!canRemovePt(user, { role: 'gestor', contractor_id: 'own' }, changed));
    assert(canRemovePt({ ...user, platform_admin: true }, { role: 'admin' }, changed));
  }
  assert(
    !canRemovePt(
      { ...user, platform_admin: true },
      { role: 'admin' },
      { ...document, kind: 'APR' },
    ),
  );
});

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
  assert(allowedMenus(ordinary, { role: 'gestor', contractor_id: 'external' }).includes('team'));
});
