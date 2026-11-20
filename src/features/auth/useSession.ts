'use client';

// The ROADNET session: checked on load (the httpOnly cookie survives a page reload), opened with
// the login form, closed on sign-out or when an API call says it expired.
import { useCallback, useEffect, useState } from 'react';

export type SessionStatus = 'checking' | 'signedOut' | 'signedIn';
export type LoginResult = 'ok' | 'invalid' | 'connection';

async function csrfToken(): Promise<string> {
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!res.ok) throw new Error('csrf');
  return (await res.json()).token;
}

export function useSession() {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // The server asks ROADNET whether the saved session is still valid.
    fetch('/api/auth/check', { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        if (r.ok) return setStatus('signedIn');
        const body = await r.json().catch(() => ({}));
        setExpired(!!body.expired);
        setStatus('signedOut');
      })
      .catch(() => setStatus('signedOut'));
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      const token = await csrfToken();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) return 'invalid';
      setExpired(false);
      setStatus('signedIn');
      return 'ok';
    } catch {
      return 'connection';
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = await csrfToken();
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': token } });
    } catch {
      /* the cookie expires on its own */
    }
    setStatus('signedOut');
  }, []);

  /** An API call answered 401: back to the login screen, with a note. */
  const markExpired = useCallback(() => {
    setExpired(true);
    setStatus('signedOut');
  }, []);

  return { status, expired, login, logout, markExpired };
}
