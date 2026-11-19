import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await db.query('SELECT 1');
    return Response.json(
      { ok: true, release: process.env.NEXT_PUBLIC_APP_RELEASE || 'development' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
