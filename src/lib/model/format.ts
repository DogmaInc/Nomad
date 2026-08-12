/**
 * Display formatting (CLAUDE.md §6.3).
 *
 * Rules, verbatim from the spec:
 *   - Never a bare number — always a rounded, friendly range.
 *   - <90 min → 15-min steps; ≥90 min → half-hour steps; ≥4 hr → "4–6 hr+".
 *
 * The rounding is deliberately coarse. A range that reads "1½–4 hr" tells the truth about
 * how much we know; "103–231 min" implies a precision the model does not have, and
 * invariant #4 exists because a fake-precise number can send someone driving the wrong way.
 *
 * ┌ KNOWN DISCREPANCY — for Rod, at the M1 gate ─────────────────────────────────┐
 * │ Applying these rules literally reproduces the third §6.2 sanity anchor        │
 * │ exactly ("3–6 hr") but lands one rounding step below the other two on the      │
 * │ LOW end only:                                                                 │
 * │     Sunday 2:30 a.m.  spec "1¾–4 hr"      → this code "1½–4 hr"                │
 * │     Tuesday 10 a.m.   spec "35 min–1¼ hr" → this code "30 min–1¼ hr"           │
 * │ The spec's low ends (105 min, 35 min) are not reachable from the stated        │
 * │ steps: 105 is not a half-hour step, and 35 is not a 15-min step. So the two    │
 * │ rules genuinely conflict and one had to give. The step rule won because it is  │
 * │ stated as a rule, while the anchors are written with "≈" and §6.2 calls the    │
 * │ numbers knobs. Both alternatives are one line to switch — see FRACTIONS and    │
 * │ roundToStep — and §15 wants these as snapshot tests either way.                │
 * └───────────────────────────────────────────────────────────────────────────────┘
 */

const MINUTES_PER_HOUR = 60;
const FOUR_HOURS = 240;

/** Round to the step §6.3 prescribes for that magnitude. */
export function roundMinutes(minutes: number): number {
  if (minutes >= FOUR_HOURS) return Math.round(minutes / 60) * 60;
  if (minutes >= 90) return Math.round(minutes / 30) * 30;
  return Math.round(minutes / 15) * 15;
}

const FRACTIONS: Array<[number, string]> = [
  [0, ''],
  [0.25, '¼'],
  [0.5, '½'],
  [0.75, '¾'],
];

/** 90 → "1½", 240 → "4", 45 → "45 min". Hours are returned without the unit. */
function hoursLabel(minutes: number): string {
  const whole = Math.floor(minutes / MINUTES_PER_HOUR);
  const remainder = (minutes % MINUTES_PER_HOUR) / MINUTES_PER_HOUR;
  const fraction = FRACTIONS.reduce((best, candidate) =>
    Math.abs(candidate[0] - remainder) < Math.abs(best[0] - remainder) ? candidate : best,
  )[1];
  if (whole === 0) return fraction || '0';
  return `${whole}${fraction}`;
}

/** A single duration with its unit: "45 min", "1½ hr". */
export function formatDuration(minutes: number): string {
  const rounded = roundMinutes(minutes);
  if (rounded < MINUTES_PER_HOUR) return `${rounded} min`;
  return `${hoursLabel(rounded)} hr`;
}

/**
 * The band as one phrase: "30 min–1¼ hr", "1½–4 hr", "3–6 hr+".
 *
 * The unit is stated once when both ends are in hours, which is how a person says it.
 * A "+" is appended when the top end is at or past four hours, per §6.3 — beyond that
 * the model is honestly saying "a long time", not a specific figure.
 */
export function formatBand(loMinutes: number, hiMinutes: number): string {
  const lo = roundMinutes(loMinutes);
  const hi = roundMinutes(hiMinutes);
  const plus = hi >= FOUR_HOURS ? '+' : '';

  // Degenerate after rounding (a heavily clamped facility) — show one figure, not "2–2 hr".
  if (lo === hi) return `${formatDuration(lo)}${plus}`;

  // State the unit once when both ends share it — "15–45 min", not "15 min–45 min".
  // That is how a person says it, and it stops the band wrapping on a narrow phone.
  if (lo >= MINUTES_PER_HOUR && hi >= MINUTES_PER_HOUR) {
    return `${hoursLabel(lo)}–${hoursLabel(hi)} hr${plus}`;
  }
  if (lo < MINUTES_PER_HOUR && hi < MINUTES_PER_HOUR) {
    return `${lo}–${hi} min`;
  }
  return `${formatDuration(lo)}–${formatDuration(hi)}${plus}`;
}

/**
 * The full public sentence, provenance included.
 *
 * "Call to confirm" is a standing UI pattern here, not a disclaimer bolted on the end
 * (§10.6) — every modeled estimate carries it because every modeled estimate is a guess
 * about a queue nobody has counted.
 */
export function formatModeledEstimate(loMinutes: number, hiMinutes: number): string {
  return `Typically ${formatBand(loMinutes, hiMinutes)} at this hour (modeled — call to confirm)`;
}
