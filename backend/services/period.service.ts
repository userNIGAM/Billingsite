import dayjs from 'dayjs';
import { isBeforeOrEqual, todayBusinessDate } from '../utils/date';

export interface BillingPeriod {
  periodStart: string;
  periodEnd: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Computes the monthly billing period that CONTAINS `refDate` for a khata
 * that bills on `billingStartDay` (validated 1..28), clamped to the khata's
 * own startDate/endDate (§23, §78, E-3, E-4, E-13).
 *
 * Examples with billingStartDay = 15:
 *   refDate 2026-09-20 → 2026-09-15 → 2026-10-14
 *   refDate 2026-09-01 → 2026-08-15 → 2026-09-14
 */
export function periodContaining(
  billingStartDay: number,
  khataStartDate: string,
  khataEndDate: string | null,
  refDate: string = todayBusinessDate()
): BillingPeriod | null {
  const ref = dayjs(refDate, 'YYYY-MM-DD', true);
  if (!ref.isValid()) throw new Error('Invalid reference date');

  let startCandidate = dayjs(`${ref.format('YYYY-MM')}-${pad(billingStartDay)}`, 'YYYY-MM-DD', true);
  if (startCandidate.isAfter(ref)) {
    startCandidate = startCandidate.subtract(1, 'month');
  }

  let periodStart = startCandidate.format('YYYY-MM-DD');
  let periodEnd = startCandidate.add(1, 'month').subtract(1, 'day').format('YYYY-MM-DD');

  // Clamp to the khata's own start/end dates.
  if (isBeforeOrEqual(periodStart, khataStartDate)) {
    periodStart = khataStartDate;
  }
  if (khataEndDate && isBeforeOrEqual(khataEndDate, periodEnd)) {
    periodEnd = khataEndDate;
  }

  // The khata's lifetime does not intersect this candidate period at all.
  if (khataEndDate && isBeforeOrEqual(periodStart, khataEndDate) === false) {
    return null;
  }
  // periodStart was pushed forward to khataStartDate past periodEnd — the
  // khata had not started yet. Both branches used to return the identical
  // (inverted) object, so callers got { periodStart: '2026-02-10',
  // periodEnd: '2026-01-31' } and any bill generated from it threw
  // "periodStart must be on or before periodEnd".
  if (isBeforeOrEqual(periodEnd, periodStart)) {
    return null;
  }

  return { periodStart, periodEnd };
}

/** The billing period immediately before the one containing `refDate`. */
export function previousPeriod(
  billingStartDay: number,
  khataStartDate: string,
  khataEndDate: string | null,
  refDate: string = todayBusinessDate()
): BillingPeriod | null {
  const ref = dayjs(refDate, 'YYYY-MM-DD', true);
  const previousMonthRef = ref.subtract(1, 'month').format('YYYY-MM-DD');
  return periodContaining(billingStartDay, khataStartDate, khataEndDate, previousMonthRef);
}

export interface PeriodWindowInput {
  billingStartDay: number;
  startDate: string;
  endDate: string | null;
}

/** Full 12-period sweep helper for reports (startDate → today). */
export function periodsSinceStart(input: PeriodWindowInput): BillingPeriod[] {
  const out: BillingPeriod[] = [];
  let start = dayjs(`${dayjs(input.startDate, 'YYYY-MM-DD').format('YYYY-MM')}-01`, 'YYYY-MM-DD');
  const today = dayjs(todayBusinessDate(), 'YYYY-MM-DD');
  let guard = 0;
  while (!start.isAfter(today) && guard < 36) {
    const period = periodContaining(input.billingStartDay, input.startDate, input.endDate, start.format('YYYY-MM-DD'));
    if (period) out.push(period);
    start = start.add(1, 'month');
    guard += 1;
  }
  return out;
}