/** Shared model types (CLAUDE.md §6). */

export type FacilityType = 'er' | 'er_specialty' | 'specialty' | 'urgent_care';

export type DayClass =
  | 'weekday' | 'friday' | 'saturday' | 'sunday' | 'holiday' | 'holiday_adjacent';

export type HoursConfidence = 'verified' | 'seeded' | 'unknown';

export interface BaseWait {
  baseMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface ShiftWindow {
  /** Inclusive local hour. */
  startHour: number;
  /** Exclusive local hour. */
  endHour: number;
  multiplier: number;
}

export interface Holiday {
  /** YYYY-MM-DD, the facility's LOCAL date. */
  day: string;
  name: string;
  class: 'major' | 'minor';
}

/**
 * Every knob the model reads. Loaded from the DB tables (§5) so admin edits take effect
 * without a deploy — that is what makes the M1 gate passable by Rod alone.
 */
export interface ModelParams {
  baseWaits: Partial<Record<FacilityType, BaseWait>>;
  /** 24 multipliers indexed by local hour. */
  hodCurves: Partial<Record<FacilityType, number[]>>;
  dayMults: Record<DayClass, number>;
  shiftWindows: Partial<Record<FacilityType, ShiftWindow[]>>;
  bandLo: number;
  bandHi: number;
  bandLoHoursUnknown: number;
  bandHiHoursUnknown: number;
}

/** The minimum a facility must supply to be estimated. */
export interface EstimableFacility {
  facilityType: FacilityType;
  /** IANA timezone. Local time or nothing (§6.1). */
  tz: string;
  densityMult: number;
  hoursConfidence: HoursConfidence;
}

export interface WaitEstimate {
  p50Minutes: number;
  bandLoMinutes: number;
  bandHiMinutes: number;
  /** Inputs that produced this number — the inspection page shows them (§4 M1). */
  localHour: number;
  localDate: string;
  dayClass: DayClass;
  /** Each multiplier applied, for "why is this number what it is". */
  factors: {
    base: number;
    hod: number;
    day: number;
    shift: number;
    density: number;
    clamped: 'min' | 'max' | null;
  };
}
