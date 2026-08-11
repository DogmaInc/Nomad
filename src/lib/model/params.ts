/**
 * Load model parameters from the database (CLAUDE.md §6).
 *
 * Parameters live in DB tables, not code, because the M1 gate is Rod tuning them himself
 * through /admin/model until the Sunday 2 a.m. numbers look right. A deploy in that loop
 * would fail the gate.
 *
 * Cached in-process for ~5 minutes per §6. The cache is per server instance, so an admin
 * edit shows up on the inspection page immediately (it invalidates on write) and elsewhere
 * within the TTL.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BaseWait, DayClass, FacilityType, Holiday, ModelParams, ShiftWindow,
} from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface Cached {
  params: ModelParams;
  holidays: ReadonlyMap<string, Holiday>;
  loadedAt: number;
}

let cache: Cached | null = null;

/** Drop the cache so the next read reflects an admin edit immediately. */
export function invalidateModelParamsCache(): void {
  cache = null;
}

export async function loadModelParams(
  db: SupabaseClient,
  options: { force?: boolean } = {},
): Promise<{ params: ModelParams; holidays: ReadonlyMap<string, Holiday> }> {
  if (!options.force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return { params: cache.params, holidays: cache.holidays };
  }

  const [baseWaits, hodCurves, dayMults, shiftWindows, modelParams, holidays] =
    await Promise.all([
      db.from('base_waits').select('facility_type, base_minutes, min_minutes, max_minutes'),
      db.from('hod_curves').select('facility_type, hour, multiplier'),
      db.from('day_mults').select('day_class, multiplier'),
      db.from('shift_windows').select('facility_type, start_hour, end_hour, multiplier'),
      db.from('model_params').select('key, value'),
      db.from('holidays').select('day, name, class'),
    ]);

  for (const result of [baseWaits, hodCurves, dayMults, shiftWindows, modelParams, holidays]) {
    if (result.error) throw new Error(`Loading model params: ${result.error.message}`);
  }

  const base: ModelParams['baseWaits'] = {};
  for (const row of baseWaits.data ?? []) {
    base[row.facility_type as FacilityType] = {
      baseMinutes: Number(row.base_minutes),
      minMinutes: Number(row.min_minutes),
      maxMinutes: Number(row.max_minutes),
    } satisfies BaseWait;
  }

  // Curves arrive as one row per hour; assemble a dense 24-slot array so the model can
  // index by local hour without a lookup miss. Missing hours default to 1.0 (no effect).
  const curves: ModelParams['hodCurves'] = {};
  for (const row of hodCurves.data ?? []) {
    const type = row.facility_type as FacilityType;
    curves[type] ??= new Array<number>(24).fill(1);
    curves[type]![Number(row.hour)] = Number(row.multiplier);
  }

  const days = {} as Record<DayClass, number>;
  for (const row of dayMults.data ?? []) {
    days[row.day_class as DayClass] = Number(row.multiplier);
  }

  const shifts: ModelParams['shiftWindows'] = {};
  for (const row of shiftWindows.data ?? []) {
    const type = row.facility_type as FacilityType;
    shifts[type] ??= [];
    shifts[type]!.push({
      startHour: Number(row.start_hour),
      endHour: Number(row.end_hour),
      multiplier: Number(row.multiplier),
    } satisfies ShiftWindow);
  }

  const globals = new Map<string, unknown>();
  for (const row of modelParams.data ?? []) globals.set(row.key, row.value);

  const num = (key: string, fallback: number): number => {
    const value = globals.get(key);
    return typeof value === 'number' ? value : fallback;
  };

  const params: ModelParams = {
    baseWaits: base,
    hodCurves: curves,
    dayMults: days,
    shiftWindows: shifts,
    bandLo: num('band_lo', 0.65),
    bandHi: num('band_hi', 1.45),
    bandLoHoursUnknown: num('band_lo_hours_unknown', 0.55),
    bandHiHoursUnknown: num('band_hi_hours_unknown', 1.6),
  };

  const holidayMap = new Map<string, Holiday>();
  for (const row of holidays.data ?? []) {
    holidayMap.set(row.day, {
      day: row.day,
      name: row.name,
      class: row.class as 'major' | 'minor',
    });
  }

  cache = { params, holidays: holidayMap, loadedAt: Date.now() };
  return { params, holidays: holidayMap };
}
