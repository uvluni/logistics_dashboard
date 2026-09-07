import { NextRequest, NextResponse } from 'next/server';
import { verifyCSRFToken } from '@/lib/csrf';

export async function POST(request: NextRequest) {
  try {
    // DEPRECATED: Mock login endpoint no longer supported
    // Use real ROADNET credentials instead
    // This endpoint is disabled in production for security
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Mock login is not available in production' },
        { status: 403 }
      );
    }

    // In development, require CSRF token validation for consistency
    const csrfToken = request.cookies.get('csrf_token')?.value;
    const csrfHeader = request.headers.get('x-csrf-token');

    if (!csrfToken || !csrfHeader || !verifyCSRFToken(csrfHeader) || csrfHeader !== csrfToken) {
      return NextResponse.json(
        { error: 'CSRF token validation failed' },
        { status: 403 }
      );
    }

    const res = NextResponse.json({ token: 'mock-token-dev', success: true });
    res.cookies.set('roadnet_token', 'mock-token-dev', {
      httpOnly: true,
      secure: process.env.FORCE_HTTPS === 'true',
      sameSite: 'strict',
      maxAge: 86400,
      path: '/',
    });

    // Clear CSRF token after use
    res.cookies.delete('csrf_token');

    return res;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Mock login error:', error instanceof Error ? error.message : String(error));
    }
    return NextResponse.json(
      { error: 'Mock login failed' },
      { status: 500 }
    );
  }
}
