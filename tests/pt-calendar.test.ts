import test from 'node:test';
import assert from 'node:assert/strict';
import { ptToday, ptCreationError } from '../src/lib/pt-calendar';

await test('PT só permite emissão hoje em Brasília, inclusive perto da meia-noite UTC', () => {
  const now = new Date('2026-11-25T01:30:00Z');
  assert.equal(ptToday(now), '2026-11-24');
  assert.equal(ptCreationError('2026-11-24', now), null);
  assert(ptCreationError('2026-11-23', now));
  assert(ptCreationError('2026-11-25', now));
  assert.equal(ptToday(new Date('2026-11-25T03:00:00Z')), '2026-11-25');
});
