import test from 'node:test';
import assert from 'node:assert/strict';
import { ptToday, ptCreationError, ptAprError, ptAprPeriodError } from '../src/lib/pt-calendar';

await test('PT só permite emissão hoje em Brasília, inclusive perto da meia-noite UTC', () => {
  const now = new Date('2026-11-25T01:30:00Z');
  assert.equal(ptToday(now), '2026-11-24');
  assert.equal(ptCreationError('2026-11-24', now), null);
  assert(ptCreationError('2026-11-23', now));
  assert(ptCreationError('2026-11-25', now));
  assert.equal(ptToday(new Date('2026-11-25T03:00:00Z')), '2026-11-25');
});

await test('PT exige APR aprovada e emissão dentro do período, incluindo as datas inicial e final', () => {
  const apr = {
    kind: 'APR',
    status: 'aprovado',
    starts_at: '2026-11-25T00:00:00Z',
    ends_at: '2026-11-30T00:00:00Z',
  };
  assert.match(ptAprError(undefined, '2026-11-25')!, /obrigatório selecionar uma APR/);
  assert.match(ptAprError({ ...apr, kind: 'PT' }, '2026-11-25')!, /APR/);
  assert.match(ptAprError({ ...apr, status: 'rascunho' }, '2026-11-25')!, /aprovada/);
  assert.match(ptAprError(apr, '2026-11-24')!, /25\/11\/2026/);
  assert.equal(ptAprError(apr, '2026-11-25'), null);
  assert.equal(ptAprError(apr, '2026-11-27'), null);
  assert.equal(ptAprError(apr, '2026-11-30'), null);
  assert.match(ptAprError(apr, '2026-12-01')!, /30\/11\/2026/);
  assert.equal(ptAprPeriodError('2026-11-25', '2026-11-25', '2026-11-25'), null);
  const beforeMidnight = new Date('2026-11-25T01:30:00Z');
  assert(ptAprError(apr, ptToday(beforeMidnight)));
  assert.equal(ptAprError(apr, ptToday(new Date('2026-11-25T03:00:00Z'))), null);
});
