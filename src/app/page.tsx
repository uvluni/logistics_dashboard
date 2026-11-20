'use client';

import { Loader2 } from 'lucide-react';
import { useSession } from '@/features/auth/useSession';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { AppShell } from '@/components/layout/AppShell';

export default function Home() {
  const { status, expired, login, logout, markExpired } = useSession();

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app text-ink-subtle">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }
  if (status === 'signedOut') return <LoginScreen onLogin={login} expired={expired} />;
  return <AppShell onLogout={logout} onExpired={markExpired} />;
}
