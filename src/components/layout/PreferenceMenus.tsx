'use client';

import { Globe, Monitor, Moon, Sun } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import { useT } from '@/i18n/useT';
import type { Language } from '@/i18n/translations';
import { IconButton } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';

const LANGUAGES: { code: Language; name: string; short: string }[] = [
  { code: 'he', name: 'עברית', short: 'עב' },
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'es', name: 'Español', short: 'ES' },
];

type Variant = 'topbar' | 'ghost';

export function LanguageMenu({ variant = 'topbar' }: { variant?: Variant }) {
  const { language, setLanguage } = useLanguage();
  const { t } = useT();
  return (
    <Menu
      width="w-44"
      trigger={(p) => <IconButton {...p} variant={variant} label={t('top.language')} icon={<Globe />} />}
      sections={[{ title: t('top.language'), items: LANGUAGES.map((l) => ({ key: l.code, label: l.name, checked: language === l.code, onSelect: () => setLanguage(l.code) })) }]}
    />
  );
}

const THEME_ICON: Record<ThemePreference, React.ReactNode> = { light: <Sun />, dark: <Moon />, system: <Monitor /> };

export function ThemeMenu({ variant = 'topbar' }: { variant?: Variant }) {
  const { preference, resolved, setPreference } = useTheme();
  const { t } = useT();
  return (
    <Menu
      width="w-44"
      trigger={(p) => <IconButton {...p} variant={variant} label={t('top.theme')} icon={resolved === 'dark' ? <Moon /> : <Sun />} />}
      sections={[
        {
          title: t('top.theme'),
          items: (['light', 'dark', 'system'] as const).map((k) => ({ key: k, label: t(`theme.${k}`), icon: THEME_ICON[k], checked: preference === k, onSelect: () => setPreference(k) })),
        },
      ]}
    />
  );
}
