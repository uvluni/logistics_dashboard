import { NextRequest, NextResponse } from 'next/server';
import { verifyCSRFToken } from '@/lib/csrf';
import { shouldUseSecureCookie } from '@/lib/secureCookie';

export async function POST(request: NextRequest) {
  try {
    // Verify CSRF token (skip in development)
    if (process.env.NODE_ENV === 'production') {
      const csrfToken = request.cookies.get('csrf_token')?.value;
      const csrfHeader = request.headers.get('x-csrf-token');

      if (!csrfToken || !csrfHeader || !verifyCSRFToken(csrfHeader) || csrfHeader !== csrfToken) {
        return NextResponse.json(
          { error: 'CSRF token validation failed' },
          { status: 403 }
        );
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'Missing environment variables' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const username = body?.username;
    const password = body?.password;

    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${baseUrl}/v1/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: response.status }
      );
    }

    const data = await response.json();

    const res = NextResponse.json(data);
    res.cookies.set('roadnet_token', data.token, {
      httpOnly: true,
      secure: shouldUseSecureCookie(request),
      sameSite: 'strict',
      maxAge: 86400,
    });

    // Clear CSRF token after use
    res.cookies.delete('csrf_token');

    return res;
  } catch (error) {
    // Don't log full error in production
    if (process.env.NODE_ENV !== 'production') {
      console.error('Login error:', error instanceof Error ? error.message : String(error));
    }
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
