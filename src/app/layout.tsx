import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

// Heebo is Rasner's brand font and covers Hebrew and Latin.
const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo', display: 'swap' });

export const metadata: Metadata = {
  title: 'ROADNET · Rasner',
  description: 'Distribution planning and execution dashboard',
  icons: { icon: '/favicon.svg' },
};

// Applies the saved theme, presentation mode and language direction before the first paint.
const bootScript = `(function () {
  try {
    var p = localStorage.getItem('theme') || 'light';
    var dark = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var d = document.documentElement;
    d.setAttribute('data-theme', dark ? 'dark' : 'light');
    d.setAttribute('data-presentation', localStorage.getItem('presentation-mode') === 'off' ? 'off' : 'on');
    var lang = localStorage.getItem('language') || 'he';
    d.lang = lang;
    d.dir = lang === 'he' ? 'rtl' : 'ltr';
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
