'use client';

import { CircleUserRound, EyeOff, LogOut, Sparkles } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useT } from '@/i18n/useT';
import { IconButton } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { cn } from '@/components/ui/cn';
import { BrandMark } from './BrandMark';
import { LanguageMenu, ThemeMenu } from './PreferenceMenus';

export function TopBar({ chatOpen, onToggleChat, onLogout }: { chatOpen: boolean; onToggleChat: () => void; onLogout: () => void }) {
  const { t } = useT();
  const { presentation, setPresentation } = useTheme();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-topbar px-4 text-topbar-fg shadow-sm sm:px-6">
      <BrandMark tagline={t('brand.tagline')} />
      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          chatOpen ? 'border-brand-cyan bg-brand-cyan text-white' : 'border-white/25 text-topbar-fg hover:border-brand-cyan hover:bg-topbar-hover'
        )}
      >
        <Sparkles className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t('top.ask')}</span>
      </button>

      <div className="flex items-center gap-0.5">
        <LanguageMenu />
        <ThemeMenu />
        <Menu
          width="w-64"
          trigger={(p) => <IconButton {...p} variant="topbar" label={t('top.account')} icon={<CircleUserRound />} />}
          sections={[
            { title: t('top.signedIn'), items: [{ key: 'names', label: t('top.hideNames'), hint: t('top.hideNamesHint'), icon: <EyeOff />, checked: presentation, onSelect: () => setPresentation(!presentation) }] },
            { items: [{ key: 'logout', label: t('top.logout'), icon: <LogOut />, onSelect: onLogout }] },
          ]}
        />
      </div>
    </header>
  );
}
