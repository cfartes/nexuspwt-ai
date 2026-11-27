import { NextResponse, type NextRequest } from 'next/server';
import { csrfCookieName, validCsrf } from '@/lib/csrf';
import { assertOrigin } from '@/lib/security';
import { apiError } from '@/lib/http';
import { enforceRequestLimit, requestIdentity } from '@/lib/requestLimits';

export async function proxy(request: NextRequest) {
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  try {
    if (mutation) {
      assertOrigin(request);
      if (Number(request.headers.get('Content-Length')) > 15 * 1024 * 1024)
        return Response.json({ error: 'Solicitação excede o limite de 15 MB.' }, { status: 413 });
      if (
        !validCsrf(
          request.cookies.get(csrfCookieName(process.env.COOKIE_SECURE === 'true'))?.value,
          request.headers.get('X-Nexus-CSRF'),
        )
      )
        return Response.json(
          {
            error: 'Validação de segurança expirada. Atualize o aplicativo e tente novamente.',
            code: 'CSRF_REQUIRED',
          },
          { status: 403, headers: { 'Cache-Control': 'no-store', 'X-Nexus-CSRF-Required': '1' } },
        );
    }
    const sensitive = !['/api/health', '/api/version'].includes(request.nextUrl.pathname);
    if (sensitive) {
      await enforceRequestLimit('all', 'global', 1200);
      const identity = await requestIdentity(request.cookies.get('nexus_session')?.value);
      await enforceRequestLimit(identity, 'requests', 300);
      if (
        mutation &&
        ['/api/auth', '/api/password-recovery/confirm', '/api/invitations/accept'].includes(
          request.nextUrl.pathname,
        )
      )
        await enforceRequestLimit('all', 'credentials', 240);
    }
    return NextResponse.next();
  } catch (error) {
    return apiError(error);
  }
}
export const config = { matcher: '/api/:path*' };
