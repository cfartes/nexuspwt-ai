import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { auditDetailFields, type AuditEvent } from './audit';
import { auditActionLabels, auditDetailLabels } from './audit-labels';

type ExportInfo = {
  companyName: string;
  generatedAt: Date;
  filters: Record<string, string | undefined>;
};
const localDate = (value: Date | string) =>
  new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const columns = [
  ['Evento — ID', (e: AuditEvent) => e.id],
  ['Data/hora — Brasília', (e: AuditEvent) => localDate(e.occurred_at)],
  ['Data/hora — UTC', (e: AuditEvent) => new Date(e.occurred_at).toISOString()],
  ['Empresa — ID', (e: AuditEvent) => e.company_id],
  ['Empresa', (e: AuditEvent) => e.company_name],
  ['Unidade — ID', (e: AuditEvent) => e.unit_id],
  ['Unidade', (e: AuditEvent) => e.unit_name],
  ['Usuário — ID', (e: AuditEvent) => e.actor_id],
  ['Usuário', (e: AuditEvent) => e.actor_name],
  ['Ação — código', (e: AuditEvent) => e.action],
  ['Ação', (e: AuditEvent) => auditActionLabels[e.action] || e.action],
  ['Documento — ID', (e: AuditEvent) => e.document_id],
  ['Documento — tipo', (e: AuditEvent) => e.document_kind],
  ['Documento — número', (e: AuditEvent) => e.document_number],
  ...auditDetailFields.map(
    (key) =>
      [`${auditDetailLabels[key] || key} — ${key}`, (e: AuditEvent) => e.details[key]] as const,
  ),
] as const;
const filterLabels: Record<string, string> = {
  unit: 'Unidade — filtro',
  actor: 'Usuário — filtro',
  action: 'Ação — filtro',
  from: 'De',
  to: 'Até',
};
function metadata(info: ExportInfo) {
  return [
    ['Empresa', info.companyName],
    ['Exportado em — Brasília', localDate(info.generatedAt)],
    ['Exportado em — UTC', info.generatedAt.toISOString()],
    ...Object.entries(filterLabels).map(([key, label]) => {
      const value = info.filters[key],
        date = key === 'from' || key === 'to';
      return [
        label,
        value
          ? date
            ? value.split('-').reverse().join('/')
            : value
          : date
            ? 'Sem limite'
            : 'Todos',
      ];
    }),
    [
      'Abrangência',
      'Todos os registros correspondentes aos filtros, independentemente da página exibida.',
    ],
  ];
}

export async function writeAuditExport(
  format: 'xlsx' | 'pdf',
  filename: string,
  events: AsyncIterable<AuditEvent>,
  info: ExportInfo,
) {
  const output = createWriteStream(filename, { flags: 'wx', mode: 0o600 });
  const done = finished(output);
  void done.catch(() => undefined);
  let count = 0;
  let pdf: PDFKit.PDFDocument | undefined;
  try {
    if (format === 'xlsx') {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: output,
        useStyles: true,
        useSharedStrings: false,
      });
      workbook.creator = 'Nexus PTW AI';
      const summary = workbook.addWorksheet('Resumo');
      summary.columns = [{ width: 32 }, { width: 100 }];
      let sheet: ExcelJS.Worksheet;
      const addSheet = () => {
        sheet = workbook.addWorksheet(
          `Auditoria${count ? '-' + (Math.floor(count / 1_000_000) + 1) : ''}`,
          { views: [{ state: 'frozen', ySplit: 1 }] },
        );
        sheet.columns = columns.map(([header]) => ({
          header,
          width: header.includes('ID') ? 38 : 30,
        }));
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
        const header = sheet.getRow(1);
        header.height = 34;
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5C5E' } };
        header.alignment = { vertical: 'middle', wrapText: true };
        header.commit();
      };
      addSheet();
      for await (const event of events) {
        if (count && count % 1_000_000 === 0) {
          sheet!.commit();
          addSheet();
        }
        const row = sheet!.addRow(columns.map(([, value]) => value(event) ?? ''));
        row.alignment = { vertical: 'top', wrapText: true };
        row.commit();
        count++;
      }
      sheet!.commit();
      for (const row of [
        ['Nexus PTW AI — Auditoria completa', ''],
        ...metadata(info),
        ['Total de registros', count],
      ])
        summary.addRow(row).commit();
      summary.commit();
      await workbook.commit();
    } else {
      const regular = path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
      const bold = path.join(process.cwd(), 'public/fonts/NotoSans-Bold.ttf');
      pdf = new PDFDocument({
        size: 'A4',
        margin: 40,
        font: regular,
        info: { Title: 'Auditoria completa — Nexus PTW AI', Author: 'Nexus PTW AI' },
      });
      pdf.on('error', (error) => output.destroy(error));
      pdf.pipe(output);
      const doc = pdf;
      let page = 0;
      const footer = () => {
        page++;
        const { x, y } = doc;
        doc
          .font(regular)
          .fontSize(8)
          .fillColor('#526574')
          .text(`Nexus PTW AI | Página ${page}`, 40, doc.page.height - 25, { lineBreak: false });
        doc.x = x;
        doc.y = y;
        doc.font(regular).fontSize(9).fillColor('#223649');
      };
      footer();
      doc.on('pageAdded', footer);
      doc.font(bold).fontSize(17).fillColor('#0F5C5E').text('Relatório completo de auditoria');
      doc.moveDown(0.6).font(regular).fontSize(9).fillColor('#223649');
      for (const [label, value] of metadata(info))
        doc.text(`${label}: ${value}`, { paragraphGap: 4 });
      for await (const event of events) {
        if (doc.y > doc.page.height - 130) doc.addPage();
        count++;
        doc
          .moveDown()
          .font(bold)
          .fontSize(11)
          .fillColor('#0F5C5E')
          .text(`Evento ${event.id} — ${auditActionLabels[event.action] || event.action}`);
        doc.moveDown(0.4).font(regular).fontSize(9).fillColor('#223649');
        for (const [index, [label, getValue]] of columns.entries()) {
          const value = getValue(event);
          if (index >= 14 && value === undefined) continue;
          doc.text(
            `${label}: ${value === null || value === undefined ? 'Não informado' : typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : value}`,
            { paragraphGap: 4 },
          );
        }
      }
      doc.moveDown().font(bold).text(`Total de registros: ${count}`);
      doc.end();
    }
    await done;
    return count;
  } catch (error) {
    pdf?.destroy();
    output.destroy();
    await done.catch(() => undefined);
    throw error;
  }
}
