/**
 * Test fixtures mirroring the CLAUDE.md §6.2 seed values.
 *
 * Deliberately hand-written from the spec table rather than read from the database, so the
 * tests assert what the SPEC says and would fail if a migration drifted from it. The
 * database seed is verified separately against these same numbers.
 */

import type { Holiday, ModelParams } from './types';

/** §6.2 hour-of-day curve for er / er_specialty, expanded to 24 slots. */
export function erHodCurve(): number[] {
  const curve = new Array<number>(24).fill(1);
  const ranges: Array<[number, number, number]> = [
    [0, 2, 1.35],   // skeleton overnight staffing
    [2, 5, 1.25],
    [5, 7, 1.1],
    [7, 9, 1.05],
    [9, 12, 0.6],   // fully staffed, pre-surge — the fast window
    [12, 15, 0.85],
    [15, 17, 1.05],
    [17, 20, 1.45], // after-GP-hours surge
    [20, 23, 1.55], // peak evening slam
    [23, 24, 1.45],
  ];
  for (const [start, end, mult] of ranges) {
    for (let h = start; h < end; h++) curve[h] = mult;
  }
  return curve;
}

/** Flatter urgent-care curve: at-open bump, after-work surge, closed overnight. */
export function urgentCareHodCurve(): number[] {
  const curve = new Array<number>(24).fill(1);
  const ranges: Array<[number, number, number]> = [
    [0, 8, 1.0],
    [8, 10, 1.2],   // at-open bump
    [10, 17, 0.9],
    [17, 20, 1.35], // after-work surge
    [20, 24, 1.1],
  ];
  for (const [start, end, mult] of ranges) {
    for (let h = start; h < end; h++) curve[h] = mult;
  }
  return curve;
}

export function testParams(): ModelParams {
  return {
    baseWaits: {
      er: { baseMinutes: 85, minMinutes: 20, maxMinutes: 360 },
      er_specialty: { baseMinutes: 95, minMinutes: 20, maxMinutes: 360 },
      urgent_care: { baseMinutes: 40, minMinutes: 10, maxMinutes: 180 },
      // `specialty` intentionally absent — appointment-based, excluded from wait modeling.
    },
    hodCurves: {
      er: erHodCurve(),
      er_specialty: erHodCurve(),
      urgent_care: urgentCareHodCurve(),
    },
    dayMults: {
      weekday: 1.0,
      friday: 1.15,
      saturday: 1.35,
      sunday: 1.5,
      holiday: 1.7,
      holiday_adjacent: 1.25,
    },
    shiftWindows: {
      // 12-hour handoffs stall intake (§6.2)
      er: [
        { startHour: 7, endHour: 9, multiplier: 1.15 },
        { startHour: 19, endHour: 21, multiplier: 1.15 },
      ],
      er_specialty: [
        { startHour: 7, endHour: 9, multiplier: 1.15 },
        { startHour: 19, endHour: 21, multiplier: 1.15 },
      ],
    },
    bandLo: 0.65,
    bandHi: 1.45,
    bandLoHoursUnknown: 0.55,
    bandHiHoursUnknown: 1.6,
  };
}

/** A small 2026 calendar covering the anchors and the precedence cases. */
export function testHolidays(): ReadonlyMap<string, Holiday> {
  const rows: Holiday[] = [
    { day: '2026-07-03', name: 'July 3 (fireworks)', class: 'minor' },
    { day: '2026-07-04', name: 'Independence Day', class: 'major' },
    { day: '2026-07-05', name: 'July 5 (fireworks aftermath)', class: 'minor' },
    { day: '2026-11-26', name: 'Thanksgiving', class: 'major' },
    { day: '2026-12-25', name: 'Christmas Day', class: 'major' },
  ];
  return new Map(rows.map((r) => [r.day, r]));
}
