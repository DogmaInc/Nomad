/**
 * Holiday calendar (CLAUDE.md §6.2).
 *
 *   npm run seed:holidays -- --years 2026,2027,2028
 *
 * Generated rather than frozen into a migration so future years need no code change (§6.2).
 * Idempotent: upserts on `day`.
 *
 * The vet-ER calendar is NOT the federal calendar. The single biggest surge of the year is
 * **July 3–5 — fireworks**: noise-phobic dogs bolt, get hit by cars, get lost, and the ones
 * that stay home eat the barbecue. A model that treats July 4 as an ordinary summer Saturday
 * is wrong in the direction that strands someone at 11 p.m.
 *
 * `class` is 'major' | 'minor' (the schema's constraint). The model maps major → day_class
 * `holiday`, minor → `holiday_adjacent`, and additionally treats any day flanking a major
 * as `holiday_adjacent` — see lib/model/dayClass.ts.
 */

import { nomadDb } from './lib/db';

interface HolidayRow {
  day: string;
  name: string;
  class: 'major' | 'minor';
}

/** YYYY-MM-DD from UTC parts — avoids the local-timezone off-by-one when formatting dates. */
function iso(year: number, month1: number, day: number): string {
  return new Date(Date.UTC(year, month1 - 1, day)).toISOString().slice(0, 10);
}

/** The nth given weekday of a month (n = 1..5). weekday: 0=Sun..6=Sat. */
function nthWeekday(year: number, month1: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month1 - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return iso(year, month1, 1 + shift + (n - 1) * 7);
}

/** The last given weekday of a month. */
function lastWeekday(year: number, month1: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month1, 0)); // day 0 of next month = last of this
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return iso(year, month1, last.getUTCDate() - shift);
}

/** Offset an ISO date by whole days. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function holidaysForYear(year: number): HolidayRow[] {
  const thanksgiving = nthWeekday(year, 11, 4, 4); // 4th Thursday of November
  const rows: HolidayRow[] = [
    // ── the four that actually move ER volume (§6.2) ──
    { day: iso(year, 1, 1), name: "New Year's Day", class: 'major' },
    { day: iso(year, 7, 4), name: 'Independence Day', class: 'major' },
    { day: thanksgiving, name: 'Thanksgiving', class: 'major' },
    { day: iso(year, 12, 25), name: 'Christmas Day', class: 'major' },

    // ── the vet-specific flanks ──
    { day: iso(year, 7, 3), name: 'July 3 (fireworks)', class: 'minor' },
    { day: iso(year, 7, 5), name: 'July 5 (fireworks aftermath)', class: 'minor' },
    { day: addDays(thanksgiving, 1), name: 'Day after Thanksgiving', class: 'minor' },
    { day: iso(year, 12, 24), name: 'Christmas Eve', class: 'minor' },
    { day: iso(year, 12, 26), name: 'Day after Christmas', class: 'minor' },
    { day: iso(year, 12, 31), name: "New Year's Eve", class: 'minor' },

    // ── remaining US federal holidays: real but milder ER effects ──
    { day: nthWeekday(year, 1, 1, 3), name: 'Martin Luther King Jr. Day', class: 'minor' },
    { day: nthWeekday(year, 2, 1, 3), name: "Presidents' Day", class: 'minor' },
    { day: lastWeekday(year, 5, 1), name: 'Memorial Day', class: 'minor' },
    { day: iso(year, 6, 19), name: 'Juneteenth', class: 'minor' },
    { day: nthWeekday(year, 9, 1, 1), name: 'Labor Day', class: 'minor' },
    { day: nthWeekday(year, 10, 1, 2), name: 'Columbus Day', class: 'minor' },
    { day: iso(year, 11, 11), name: 'Veterans Day', class: 'minor' },
  ];

  // A major holiday wins any collision (e.g. Christmas Eve on a Sunday is still handled
  // by day_class precedence, but two rows for one date would violate the primary key).
  const byDay = new Map<string, HolidayRow>();
  for (const row of rows) {
    const existing = byDay.get(row.day);
    if (!existing || (existing.class === 'minor' && row.class === 'major')) {
      byDay.set(row.day, row);
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

async function main() {
  const arg = process.argv.indexOf('--years');
  const thisYear = new Date().getUTCFullYear();
  const years =
    arg !== -1 && process.argv[arg + 1]
      ? process.argv[arg + 1].split(',').map((y) => Number(y.trim()))
      : [thisYear, thisYear + 1, thisYear + 2];

  const rows = years.flatMap(holidaysForYear);
  console.log(`\nSeeding ${rows.length} holidays for ${years.join(', ')}\n`);

  const db = nomadDb();
  const { error } = await db.from('holidays').upsert(rows, { onConflict: 'day' });
  if (error) throw new Error(error.message);

  for (const r of rows.filter((x) => x.class === 'major')) {
    console.log(`  ${r.day}  ${r.class.padEnd(5)}  ${r.name}`);
  }
  console.log(`  … plus ${rows.filter((x) => x.class === 'minor').length} minor\n`);
}

if (process.argv[1]?.includes('holidays')) {
  main().catch((err) => {
    console.error('\nHoliday seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
