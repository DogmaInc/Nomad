'use client';

import { useEffect, useRef } from 'react';
import type { FacilityPin } from '@/lib/facilities/query';

/**
 * Bottom-sheet facility card (CLAUDE.md §10.1).
 *
 * Call and Directions are the two dominant actions, because the person reading this is
 * holding a sick animal and needs to move, not browse. Every estimate carries its
 * provenance and the call-to-confirm line — that is invariant #4, not decoration.
 *
 * Pre-design, as with the map: §12's reference pass is still owed.
 */

const TYPE_LABEL: Record<string, string> = {
  er: 'Emergency hospital',
  er_specialty: 'Emergency + specialty',
  urgent_care: 'Urgent care',
  specialty: 'Referral/specialty — not a walk-in ER',
};

export function FacilitySheet({
  facility,
  onClose,
}: {
  facility: FacilityPin;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes, and focus moves into the sheet so keyboard users are not stranded
  // behind the map canvas.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`;
  const address = [facility.address1, facility.city, facility.state]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={facility.name}
      className="absolute inset-x-0 bottom-0 z-20 mx-auto max-w-xl rounded-t-2xl border border-slate-700 bg-slate-900/95 p-5 text-slate-100 shadow-2xl backdrop-blur"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{facility.name}</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {TYPE_LABEL[facility.facilityType] ?? facility.facilityType}
            {facility.is247 ? ' · Open 24/7' : ''}
          </p>
          {address ? <p className="mt-1 text-sm text-slate-400">{address}</p> : null}
        </div>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      {/* ── the estimate, always with provenance and freshness (invariant #4) ── */}
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
        {facility.estimate ? (
          <>
            <p className="text-2xl font-semibold tabular-nums">{facility.estimate.band}</p>
            <p className="mt-1 text-sm text-slate-400">
              Typical wait at this hour · modeled estimate · <strong>call to confirm</strong>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              No live data from this hospital. Based on typical patterns for this facility
              type at {String(facility.estimate.localHour).padStart(2, '0')}:00 local on a{' '}
              {facility.estimate.dayClass.replace('_', '-')}.
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-medium">Referral / specialty practice</p>
            <p className="mt-1 text-sm text-slate-400">
              Appointment-based — not a walk-in emergency room. Call before going.
            </p>
          </>
        )}
      </div>

      {facility.hoursConfidence === 'unknown' && !facility.is247 ? (
        <p className="mt-3 text-sm text-amber-300">Hours unknown — call first.</p>
      ) : null}

      {/* ── the two actions that matter ── */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {facility.phone ? (
          <a
            href={`tel:${facility.phone}`}
            className="rounded-lg bg-sky-600 px-4 py-3 text-center font-semibold text-white hover:bg-sky-500"
          >
            Call this ER
          </a>
        ) : (
          <span className="rounded-lg border border-slate-700 px-4 py-3 text-center text-slate-500">
            No phone listed
          </span>
        )}
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-600 px-4 py-3 text-center font-semibold text-slate-100 hover:bg-slate-800"
        >
          Get directions
        </a>
      </div>
    </div>
  );
}
