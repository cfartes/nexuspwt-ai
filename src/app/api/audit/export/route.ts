import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditFilters, companyAuditExport } from '@/lib/audit';
import { writeAuditExport } from '@/lib/audit-export';
import { uuid } from '@/lib/validation';
import { apiError } from '@/lib/http';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  let directory: string | undefined;
  let client: PoolClient | undefined;
  try {
    const user = await currentUser();
    const params = new URL(request.url).searchParams;
    const context = uuid.parse(params.get('context'));
    const format = z.enum(['xlsx', 'pdf']).parse(params.get('format'));
    params.delete('context');
    params.delete('format');
    const filters = auditFilters.parse(Object.fromEntries(params));
    client = await db.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const report = await companyAuditExport(client, user, context, filters);
    directory = await mkdtemp(path.join(tmpdir(), 'nexus-audit-'));
    const filename = path.join(directory, `auditoria.${format}`);
    const events = (async function* () {
      for await (const event of report.events) {
        request.signal.throwIfAborted();
        yield event;
      }
    })();
    await writeAuditExport(format, filename, events, {
      companyName: report.companyName,
      generatedAt: new Date(),
      filters,
    });
    await client.query('COMMIT');
    const size = (await stat(filename)).size;
    const body = createReadStream(filename);
    const temporary = directory;
    body.once('close', () => {
      void rm(temporary, { recursive: true, force: true }).catch(() =>
        console.error({ event: 'audit_export_cleanup_failed' }),
      );
    });
    return new Response(Readable.toWeb(body) as ReadableStream, {
      headers: {
        'Content-Type':
          format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="nexus-auditoria-${new Date().toISOString().slice(0, 10)}.${format}"`,
        'Content-Length': String(size),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => undefined);
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    return apiError(error);
  } finally {
    client?.release();
  }
}
