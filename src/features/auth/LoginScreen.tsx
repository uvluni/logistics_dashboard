'use client';

import { useState, type FormEvent } from 'react';
import { BarChart3, Eye, EyeOff, LockKeyhole, MapPinned, Route } from 'lucide-react';
import { useT } from '@/i18n/useT';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { BrandMark } from '@/components/layout/BrandMark';
import { LanguageMenu, ThemeMenu } from '@/components/layout/PreferenceMenus';
import type { LoginResult } from './useSession';

const fieldClass =
  'h-10 w-full rounded border border-line bg-surface px-3 text-sm text-ink shadow-sm placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-focus';

export function LoginScreen({ onLogin, expired }: { onLogin: (u: string, p: string) => Promise<LoginResult>; expired: boolean }) {
  const { t } = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t('login.missing'));
      return;
    }
    setBusy(true);
    setError('');
    const result = await onLogin(username, password);
    setBusy(false);
    if (result === 'invalid') setError(t('login.failed'));
    else if (result === 'connection') setError(t('login.connection'));
    else setPassword('');
  }

  const features = [
    { icon: <Route />, text: t('nav.plan') },
    { icon: <BarChart3 />, text: t('nav.actual') },
    { icon: <MapPinned />, text: t('nav.map') },
  ];

  return (
    <div className="grid min-h-screen bg-app lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-navy-dark p-10 text-white lg:flex">
        {/* Brand colors as rgba: Tailwind's /opacity shorthand cannot fade a CSS-variable color */}
        <div className="pointer-events-none absolute -end-24 -top-24 size-96 rounded-full border-[28px] border-[rgba(0,160,227,0.18)]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -start-20 size-80 rounded-full border-[20px] border-[rgba(152,185,53,0.16)]" aria-hidden />
        <BrandMark tagline={t('brand.tagline')} />
        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight">{t('login.subtitle')}</h1>
          <ul className="mt-8 space-y-3">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-3 text-[15px] text-white/85">
                <span className="flex size-8 items-center justify-center rounded-md bg-white/10 text-brand-cyan [&>svg]:size-4">{f.icon}</span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">Rasner · Logistic Software</p>
      </aside>

      {/* Form */}
      <main className="flex flex-col">
        <div className="flex justify-end gap-1 p-4">
          <LanguageMenu variant="ghost" />
          <ThemeMenu variant="ghost" />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm">
            <BrandMark tagline={t('brand.tagline')} className="mb-8 text-brand-navy lg:hidden dark:text-ink" />
            <h2 className="text-2xl font-semibold text-ink">{t('login.title')}</h2>
            <p className="mt-1 text-sm text-ink-subtle lg:hidden">{t('login.subtitle')}</p>

            <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
              {expired && !error && <Alert tone="warning">{t('error.session')}</Alert>}
              {error && <Alert tone="danger">{error}</Alert>}

              <div className="space-y-1.5">
                <label htmlFor="login-user" className="text-[13px] font-medium text-ink">{t('login.username')}</label>
                <input id="login-user" className={fieldClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus dir="ltr" />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-pass" className="text-[13px] font-medium text-ink">{t('login.password')}</label>
                <div className="relative">
                  <input
                    id="login-pass"
                    type={showPassword ? 'text' : 'password'}
                    className={`${fieldClass} pe-10`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-ink-subtle hover:text-ink [&>svg]:size-4"
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              <Button type="submit" variant="primary" className="h-10 w-full" loading={busy}>
                {busy ? t('login.submitting') : t('login.submit')}
              </Button>
            </form>

            <p className="mt-6 flex items-center gap-2 text-xs text-ink-subtle">
              <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
              {t('login.note')}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
