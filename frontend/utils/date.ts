/**
 * Date helpers for the UI. Business dates are plain `YYYY-MM-DD` strings in
 * Asia/Kathmandu (matching the backend); timestamps are ISO strings rendered
 * in the browser's locale.
 */

/** Today's business date (Asia/Kathmandu) as YYYY-MM-DD. */
export function todayBusinessDate(): string {
  // 'en-CA' yields YYYY-MM-DD directly.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** First day of the current month (Asia/Kathmandu) as YYYY-MM-DD. */
export function startOfMonth(): string {
  const today = todayBusinessDate();
  return `${today.slice(0, 7)}-01`;
}

/** Shifts a YYYY-MM-DD date by `days`, returning YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Shifts a YYYY-MM-DD date by `months`, returning YYYY-MM-DD. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, d));
  return target.toISOString().slice(0, 10);
}

/** End of the month containing `date`, as YYYY-MM-DD. */
export function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

/** Renders YYYY-MM-DD as e.g. "10 May 2026" without timezone drift. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return date;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Renders an ISO timestamp in the local locale, or '—'. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}
