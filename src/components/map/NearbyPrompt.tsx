'use client';

import type { LocationState } from '@/lib/facilities/useNearby';
import type { NearbyFacility } from '@/lib/facilities/useNearby';

/**
 * The one primary action, and the sentence the product exists to say (§10.3, §8.4).
 *
 * §10.3 asks for one giant action on the home screen leading to a ranked list. This is it.
 * Before location, the list can only sort by typical wait, which ignores whether a
 * hospital is ten minutes away or ninety — so the ask is framed by what it buys the user,
 * not by the permission it needs.
 */
export function NearbyPrompt({
  location,
  onRequest,
}: {
  location: LocationState;
  onRequest: () => void;
}) {
  if (location.status === 'ready') return null;

  return (
    <div className="border-b border-line-soft px-4 py-3.5">
      <button
        onClick={onRequest}
        disabled={location.status === 'locating'}
        className="w-full rounded-xl bg-teal px-4 py-3.5 text-[15px] font-semibold text-ground transition active:brightness-90 disabled:opacity-70"
      >
        {location.status === 'locating' ? 'Finding you…' : 'Find fastest care near me'}
      </button>

      <p className="provenance mt-2">
        {location.status === 'denied'
          ? location.message
          : 'ranked by drive + wait · location stays on your device'}
      </p>
    </div>
  );
}

/**
 * "14 min further to drive — likely seen about an hour sooner."
 *
 * §8.4 calls this the product's thesis and asks for visual weight. It only appears when a
 * non-nearest hospital genuinely beats the nearest by 30 minutes or more, so it stays rare
 * enough to be believed.
 */
export function FurtherButFaster({
  callout,
  onSelect,
}: {
  callout: { facility: NearbyFacility; extraDriveMinutes: number; savedMinutes: number };
  onSelect: (facility: NearbyFacility) => void;
}) {
  const { facility, extraDriveMinutes, savedMinutes } = callout;

  return (
    <button
      onClick={() => onSelect(facility)}
      className="w-full border-b border-line-soft bg-surface-sunk px-4 py-3.5 text-left transition active:bg-surface"
    >
      <p className="provenance uppercase tracking-[0.1em] text-teal">Worth the extra drive</p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink">
        <span className="measure font-semibold text-teal">
          {extraDriveMinutes} min
        </span>{' '}
        further to drive — likely seen about{' '}
        <span className="measure font-semibold text-teal">
          {savedMinutes >= 60
            ? `${Math.round(savedMinutes / 30) / 2} hr`
            : `${savedMinutes} min`}
        </span>{' '}
        sooner at {facility.name}.
      </p>
    </button>
  );
}
