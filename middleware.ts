import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PASSCODE_COOKIE = '__Secure-recalldeck-auth';

export function middleware(request: NextRequest) {
  const passcode = process.env.DEMO_PASSCODE;

  // If no passcode is configured, allow all access
  if (!passcode) {
    return NextResponse.next();
  }

  // Skip middleware for static assets and the passcode API
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get(PASSCODE_COOKIE);
  if (authCookie?.value === passcode) {
    return NextResponse.next();
  }

  // Redirect to login page if not authenticated
  if (pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
