/**
 * Terminal view of the model — the same table /admin/model renders (CLAUDE.md §4).
 *
 *   npm run model:preview                    DMV, all day classes, key hours
 *   npm run model:preview -- --day sunday    one day class, all 24 hours
 *   npm run model:preview -- --state VA
 *
 * Exists because the M1 gate is a judgement call about whether the numbers feel right, and
 * that judgement is easier to make on a compact table than by scrolling a browser. Calls
 * `estimateAtLocal` — the same function the page and the map use, never a copy.
 */

import { nomadDb } from './seed/lib/db';
import { estimateAtLocal } from '../src/lib/model/estimate';
import { loadModelParams } from '../src/lib/model/params';
import { formatBand } from '../src/lib/model/format';
import type { DayClass, EstimableFacility, FacilityType, HoursConfidence } from '../src/lib/model/types';

const ALL_DAYS: DayClass[] = [
  'weekday', 'friday', 'saturday', 'sunday', 'holiday_adjacent', 'holiday',
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const db = nomadDb();
  const { params } = await loadModelParams(db, { force: true });

  const state = arg('state');
  const onlyDay = arg('day') as DayClass | null;

  let query = db
    .from('facilities')
    .select('name, city, state, facility_type, tz, density_mult, hours_confidence')
    .neq('facility_type', 'specialty')
    .order('state')
    .order('city');
  if (state) query = query.eq('state', state.toUpperCase());

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    name: string; city: string | null; state: string;
    facility_type: FacilityType; tz: string;
    density_mult: number | string; hours_confidence: HoursConfidence;
  }>;

  if (!rows.length) {
    console.log('\nNo rankable facilities found.\n');
    return;
  }

  const days = onlyDay ? [onlyDay] : ALL_DAYS;
  const hours = onlyDay ? Array.from({ length: 24 }, (_, h) => h) : [2, 10, 20];

  for (const day of days) {
    console.log(`\n══════════════ ${day.toUpperCase()} ══════════════`);
    const header = hours.map((h) => String(h).padStart(2, '0')).map((h) => h.padStart(11)).join('');
    console.log(`${'FACILITY'.padEnd(42)}${header}`);
    console.log('─'.repeat(42 + hours.length * 11));

    for (const row of rows) {
      const facility: EstimableFacility = {
        facilityType: row.facility_type,
        tz: row.tz,
        densityMult: Number(row.density_mult),
        hoursConfidence: row.hours_confidence,
      };
      const cells = hours.map((hour) => {
        const e = estimateAtLocal(facility, hour, day, params);
        if (!e) return '—'.padStart(11);
        return formatBand(e.bandLoMinutes, e.bandHiMinutes)
          .replace(' hr', '')
          .replace(' min', 'm')
          .padStart(11);
      });
      const label = `${row.name.slice(0, 30)} (${row.facility_type.slice(0, 8)})`;
      console.log(`${label.padEnd(42)}${cells.join('')}`);
    }
  }

  console.log(
    `\n${rows.length} rankable facilities · bands are hours unless marked m · ` +
      `specialty excluded (§8)\n`,
  );
}

main().catch((err) => {
  console.error('\nPreview failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
