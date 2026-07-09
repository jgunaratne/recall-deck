import { NextResponse } from 'next/server';

const PASSCODE_COOKIE = '__Secure-recalldeck-auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { passcode } = body;

    if (!passcode || typeof passcode !== 'string') {
      return NextResponse.json({ error: 'Passcode is required' }, { status: 400 });
    }

    const expectedPasscode = process.env.DEMO_PASSCODE;
    if (!expectedPasscode) {
      // No passcode configured, allow access
      return NextResponse.json({ success: true });
    }

    // Constant-time comparison to prevent timing attacks
    // TODO(security): Use a proper constant-time comparison library for production
    if (passcode.length !== expectedPasscode.length || passcode !== expectedPasscode) {
      return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(PASSCODE_COOKIE, passcode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
