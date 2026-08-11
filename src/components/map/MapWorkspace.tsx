'use client';

import { useCallback, useState } from 'react';
import type { FacilityPin } from '@/lib/facilities/query';
import FacilityMap from './FacilityMap';
import { FacilityList } from './FacilityList';
import { FacilitySheet } from './FacilitySheet';

/**
 * Map + list, sharing one selection (CLAUDE.md §10).
 *
 * On a phone the list is the primary view and the map is the context; on a desktop they sit
 * side by side. Selecting in either opens the same sheet, so there is one answer to "what
 * did I just tap" regardless of where the tap landed.
 */
export function MapWorkspace({ facilities }: { facilities: FacilityPin[] }) {
  const [selected, setSelected] = useState<FacilityPin | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');

  const handleSelect = useCallback((facility: FacilityPin) => {
    setSelected(facility);
  }, []);

  return (
    <div className="relative flex h-full flex-col md:flex-row">
      {/* Mobile: one at a time, because a half-height map plus a half-height list is
          two things you cannot read rather than one you can. */}
      <div className="flex border-b border-slate-800 md:hidden">
        {(['list', 'map'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setMobileView(view)}
            aria-pressed={mobileView === view}
            className={`flex-1 px-4 py-2.5 text-sm font-medium capitalize transition ${
              mobileView === view
                ? 'border-b-2 border-sky-400 text-slate-100'
                : 'text-slate-400'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      <aside
        className={`w-full md:w-[22rem] lg:w-[26rem] ${
          mobileView === 'list' ? 'flex-1 md:flex-none' : 'hidden md:block'
        }`}
      >
        <FacilityList
          facilities={facilities}
          onSelect={handleSelect}
          selectedId={selected?.id}
        />
      </aside>

      <div
        className={`relative flex-1 ${mobileView === 'map' ? 'block' : 'hidden md:block'}`}
      >
        <FacilityMap initial={facilities} onSelect={handleSelect} />
      </div>

      {selected ? (
        <FacilitySheet facility={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
