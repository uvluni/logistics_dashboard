'use client';

// Color theme (light, dark, or follow the system) and presentation mode (personal names blurred).
// Both are applied as attributes on <html> so plain CSS can react to them; the inline script in
// layout.tsx applies the saved values before the first paint, so there is no flash.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'theme';
export const PRESENTATION_KEY = 'presentation-mode';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  presentation: boolean;
  setPresentation: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered: storage unavailable */
  }
};
const systemTheme = (): ResolvedTheme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');
  // Names are blurred by default, as the dashboard always did; the user can turn it off.
  const [presentation, setPresentationState] = useState(true);

  useEffect(() => {
    const saved = read(THEME_KEY);
    setPreferenceState(saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'light');
    setPresentationState(read(PRESENTATION_KEY) !== 'off');
  }, []);

  // Resolve "system" and follow OS changes while it is selected.
  useEffect(() => {
    const apply = () => {
      const next = preference === 'system' ? systemTheme() : preference;
      setResolved(next);
      document.documentElement.setAttribute('data-theme', next);
    };
    apply();
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [preference]);

  useEffect(() => {
    document.documentElement.setAttribute('data-presentation', presentation ? 'on' : 'off');
  }, [presentation]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    write(THEME_KEY, p);
  }, []);
  const setPresentation = useCallback((on: boolean) => {
    setPresentationState(on);
    write(PRESENTATION_KEY, on ? 'on' : 'off');
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference, presentation, setPresentation }), [preference, resolved, setPreference, presentation, setPresentation]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
