/**
 * Display formatting (CLAUDE.md §6.3, §15).
 *
 * The §6.2 anchors are asserted here against what §6.3's stated rounding steps actually
 * produce. Where those two disagree, the discrepancy is documented in format.ts rather
 * than hidden by a fudged expectation — see the box comment there.
 */

import { describe, expect, it } from 'vitest';
import { formatBand, formatDuration, formatModeledEstimate, roundMinutes } from './format';

describe('roundMinutes (§6.3 steps)', () => {
  it('uses 15-minute steps below 90 minutes', () => {
    expect(roundMinutes(33)).toBe(30);
    expect(roundMinutes(38)).toBe(45);
    expect(roundMinutes(51)).toBe(45);
    expect(roundMinutes(74)).toBe(75);
  });

  it('uses half-hour steps from 90 minutes', () => {
    expect(roundMinutes(103)).toBe(90);
    expect(roundMinutes(159)).toBe(150);
    expect(roundMinutes(231)).toBe(240);
  });

  it('uses whole hours from four hours up', () => {
    expect(roundMinutes(258)).toBe(240);
    expect(roundMinutes(374)).toBe(360);
  });
});

describe('formatDuration', () => {
  it('renders minutes below an hour', () => {
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(45)).toBe('45 min');
  });

  it('renders hours with fractions', () => {
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(75)).toBe('1¼ hr');
    expect(formatDuration(90)).toBe('1½ hr');
    expect(formatDuration(240)).toBe('4 hr');
  });
});

describe('formatBand', () => {
  it('states the unit once when both ends are hours', () => {
    expect(formatBand(90, 150)).toBe('1½–2½ hr');
  });

  it('keeps both units when the ends straddle an hour', () => {
    expect(formatBand(33, 74)).toBe('30 min–1¼ hr');
  });

  it('marks open-ended long waits with a plus', () => {
    expect(formatBand(168, 374)).toBe('3–6 hr+');
  });

  it('collapses to a single figure when rounding makes the ends equal', () => {
    expect(formatBand(88, 92)).toBe('1½ hr');
  });
});

describe('§6.2 sanity anchors as displayed', () => {
  // p50 159.375 → band [103.6, 231.1]. Spec text says "1¾–4 hr"; the stated
  // half-hour step cannot produce 1¾, so this is "1½–4 hr". See format.ts.
  it('Sunday 2:30 a.m.', () => {
    expect(formatBand(159.375 * 0.65, 159.375 * 1.45)).toBe('1½–4 hr+');
  });

  // p50 51 → band [33.2, 74.0]. Spec text says "35 min–1¼ hr"; 35 is not a
  // 15-minute step, so this is "30 min–1¼ hr".
  it('Tuesday 10 a.m.', () => {
    expect(formatBand(51 * 0.65, 51 * 1.45)).toBe('30 min–1¼ hr');
  });

  // p50 257.57 → band [167.4, 373.5]. Matches the spec's "3–6 hr" exactly.
  it('July 4th 8 p.m. matches the spec text exactly', () => {
    expect(formatBand(257.571 * 0.65, 257.571 * 1.45)).toBe('3–6 hr+');
  });
});

describe('formatModeledEstimate', () => {
  it('always carries provenance and the call-to-confirm line (invariant #4)', () => {
    const sentence = formatModeledEstimate(103.6, 231.1);
    expect(sentence).toContain('modeled');
    expect(sentence).toContain('call to confirm');
    expect(sentence).toMatch(/^Typically /);
  });
});
