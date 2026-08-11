/**
 * Facility-local time (CLAUDE.md §6.1 — "local time or nothing").
 *
 * A Maryland ER and a Texas ER at the same UTC instant are in different hours of their
 * day, and the hour-of-day curve is the single largest multiplier in the model. Getting
 * this wrong makes every estimate outside the server's timezone silently wrong, which is
 * exactly the kind of bug that looks fine in dev and ships. §15 requires a test for it.
 *
 * Implemented with Intl rather than a date library: it is built into Node and the browser,
 * carries the real IANA database, and handles DST transitions without extra dependencies.
 */

export interface LocalParts {
  /** 0–23 in the facility's timezone. */
  hour: number;
  /** YYYY-MM-DD in the facility's timezone. */
  date: string;
  /** 0 = Sunday … 6 = Saturday, in the facility's timezone. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// Intl.DateTimeFormat construction is comparatively expensive and we call this per
// facility per hour on the inspection page (facilities × 24 × day-classes).
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      // h23 rather than hour12:false — the latter can yield "24" for midnight.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

/** Throws on an unknown IANA zone rather than silently falling back to UTC. */
export function localParts(at: Date, tz: string): LocalParts {
  const parts = formatterFor(tz).formatToParts(at);

  let year = '', month = '', day = '', hour = '', weekday = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
    else if (part.type === 'hour') hour = part.value;
    else if (part.type === 'weekday') weekday = part.value;
  }

  const weekdayIndex = WEEKDAY_INDEX[weekday];
  if (weekdayIndex === undefined) {
    throw new Error(`Could not resolve local weekday for timezone ${tz}`);
  }

  return {
    hour: Number(hour),
    date: `${year}-${month}-${day}`,
    weekday: weekdayIndex,
  };
}

/** Whether a string is a timezone this runtime can actually resolve. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
