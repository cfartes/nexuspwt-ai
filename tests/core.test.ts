import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, assertOrigin } from '../src/lib/security';
import { documentSchema, submissionErrors, type DocumentInput } from '../src/lib/validation';
import { visibleSections } from '../src/lib/forms';
const draft = (): DocumentInput => ({
  id: randomUUID(),
  unitId: randomUUID(),
  contractorId: randomUUID(),
  kind: 'APR',
  title: 'Manutenção do telhado',
  location: 'Área de produção',
  startsAt: '2026-11-17',
  endsAt: '2026-11-20',
  aprId: null,
  version: 0,
  data: {
    answers: {},
    types: [],
    ppe: [],
    risks: [
      {
        activity: 'Acessar cobertura',
        tools: 'PEMT',
        risks: 'Queda',
        sif: 'Potencial',
        controls: 'Ancoragem e isolamento',
        needsPt: true,
      },
    ],
    executors: [],
  },
});
await test('senhas têm salt individual e não aceitam senha incorreta', () => {
  const first = hashPassword('senha-individual-123');
  assert.notEqual(first, hashPassword('senha-individual-123'));
  assert.equal(verifyPassword('senha-individual-123', first), true);
  assert.equal(verifyPassword('outra-senha', first), false);
  assert.equal(verifyPassword('senha', 'inválido'), false);
});
await test('origem externa não pode efetuar alterações autenticadas', () => {
  process.env.APP_URL = 'https://nexus.example';
  assert.throws(() =>
    assertOrigin(
      new Request('https://nexus.example/api/documents', {
        headers: { origin: 'https://externo.example' },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    assertOrigin(
      new Request('https://nexus.example/api/documents', {
        headers: { origin: 'https://nexus.example' },
      }),
    ),
  );
});
await test('risco sem controle e datas invertidas impedem salvar', () => {
  const d = draft();
  assert.equal(documentSchema.safeParse(d).success, true);
  d.data.risks[0].controls = '';
  assert.equal(documentSchema.safeParse(d).success, false);
  d.data.risks[0].controls = 'Isolar';
  d.endsAt = '2026-11-16';
  assert.equal(documentSchema.safeParse(d).success, false);
});
await test('PT precisa de APR e APR não vincula outra APR', () => {
  const d = draft();
  d.kind = 'PT';
  assert.equal(documentSchema.safeParse(d).success, false);
  d.aprId = randomUUID();
  assert.equal(documentSchema.safeParse(d).success, true);
  d.kind = 'APR';
  assert.equal(documentSchema.safeParse(d).success, false);
});
await test('checklists aparecem pelo tipo e bloqueio de energia', () => {
  const sections = visibleSections(['Trabalho em altura', 'Substâncias perigosas'], {
    's11.q9': 'Sim',
  }).map((s) => s.id);
  assert(sections.includes('s13'));
  assert(sections.includes('s15'));
  assert(sections.includes('s17'));
  assert(!sections.includes('s12'));
  assert(!sections.includes('s14'));
});
await test('APR incompleta não pode ir para análise', () => {
  const d = draft();
  assert.deepEqual(submissionErrors(d), []);
  d.data.risks = [];
  assert(submissionErrors(d).length > 0);
});
