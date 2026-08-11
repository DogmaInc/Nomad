/**
 * Model invariants (CLAUDE.md §15).
 *
 * These encode the things an ER tech would notice instantly if they broke. §6.2 puts it
 * plainly: "If a computed pattern would make an ER tech laugh, the model is wrong."
 */

import { describe, expect, it } from 'vitest';
import { estimateWait } from './estimate';
import { testHolidays, testParams } from './fixtures';
import type { EstimableFacility } from './types';

const params = testParams();
const holidays = testHolidays();

/** A suburban ER with 2 nearby alternatives — the §6.2 anchor facility. */
const suburbanEr: EstimableFacility = {
  facilityType: 'er',
  tz: 'America/New_York',
  densityMult: 1.0,
  hoursConfidence: 'seeded',
};

/** Build a UTC instant that lands on a given local wall-clock time in New York. */
function nyInstant(localIso: string): Date {
  // EDT is UTC-4 (Mar–Nov); EST is UTC-5. The callers below pick dates well inside a
  // single offset so this stays unambiguous.
  const [datePart, timePart] = localIso.split('T');
  const month = Number(datePart.split('-')[1]);
  const offset = month >= 4 && month <= 10 ? 4 : 5;
  const [h, m] = timePart.split(':').map(Number);
  const utcHour = h + offset;
  const base = new Date(`${datePart}T00:00:00Z`);
  base.setUTCHours(utcHour, m, 0, 0);
  return base;
}

function estimate(facility: EstimableFacility, at: Date) {
  const result = estimateWait(facility, at, params, holidays);
  if (!result) throw new Error('expected an estimate');
  return result;
}

describe('hour-of-day', () => {
  it('overnight is slower than mid-morning on the same day', () => {
    // 2026-06-16 is a Tuesday.
    const overnight = estimate(suburbanEr, nyInstant('2026-06-16T02:30'));
    const midMorning = estimate(suburbanEr, nyInstant('2026-06-16T10:00'));
    expect(overnight.p50Minutes).toBeGreaterThan(midMorning.p50Minutes);
  });

  it('the evening slam is the peak of the day', () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      estimate(suburbanEr, nyInstant(`2026-06-16T${String(h).padStart(2, '0')}:00`)),
    );
    const peak = hours.reduce((a, b) => (b.p50Minutes > a.p50Minutes ? b : a));
    expect(peak.localHour).toBeGreaterThanOrEqual(19);
    expect(peak.localHour).toBeLessThanOrEqual(22);
  });

  it('9am–12pm is the fastest window', () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      estimate(suburbanEr, nyInstant(`2026-06-16T${String(h).padStart(2, '0')}:00`)),
    );
    const fastest = hours.reduce((a, b) => (b.p50Minutes < a.p50Minutes ? b : a));
    expect(fastest.localHour).toBeGreaterThanOrEqual(9);
    expect(fastest.localHour).toBeLessThan(12);
  });
});

describe('day class', () => {
  it('Sunday is slower than Tuesday at the same hour', () => {
    const sunday = estimate(suburbanEr, nyInstant('2026-06-21T02:30')); // Sunday
    const tuesday = estimate(suburbanEr, nyInstant('2026-06-16T02:30')); // Tuesday
    expect(sunday.dayClass).toBe('sunday');
    expect(tuesday.dayClass).toBe('weekday');
    expect(sunday.p50Minutes).toBeGreaterThan(tuesday.p50Minutes);
  });

  it('July 4 is worse than an ordinary Sunday', () => {
    const julyFourth = estimate(suburbanEr, nyInstant('2026-07-04T20:00'));
    const ordinarySunday = estimate(suburbanEr, nyInstant('2026-06-21T20:00'));
    expect(julyFourth.dayClass).toBe('holiday');
    expect(julyFourth.p50Minutes).toBeGreaterThan(ordinarySunday.p50Minutes);
  });

  it('holiday_adjacent sits between weekday and holiday', () => {
    const weekday = params.dayMults.weekday;
    const adjacent = params.dayMults.holiday_adjacent;
    const holiday = params.dayMults.holiday;
    expect(adjacent).toBeGreaterThan(weekday);
    expect(adjacent).toBeLessThan(holiday);

    // July 3 is a minor holiday → holiday_adjacent.
    expect(estimate(suburbanEr, nyInstant('2026-07-03T20:00')).dayClass)
      .toBe('holiday_adjacent');
  });

  it('derives holiday_adjacent for a day flanking a major holiday with no row of its own', () => {
    // Dec 24 has no fixture row, but Dec 25 is major.
    expect(estimate(suburbanEr, nyInstant('2026-12-24T20:00')).dayClass)
      .toBe('holiday_adjacent');
  });

  it('classifies Sunday 2 a.m. as sunday, by local date (§6.1)', () => {
    // The queue that formed Saturday night is still standing there at 2 a.m. Sunday,
    // but the spec is explicit that the local DATE decides the class.
    const result = estimate(suburbanEr, nyInstant('2026-06-21T02:00'));
    expect(result.localDate).toBe('2026-06-21');
    expect(result.dayClass).toBe('sunday');
  });
});

describe('timezone (§6.1 — local time or nothing)', () => {
  it('Maryland and Texas at the same UTC instant use different local hours', () => {
    const maryland: EstimableFacility = { ...suburbanEr, tz: 'America/New_York' };
    const texas: EstimableFacility = { ...suburbanEr, tz: 'America/Chicago' };
    const instant = new Date('2026-06-16T04:00:00Z');

    const md = estimate(maryland, instant);
    const tx = estimate(texas, instant);

    expect(md.localHour).toBe(0); // midnight EDT
    expect(tx.localHour).toBe(23); // 11 p.m. CDT, previous day
    expect(md.localDate).not.toBe(tx.localDate);
    // Different hours of the curve → genuinely different estimates.
    expect(md.p50Minutes).not.toBe(tx.p50Minutes);
  });

  it('survives the spring-forward transition without crashing or double-counting', () => {
    // 2026-03-08 07:00 UTC is inside the hour the US skips (2 a.m. EST → 3 a.m. EDT).
    const result = estimate(suburbanEr, new Date('2026-03-08T07:00:00Z'));
    expect(result.localHour).toBeGreaterThanOrEqual(0);
    expect(result.localHour).toBeLessThanOrEqual(23);
    expect(Number.isFinite(result.p50Minutes)).toBe(true);
  });

  it('survives the fall-back transition, where a local hour happens twice', () => {
    const first = estimate(suburbanEr, new Date('2026-11-01T05:00:00Z'));
    const second = estimate(suburbanEr, new Date('2026-11-01T06:00:00Z'));
    for (const r of [first, second]) {
      expect(r.localHour).toBeGreaterThanOrEqual(0);
      expect(r.localHour).toBeLessThanOrEqual(23);
    }
    // Both are 1 a.m. local — the repeated hour — and that is fine, not a double count.
    expect(first.localHour).toBe(1);
    expect(second.localHour).toBe(1);
  });
});

describe('density (§6.2)', () => {
  it('is monotonic — fewer nearby ERs means a longer wait', () => {
    const at = nyInstant('2026-06-16T02:30');
    const ladder = [1.3, 1.15, 1.0, 0.92, 0.85]; // 0 others → 7+ others
    const estimates = ladder.map((densityMult) =>
      estimate({ ...suburbanEr, densityMult }, at).p50Minutes,
    );
    for (let i = 1; i < estimates.length; i++) {
      expect(estimates[i]).toBeLessThan(estimates[i - 1]);
    }
  });
});

describe('clamps and bands', () => {
  it('band_lo < p50 < band_hi always', () => {
    for (let h = 0; h < 24; h++) {
      const r = estimate(suburbanEr, nyInstant(`2026-06-16T${String(h).padStart(2, '0')}:00`));
      expect(r.bandLoMinutes).toBeLessThan(r.p50Minutes);
      expect(r.bandHiMinutes).toBeGreaterThan(r.p50Minutes);
    }
  });

  it('holds the max clamp when multipliers do stack past it', () => {
    // density_mult is the only unbounded input (it is precomputed, not from the ladder),
    // so an absurd value is the way to prove the clamp mechanism actually fires.
    const absurd: EstimableFacility = { ...suburbanEr, densityMult: 5 };
    const r = estimate(absurd, nyInstant('2026-07-04T20:00'));
    expect(r.p50Minutes).toBe(params.baseWaits.er!.maxMinutes);
    expect(r.factors.clamped).toBe('max');
  });

  /**
   * FOR ROD, at the M1 gate: with the §6.2 numbers as written, the ER max clamp of 360 min
   * is unreachable. The worst case the model can produce — July 4, 8 p.m. (peak evening ×
   * holiday × shift handoff) at the scarcest density rung — is ~335 min. So the clamp is
   * inert headroom rather than a live ceiling, and §6.2's note that this anchor "clamps"
   * is not what happens. Nothing is broken; it only means raising max above 360 would
   * change nothing, while lowering it below ~335 would start binding on holiday evenings.
   */
  it('never reaches the max clamp under the real §6.2 parameter ranges', () => {
    const worstCase = 85 * 1.55 * 1.7 * 1.15 * 1.3;
    expect(worstCase).toBeCloseTo(334.84, 1);
    expect(worstCase).toBeLessThan(params.baseWaits.er!.maxMinutes);

    const scarcest: EstimableFacility = { ...suburbanEr, densityMult: 1.3 };
    const r = estimate(scarcest, nyInstant('2026-07-04T20:00'));
    expect(r.factors.clamped).toBeNull();
    expect(r.p50Minutes).toBeCloseTo(worstCase, 3);
  });

  it('holds the min clamp', () => {
    const roomy: EstimableFacility = { ...suburbanEr, facilityType: 'urgent_care', densityMult: 0.85 };
    for (let h = 0; h < 24; h++) {
      const r = estimate(roomy, nyInstant(`2026-06-16T${String(h).padStart(2, '0')}:00`));
      expect(r.p50Minutes).toBeGreaterThanOrEqual(params.baseWaits.urgent_care!.minMinutes);
    }
  });

  it('widens the band when hours are unknown', () => {
    const at = nyInstant('2026-06-16T02:30');
    const known = estimate({ ...suburbanEr, hoursConfidence: 'verified' }, at);
    const unknown = estimate({ ...suburbanEr, hoursConfidence: 'unknown' }, at);
    expect(unknown.p50Minutes).toBe(known.p50Minutes); // same central estimate
    expect(unknown.bandLoMinutes).toBeLessThan(known.bandLoMinutes);
    expect(unknown.bandHiMinutes).toBeGreaterThan(known.bandHiMinutes);
  });
});

describe('specialty facilities (§8)', () => {
  it('returns null — appointment-based, never a walk-in queue', () => {
    const specialty: EstimableFacility = { ...suburbanEr, facilityType: 'specialty' };
    expect(estimateWait(specialty, nyInstant('2026-06-16T10:00'), params, holidays)).toBeNull();
  });
});

describe('§6.2 sanity anchors', () => {
  // Snapshot-style assertions. §15: update deliberately when Rod re-tunes.
  it('Sunday 2:30 a.m. ≈ 159 min', () => {
    const r = estimate(suburbanEr, nyInstant('2026-06-21T02:30'));
    expect(r.p50Minutes).toBeCloseTo(85 * 1.25 * 1.5, 5);
    expect(r.p50Minutes).toBeCloseTo(159.375, 3);
  });

  it('Tuesday 10 a.m. = 51 min', () => {
    const r = estimate(suburbanEr, nyInstant('2026-06-16T10:00'));
    expect(r.p50Minutes).toBeCloseTo(85 * 0.6, 5);
    expect(r.p50Minutes).toBeCloseTo(51, 3);
  });

  it('July 4th 8 p.m. ≈ 258 min, including the shift-handoff multiplier', () => {
    const r = estimate(suburbanEr, nyInstant('2026-07-04T20:00'));
    expect(r.factors.shift).toBe(1.15); // 19–21 window
    expect(r.p50Minutes).toBeCloseTo(85 * 1.55 * 1.7 * 1.15, 3);
    expect(r.p50Minutes).toBeCloseTo(257.5713, 2);
  });
});
