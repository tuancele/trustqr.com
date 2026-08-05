import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'trustqr_vid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 years

// Anonymous per-browser visitor id. Not a real device id (iOS/Android web
// platforms don't expose one) — just a first-party cookie, lost on clear or
// on a different browser/device. Server Components can't set cookies
// themselves, so middleware generates it and forwards it via a request
// header for the same request's render, plus Set-Cookie for later ones.
export function middleware(request: NextRequest) {
  const existing = request.cookies.get(COOKIE_NAME)?.value;
  const visitorId = existing || crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-visitor-id', visitorId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (!existing) {
    response.cookies.set(COOKIE_NAME, visitorId, {
      maxAge: COOKIE_MAX_AGE,
      path: '/v',
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/v/:path*'],
};
