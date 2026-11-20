import type { Config } from 'tailwindcss';

// Colors come from the CSS tokens in globals.css, so every class follows the active theme.
const token = (name: string) => `var(--${name})`;

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/features/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        app: token('app-bg'),
        surface: { DEFAULT: token('surface'), muted: token('surface-muted'), hover: token('surface-hover'), selected: token('surface-selected') },
        topbar: { DEFAULT: token('topbar-bg'), fg: token('topbar-fg'), muted: token('topbar-muted'), hover: token('topbar-hover') },
        line: { DEFAULT: token('border'), strong: token('border-strong') },
        ink: { DEFAULT: token('text'), muted: token('text-muted'), subtle: token('text-subtle') },
        primary: { DEFAULT: token('primary'), hover: token('primary-hover'), fg: token('primary-fg') },
        accent: token('accent'),
        brand: { navy: token('brand-navy'), 'navy-dark': token('brand-navy-dark'), cyan: token('brand-cyan'), green: token('brand-green') },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
      },
      borderRadius: { sm: token('radius-sm'), DEFAULT: token('radius'), lg: token('radius-lg') },
      boxShadow: { sm: token('shadow-sm'), DEFAULT: token('shadow'), lg: token('shadow-lg') },
      fontFamily: { sans: ['var(--font-heebo)', 'Segoe UI', 'Arial', 'sans-serif'] },
      ringColor: { focus: token('focus-ring') },
    },
  },
  plugins: [],
};
export default config;
