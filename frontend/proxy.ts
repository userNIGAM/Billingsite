import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * UX-only route guard (PLAN §11). The API is the real gate: every request is
 * re-checked server-side, and an HttpOnly cookie is never trusted just because
 * it is present here. This just avoids rendering an admin shell for a
 * signed-out user before the first `/auth/me` call fails.
 */
const PUBLIC_PATHS = ['/login', '/setup'];

const AUTH_COOKIE = process.env.COOKIE_NAME ?? 'canteen_token';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(AUTH_COOKIE)?.value);

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Signed-in users have no reason to see login/setup.
  if (isPublic) {
    if (hasSession) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // Root has no content of its own.
  if (pathname === '/') {
    return NextResponse.redirect(new URL(hasSession ? '/dashboard' : '/login', request.url));
  }

  if (!hasSession) {
    const url = new URL('/login', request.url);
    // Preserve where the user was heading so login can send them back.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, the API, and any static asset.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
