// Calendar dates as yyyy-MM-dd strings in Israel time. (toISOString() gives the UTC date, which is
// yesterday's date between midnight and 02:00/03:00 in Israel.)
const TZ = 'Asia/Jerusalem';

export const todayIso = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(Date.now());

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** The next work day: Sunday to Thursday; from Thursday, Friday or Saturday it is Sunday. */
export function nextWorkDay(iso: string = todayIso()): string {
  const wd = weekday(iso);
  return addDays(iso, wd >= 4 ? 7 - wd : 1);
}

export const formatDmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

/** E.g. "יום חמישי, 20 בנובמבר 2026" / "Thursday, 20 November 2026". */
export function formatLongDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

/** Minutes as h:mm. */
export const hoursMinutes = (min: number) => `${Math.floor(Math.abs(min) / 60)}:${String(Math.round(Math.abs(min) % 60)).padStart(2, '0')}`;
