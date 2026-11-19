export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(
    { release: process.env.NEXT_PUBLIC_APP_RELEASE || 'development' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
