/**
 * The predictive wait model (CLAUDE.md §6.1).
 *
 * SINGLE SOURCE OF TRUTH. The inspection page, the map, and the ranking all call this one
 * function — §6 forbids a second implementation anywhere. It is pure: every parameter is
 * passed in, so it can be unit-tested without a database and so admin edits to the param
 * tables take effect with no deploy.
 *
 *   p50 = clamp(base × hod × day × shift × density, min, max)
 *   band = [p50 × band_lo, p50 × band_hi]
 *
 * What this models is a *typical* wait for a **stable** patient at that facility type, at
 * that local hour, on that class of day. It is not a live queue reading and must never be
 * displayed as one (invariant #4).
 */

import { dayClassFor } from './dayClass';
import { localParts } from './localTime';
import type {
  EstimableFacility, Holiday, ModelParams, ShiftWindow, WaitEstimate,
} from './types';

/**
 * Returns null for `specialty` facilities.
 *
 * Specialty practices are appointment-based referral centres, not walk-in ERs. §6.2 gives
 * them no `base_waits` row and §8 bars them from ranking, so producing a wait number for
 * one would be inventing a queue that does not exist.
 */
export function estimateWait(
  facility: EstimableFacility,
  at: Date,
  params: ModelParams,
  holidays: ReadonlyMap<string, Holiday>,
): WaitEstimate | null {
  if (facility.facilityType === 'specialty') return null;

  const base = params.baseWaits[facility.facilityType];
  const hodCurve = params.hodCurves[facility.facilityType];
  if (!base || !hodCurve) return null;

  const { hour, date, weekday } = localParts(at, facility.tz);
  const dayClass = dayClassFor(date, weekday, holidays);

  const hodMult = hodCurve[hour] ?? 1;
  const dayMult = params.dayMults[dayClass] ?? 1;
  const shiftMult = shiftMultiplierFor(params.shiftWindows[facility.facilityType], hour);
  const densityMult = facility.densityMult;

  const raw = base.baseMinutes * hodMult * dayMult * shiftMult * densityMult;

  let p50 = raw;
  let clamped: 'min' | 'max' | null = null;
  if (p50 < base.minMinutes) {
    p50 = base.minMinutes;
    clamped = 'min';
  } else if (p50 > base.maxMinutes) {
    p50 = base.maxMinutes;
    clamped = 'max';
  }

  // Unknown hours widen the band rather than hiding the uncertainty (§6.1, invariant #4).
  const unknownHours = facility.hoursConfidence === 'unknown';
  const bandLo = unknownHours ? params.bandLoHoursUnknown : params.bandLo;
  const bandHi = unknownHours ? params.bandHiHoursUnknown : params.bandHi;

  return {
    p50Minutes: p50,
    bandLoMinutes: p50 * bandLo,
    bandHiMinutes: p50 * bandHi,
    localHour: hour,
    localDate: date,
    dayClass,
    factors: {
      base: base.baseMinutes,
      hod: hodMult,
      day: dayMult,
      shift: shiftMult,
      density: densityMult,
      clamped,
    },
  };
}

/**
 * Shift-handoff multiplier, 1.0 outside every window (§6.1).
 *
 * `endHour` is exclusive, so a 07–09 window covers local hours 7 and 8. Windows are not
 * expected to overlap; if they ever do, the largest wins rather than compounding — two
 * stacked handoffs are not twice as slow.
 */
function shiftMultiplierFor(windows: ShiftWindow[] | undefined, hour: number): number {
  if (!windows?.length) return 1;
  let mult = 1;
  for (const w of windows) {
    const inWindow =
      w.startHour <= w.endHour
        ? hour >= w.startHour && hour < w.endHour
        : hour >= w.startHour || hour < w.endHour; // window wrapping midnight
    if (inWindow) mult = Math.max(mult, w.multiplier);
  }
  return mult;
}
