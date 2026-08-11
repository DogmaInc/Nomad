/**
 * Day classification (CLAUDE.md §6.1).
 *
 * Precedence: holiday > holiday_adjacent > saturday/sunday/friday > weekday.
 *
 * Note the interaction with §6.1's other rule: "Sunday 2 a.m. is class `sunday` (local
 * date)". Classification keys off the facility's LOCAL calendar date, so the small hours
 * belong to the day that just started, not the evening that just ended. A Saturday-night
 * slam that runs past midnight is therefore priced as Sunday — which is correct, because
 * the queue that formed on Saturday night is still standing there.
 */

import type { DayClass, Holiday } from './types';

/** Offset a YYYY-MM-DD by whole days, staying in UTC to avoid a local-midnight shift. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * @param localDate  YYYY-MM-DD in the facility's timezone
 * @param weekday    0 = Sunday … 6 = Saturday, in the facility's timezone
 * @param holidays   keyed by YYYY-MM-DD
 */
export function dayClassFor(
  localDate: string,
  weekday: number,
  holidays: ReadonlyMap<string, Holiday>,
): DayClass {
  const exact = holidays.get(localDate);
  if (exact?.class === 'major') return 'holiday';

  // A minor holiday (Christmas Eve, July 3, the Friday after Thanksgiving) carries the
  // adjacent multiplier rather than the full one.
  if (exact?.class === 'minor') return 'holiday_adjacent';

  // §6.1 defines holiday_adjacent as the day before/after a major holiday, so derive it
  // even when the calendar has no explicit row for that date.
  const before = holidays.get(addDays(localDate, -1));
  const after = holidays.get(addDays(localDate, 1));
  if (before?.class === 'major' || after?.class === 'major') return 'holiday_adjacent';

  if (weekday === 6) return 'saturday';
  if (weekday === 0) return 'sunday';
  if (weekday === 5) return 'friday';
  return 'weekday';
}

/** Convenience for callers holding a plain array. */
export function holidayMap(holidays: readonly Holiday[]): ReadonlyMap<string, Holiday> {
  const map = new Map<string, Holiday>();
  for (const h of holidays) map.set(h.day, h);
  return map;
}
