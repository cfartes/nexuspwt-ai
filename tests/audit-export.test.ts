import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { writeAuditExport } from '../src/lib/audit-export';
import { auditDetailFields, type AuditEvent } from '../src/lib/audit';

await test('auditoria: XLSX real com todos os campos e valores literais; PDF paginado e acentuado', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexus-audit-test-'));
  const info = {
    companyName: 'Empresa São Paulo',
    generatedAt: new Date('2026-11-25T01:30:00Z'),
    filters: { from: '2026-11-19' },
  };
  const text = 'Observação extensa — ação preventiva. '.repeat(250);
  async function* events(): AsyncGenerator<AuditEvent> {
    for (let i = 0; i < 57; i++)
      yield {
        id: String(9223372036854775000n + BigInt(i)),
        occurred_at: '2026-11-25T01:30:00Z',
        action: 'workflow.approve',
        actor_id: 'actor-id',
        actor_name: 'João Gonçalves',
        company_id: 'company-id',
        company_name: info.companyName,
        unit_id: 'unit-id',
        unit_name: 'Unidade São Paulo',
        document_id: 'document-id',
        document_kind: 'APR',
        document_number: '123',
        details: {
          reason: '=HYPERLINK("https://example.invalid","teste")',
          active: false,
          version: 0,
          comment: i === 0 ? text : 'Conferência concluída',
          password: 'do-not-export',
        },
      };
  }
  try {
    const xlsx = path.join(directory, 'auditoria.xlsx');
    assert.equal(await writeAuditExport('xlsx', xlsx, events(), info), 57);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsx);
    const sheet = workbook.getWorksheet('Auditoria')!;
    assert.equal(sheet.rowCount, 58);
    assert.equal(sheet.columnCount, 14 + auditDetailFields.length);
    assert.equal(sheet.getCell(2, 1).value, '9223372036854775000');
    const reason = sheet.getCell(2, 15 + auditDetailFields.indexOf('reason'));
    assert.equal(reason.type, ExcelJS.ValueType.String);
    assert.equal(reason.value, '=HYPERLINK("https://example.invalid","teste")');
    assert.equal(sheet.getCell(2, 15 + auditDetailFields.indexOf('active')).value, false);
    assert.equal(sheet.getCell(2, 15 + auditDetailFields.indexOf('version')).value, 0);
    assert.equal(sheet.getCell(2, 15 + auditDetailFields.indexOf('comment')).value, text);
    assert(!JSON.stringify(sheet.getSheetValues()).includes('do-not-export'));
    assert(String(sheet.getCell(2, 2).value).includes('24/11/2026'));
    const pdf = path.join(directory, 'auditoria.pdf');
    assert.equal(await writeAuditExport('pdf', pdf, events(), info), 57);
    const bytes = await readFile(pdf);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert((bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 2);
    const empty = (async function* () {})();
    assert.equal(
      await writeAuditExport('xlsx', path.join(directory, 'empty.xlsx'), empty, info),
      0,
    );
    const fail = (async function* () {
      yield* [];
      throw new Error('source-failed');
    })();
    await assert.rejects(
      writeAuditExport('pdf', path.join(directory, 'failed.pdf'), fail, info),
      /source-failed/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
