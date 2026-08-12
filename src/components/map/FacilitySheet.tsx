'use client';

import { useEffect, useRef } from 'react';
import type { FacilityPin } from '@/lib/facilities/query';
import { DirectionsButton } from './DirectionsButton';
import { ReportWait } from './ReportWait';

/**
 * Bottom-sheet facility card (CLAUDE.md §10.1).
 *
 * Call and Directions are the two dominant actions, because the person reading this is
 * holding a sick animal and needs to move, not browse. Every estimate carries its
 * provenance and the call-to-confirm line — that is invariant #4, not decoration.
 *
 * Pre-design, as with the map: §12's reference pass is still owed.
 */

/** Plain words. A frightened owner should not have to decode a schema enum. */
const CAPABILITY_LABEL: Record<string, string> = {
  overnight_care: 'Overnight care',
  exotics: 'Exotics',
  avian: 'Birds',
  oxygen_support: 'Oxygen',
  isolation: 'Isolation ward',
  er_surgery: 'Emergency surgery',
  endoscopy: 'Endoscopy',
  ventilator: 'Ventilator',
  blood_products: 'Blood transfusion',
  ct: 'CT scan',
  mri: 'MRI',
  dialysis: 'Dialysis',
};

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

  const isEmergency =
    facility.facilityType === 'er' || facility.facilityType === 'er_specialty';

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
            {/* Name what the number measures. "Wait" is ambiguous — see the open-floor note
                below — and an unqualified figure invites the wrong reading. */}
            <p className="mt-1 text-sm text-slate-400">
              Typical time until your pet is <strong>treated</strong> — not just greeted ·
              modeled estimate · <strong>call to confirm</strong>
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

      {/* Hours honesty (§6.3).
          An emergency hospital that is not currently 24/7 stays on the map — policy changes
          constantly and websites lag, so published hours can be stale in either direction.
          The caveat goes here, in the display, rather than being resolved by quietly
          dropping the hospital from the registry. */}
      {facility.hoursConfidence === 'unknown' && !facility.is247 ? (
        <p className="mt-3 text-sm text-amber-300">Hours unknown — call first.</p>
      ) : isEmergency && !facility.is247 ? (
        <p className="mt-3 text-sm text-amber-300">
          Not listed as 24/7 right now — emergency hours change often and sites lag. Call
          before you drive.
        </p>
      ) : null}

      {/* Open-floor hospitals (§ care_model migration).
          At VEG and similar, a vet triages almost immediately and owners stay with their
          pet the whole time — so someone who has been there remembers "no wait", while the
          estimate above says two hours. Both are true, and they measure different things.
          Saying so is the difference between the number looking wrong and looking honest. */}
      {facility.careModel === 'open_floor' ? (
        <div className="mt-3 rounded-lg border border-sky-900/60 bg-sky-950/30 p-3">
          <p className="text-sm font-medium text-sky-200">Open-floor hospital</p>
          <p className="mt-1 text-xs leading-relaxed text-sky-100/80">
            A vet usually looks at your pet within minutes of arriving, and you stay with
            them the whole time. That first look is triage — it decides how urgent your pet
            is, not that treatment has started. If your pet is stable, the wait above is
            still a fair guide to diagnostics, results and treatment.
          </p>
        </div>
      ) : null}

      {/* Capability chips (§10.1). These are the questions that actually decide where a
          critical case should go — an ER without a ventilator or blood products cannot
          treat some cases at all, and that is worth knowing before driving. */}
      {facility.capabilities.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {facility.capabilities.map((capability) => (
            <li
              key={capability}
              className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300"
            >
              {CAPABILITY_LABEL[capability] ?? capability.replace(/_/g, ' ')}
            </li>
          ))}
        </ul>
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
        <DirectionsButton
          lat={facility.lat}
          lng={facility.lng}
          className="rounded-lg border border-slate-600 px-4 py-3 text-center font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-60"
        />
      </div>

      <ReportWait facilityId={facility.id} lat={facility.lat} lng={facility.lng} />
    </div>
  );
}
