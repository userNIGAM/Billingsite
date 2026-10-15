import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { env } from '../config/env';

dayjs.extend(utc);
dayjs.extend(timezone);
// Without this plugin dayjs SILENTLY IGNORES the format/strictness arguments to
// dayjs(date, format, strict), so validateDateStr below accepted '2026-13-45',
// '2026-02-30' and '2026-1-5'.
dayjs.extend(customParseFormat);

/**
 * The canteen operates in Asia/Kathmandu (env.TZ). Business dates are always
 * computed at WRITE time in that zone and stored as 'YYYY-MM-DD' strings,
 * never derived from UTC on read (plan §55 / E-12).
 */
const TZ = env.timezone || 'Asia/Kathmandu';

export function businessNow(): dayjs.Dayjs {
  return dayjs().tz(TZ);
}

/** Today's business date as 'YYYY-MM-DD' in Asia/Kathmandu. */
export function todayBusinessDate(): string {
  return businessNow().format('YYYY-MM-DD');
}

/** Convert an ISO/Date/string to a Kathmandu business date string. */
export function toBusinessDate(date: string | Date): string {
  return dayjs(date).tz(TZ).format('YYYY-MM-DD');
}

/** Month that contains `date` as 'YYYY-MM' (Kathmandu). */
export function monthKey(date?: string | Date): string {
  return (date ? dayjs(date) : businessNow()).format('YYYY-MM');
}

export function startOfMonthDate(monthKeyStr: string): string {
  return `${monthKeyStr}-01`;
}

export function endOfMonthDate(monthKeyStr: string): string {
  return dayjs(`${monthKeyStr}-01`).tz(TZ).endOf('month').format('YYYY-MM-DD');
}

export function addDays(dateStr: string, days: number): string {
  return dayjs(dateStr).tz(TZ).add(days, 'day').format('YYYY-MM-DD');
}

export function isBeforeOrEqual(a: string, b: string): boolean {
  return a <= b; // ISO 'YYYY-MM-DD' strings compare lexicographically
}

export function isAfterOrEqual(a: string, b: string): boolean {
  return a >= b;
}

export function validateDateStr(date: string): boolean {
  return dayjs(date, 'YYYY-MM-DD', true).isValid();
}

/**
 * Generates a date series [start, start+1, ..., end] of 'YYYY-MM-DD' strings,
 * useful for chart axes (§36).
 */
export function dateSeries(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = dayjs(start).tz(TZ);
  const last = dayjs(end).tz(TZ);
  let guard = 0;
  while ((cursor.isBefore(last) || cursor.isSame(last)) && guard < 370) {
    out.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
    guard += 1;
  }
  return out;
}