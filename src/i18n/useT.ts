'use client';

import { useCallback, useMemo } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { LOCALE, message, type MessageKey } from './messages';

/** Text and number formatting in the current language. */
export function useT() {
  const { language, isRTL } = useLanguage();
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => message(language, key, vars), [language]);
  const nf = useMemo(() => new Intl.NumberFormat(LOCALE[language]), [language]);
  const nf1 = useMemo(() => new Intl.NumberFormat(LOCALE[language], { maximumFractionDigits: 1 }), [language]);
  const num = useCallback((n: number, decimals = 0) => (decimals ? nf1 : nf).format(n), [nf, nf1]);
  return { t, num, language, isRTL, locale: LOCALE[language] };
}
