'use client';

import { useState, useTransition } from 'react';
import { resolveFacility } from '../actions';

const TYPES = ['er', 'er_specialty', 'urgent_care'] as const;

/**
 * Approve a facility onto the map, or keep it out of it.
 *
 * Approving requires choosing the type explicitly rather than accepting whatever the
 * importer guessed — the guess is what put the row here in the first place.
 */
export function ReviewActions({
  facilityId,
  currentType,
}: {
  facilityId: string;
  currentType: string;
}) {
  const [type, setType] = useState<string>(
    TYPES.includes(currentType as (typeof TYPES)[number]) ? currentType : 'er',
  );
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(decision: 'approve' | 'reject') {
    startTransition(async () => {
      const result = await resolveFacility(facilityId, decision, type);
      setDone(result.message);
    });
  }

  if (done) {
    return <p className="text-sm text-emerald-400">{done}</p>;
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <label className="sr-only" htmlFor={`type-${facilityId}`}>
        Facility type
      </label>
      <select
        id={`type-${facilityId}`}
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        onClick={() => run('approve')}
        disabled={pending}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        Put on map
      </button>
      <button
        onClick={() => run('reject')}
        disabled={pending}
        className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
      >
        Keep off
      </button>
    </div>
  );
}
