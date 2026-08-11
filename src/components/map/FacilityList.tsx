'use client';

import { useMemo, useState } from 'react';
import type { FacilityPin } from '@/lib/facilities/query';

/**
 * The facility list beside the map (CLAUDE.md §10).
 *
 * A map alone answers "where", but the question a frightened owner is actually asking is
 * "which one, and how long". A sorted list answers that directly, and it is also the only
 * view that works when someone is scrolling one-handed in a parking lot.
 *
 * Design direction, committed per §12 — "the honest night map":
 *  - The estimate band is the loudest thing in every row. Provenance and freshness sit
 *    immediately under it, permanently, as the signature treatment: the product's claim is
 *    that it is honest about what it knows, so that has to be visible, not a footnote.
 *  - Severity runs teal → amber → orange and NEVER red; §10.6 reserves red for the
 *    critical-signs banner alone, and an emergency map that shouts everywhere is an
 *    emergency map nobody can read.
 *  - Colour is always paired with the band text. Never colour alone (§10.1).
 */

const TYPE_LABEL: Record<string, string> = {
  er: 'ER',
  er_specialty: 'ER + specialty',
  urgent_care: 'Urgent care',
};

type Filter = 'all' | 'er' | 'urgent_care' | 'open247';

function severity(p50: number | null): { dot: string; text: string } {
  if (p50 === null) return { dot: 'bg-slate-500', text: 'text-slate-300' };
  if (p50 < 45) return { dot: 'bg-emerald-400', text: 'text-emerald-300' };
  if (p50 < 90) return { dot: 'bg-teal-300', text: 'text-teal-200' };
  if (p50 < 150) return { dot: 'bg-amber-300', text: 'text-amber-200' };
  if (p50 < 240) return { dot: 'bg-orange-400', text: 'text-orange-300' };
  return { dot: 'bg-orange-500', text: 'text-orange-300' };
}

export function FacilityList({
  facilities,
  onSelect,
  selectedId,
}: {
  facilities: FacilityPin[];
  onSelect: (facility: FacilityPin) => void;
  selectedId?: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => {
    const matches = facilities.filter((f) => {
      if (filter === 'er') return f.facilityType === 'er' || f.facilityType === 'er_specialty';
      if (filter === 'urgent_care') return f.facilityType === 'urgent_care';
      if (filter === 'open247') return f.is247 === true;
      return true;
    });
    // Shortest typical wait first — the question the list exists to answer.
    return matches.sort(
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
    <div className="flex h-full flex-col border-r border-slate-800/80 bg-slate-950">
      <div className="border-b border-slate-800/80 px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {filters.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filter === value
                  ? 'bg-slate-100 text-slate-900'
                  : 'border border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
          Sorted by typical wait. Every figure is modeled, not live — call to confirm.
        </p>
      </div>

      <ul className="flex-1 divide-y divide-slate-800/70 overflow-y-auto">
        {shown.map((facility) => {
          const tone = severity(facility.estimate?.p50Minutes ?? null);
          const active = facility.id === selectedId;

          return (
            <li key={facility.id}>
              <button
                onClick={() => onSelect(facility)}
                className={`w-full px-4 py-3.5 text-left transition ${
                  active ? 'bg-slate-900' : 'hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`text-lg font-semibold tabular-nums ${tone.text}`}>
                    {facility.estimate ? facility.estimate.band : '—'}
                  </span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">
                    {TYPE_LABEL[facility.facilityType] ?? facility.facilityType}
                  </span>
                </div>

                {/* Provenance, always. This is the signature element (§12). */}
                <p className="mt-0.5 text-[11px] text-slate-500">
                  typical at this hour · modeled
                  {facility.hoursConfidence === 'unknown' ? ' · hours unconfirmed' : ''}
                </p>

                <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-slate-100">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                  <span className="truncate">{facility.name}</span>
                </p>
                <p className="truncate text-xs text-slate-400">
                  {[facility.city, facility.state].filter(Boolean).join(', ')}
                  {facility.is247 ? ' · open 24/7' : ''}
                </p>
              </button>
            </li>
          );
        })}

        {!shown.length ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">
            No facilities match this filter.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
