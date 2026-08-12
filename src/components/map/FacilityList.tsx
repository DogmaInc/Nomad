'use client';

import { useMemo, useState } from 'react';
import type { FacilityPin } from '@/lib/facilities/query';
import type { NearbyFacility } from '@/lib/facilities/useNearby';

/**
 * The ranked list — the actual answer (CLAUDE.md §10.3, docs/DESIGN-DIRECTION.md).
 *
 * A map answers "where". The question someone is really asking at 2 a.m. is "which one,
 * and how long". This list answers that, and it is the only view that works one-handed in
 * a car park — which is 95–100% of use (§12).
 *
 * Three rules carry the design:
 *
 *  1. **The wait band is the loudest thing in the row.** It is set in the mono face at
 *     display size, because it is a measurement and the type system says measurements are
 *     mono. It is the first thing the eye lands on and the only reason the row exists.
 *
 *  2. **Provenance is attached, permanently.** Directly beneath the number, in mono, faint.
 *     Never a tooltip, never a footnote. The product's claim is that it is honest about
 *     what it knows, so the honesty has to be visible at the same moment as the number.
 *
 *  3. **Severity is encoded twice** — a colour rail and the band text itself — so it never
 *     depends on colour alone (§10.1). The ramp runs emerald → teal → amber → orange and
 *     never reaches red; §10.6 reserves red for the critical-signs banner, and a screen
 *     that shouts everywhere is a screen nobody can read.
 */

const TYPE_LABEL: Record<string, string> = {
  er: 'ER',
  er_specialty: 'ER + specialty',
  urgent_care: 'Urgent care',
};

type Filter = 'all' | 'er' | 'urgent_care' | 'open247';

/** Ramp thresholds in minutes. Tuned so a typical weekday morning reads green. */
function severity(p50: number | null) {
  if (p50 === null) return { rail: 'bg-ink-faint', text: 'text-ink-soft' };
  if (p50 < 45) return { rail: 'bg-emerald', text: 'text-emerald' };
  if (p50 < 90) return { rail: 'bg-teal', text: 'text-teal' };
  if (p50 < 150) return { rail: 'bg-amber', text: 'text-amber' };
  return { rail: 'bg-orange', text: 'text-orange' };
}

function isNearby(f: FacilityPin | NearbyFacility): f is NearbyFacility {
  return 'driveMinutes' in f;
}

/** "1¾ hr" / "40 min" — the same rounding language as the wait bands. */
function shortDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes / 5) * 5} min`;
  const halves = Math.round(minutes / 30) / 2;
  return `${halves % 1 === 0 ? halves : Math.floor(halves) + '½'} hr`;
}

export function FacilityList({
  facilities,
  onSelect,
  selectedId,
  onShowMap,
}: {
  facilities: Array<FacilityPin | NearbyFacility>;
  onSelect: (facility: FacilityPin) => void;
  selectedId?: string;
  onShowMap?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => {
    const matches = facilities.filter((f) => {
      if (filter === 'er') return f.facilityType === 'er' || f.facilityType === 'er_specialty';
      if (filter === 'urgent_care') return f.facilityType === 'urgent_care';
      if (filter === 'open247') return f.is247 === true;
      return true;
    });
    // With location, the caller has already ranked by total time until seen — preserve it.
    // Without it, the best we can do is shortest typical wait.
    if (matches.some(isNearby)) return matches;
    return [...matches].sort(
      (a, b) => (a.estimate?.p50Minutes ?? Infinity) - (b.estimate?.p50Minutes ?? Infinity),
    );
  }, [facilities, filter]);

  const filters: Array<[Filter, string]> = [
    ['all', `All ${facilities.length}`],
    ['er', 'Emergency'],
    ['urgent_care', 'Urgent care'],
    ['open247', 'Open 24/7'],
  ];

  return (
    <div className="flex h-full flex-col bg-ground">
      <div className="border-b border-line-soft py-2.5">
        {/* One scrolling row. Wrapping filters cost a second bar, and every bar sits
            between someone and the hospital they need. */}
        <div className="flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                filter === value
                  ? 'bg-ink text-ground'
                  : 'border border-line text-ink-soft active:bg-surface'
              }`}
            >
              {label}
            </button>
          ))}
          {onShowMap ? (
            <button
              onClick={onShowMap}
              className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-soft active:bg-surface md:hidden"
            >
              Map
            </button>
          ) : null}
        </div>
        <p className="provenance mt-2 truncate px-4">
          {shown.some(isNearby)
            ? 'ranked by drive + wait · modeled'
            : 'by typical wait · modeled, not live'}
        </p>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {shown.map((facility) => {
          const tone = severity(facility.estimate?.p50Minutes ?? null);
          const active = facility.id === selectedId;

          return (
            <li key={facility.id} className="border-b border-line-soft">
              <button
                onClick={() => onSelect(facility)}
                className={`flex w-full gap-3.5 px-4 py-4 text-left transition ${
                  active ? 'bg-surface' : 'active:bg-surface-sunk'
                }`}
              >
                {/* Severity rail — the second, non-colour-dependent encoding is the band text. */}
                <span
                  aria-hidden="true"
                  className={`mt-1 w-[3px] shrink-0 self-stretch rounded-full ${tone.rail}`}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={`measure whitespace-nowrap text-[25px] font-semibold leading-none tracking-tight ${tone.text}`}>
                      {isNearby(facility) && facility.totalMinutes !== null
                        ? shortDuration(facility.totalMinutes)
                        : facility.estimate?.band ?? '—'}
                    </span>
                    <span className="provenance shrink-0 uppercase tracking-[0.09em]">
                      {TYPE_LABEL[facility.facilityType] ?? facility.facilityType}
                    </span>
                  </span>

                  {/* The signature: provenance immediately under the number, always.
                      With location we show the arithmetic, because "drive + wait" is the
                      claim and hiding either half would make the total unfalsifiable. */}
                  <span className="provenance mt-1.5 block">
                    {isNearby(facility) && facility.totalMinutes !== null
                      ? `until treated · ~${facility.driveMinutes} min drive + ${facility.estimate?.band ?? '—'} wait · modeled`
                      : 'until treated · modeled'}
                    {facility.hoursConfidence === 'unknown' ? ' · hours unconfirmed' : ''}
                  </span>

                  <span className="mt-2.5 block truncate text-[15px] font-medium leading-snug text-ink">
                    {facility.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-soft">
                    {[facility.city, facility.state].filter(Boolean).join(', ')}
                    {facility.is247 ? ' · open 24/7' : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}

        {!shown.length ? (
          <li className="px-4 py-10 text-center text-sm text-ink-soft">
            No facilities match this filter.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
