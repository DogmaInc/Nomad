'use client';

import { useCallback, useState } from 'react';
import type { FacilityPin } from '@/lib/facilities/query';
import FacilityMap from './FacilityMap';
import { FacilityList } from './FacilityList';
import { FacilitySheet } from './FacilitySheet';
import { FurtherButFaster, NearbyPrompt } from './NearbyPrompt';
import { useNearby } from '@/lib/facilities/useNearby';

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
  const { location, request, ranked, furtherButFaster } = useNearby(facilities);

  const handleSelect = useCallback((facility: FacilityPin) => {
    setSelected(facility);
  }, []);

  return (
    <div className="relative flex h-full flex-col md:flex-row">
      <aside
        className={`w-full md:w-[22rem] lg:w-[26rem] ${
          mobileView === 'list' ? 'flex-1 md:flex-none' : 'hidden md:block'
        }`}
      >
        <div className="flex h-full flex-col">
          <NearbyPrompt location={location} onRequest={request} />
          {furtherButFaster ? (
            <FurtherButFaster callout={furtherButFaster} onSelect={handleSelect} />
          ) : null}
          <div className="min-h-0 flex-1">
            <FacilityList
              facilities={ranked ?? facilities}
              onSelect={handleSelect}
              selectedId={selected?.id}
              onShowMap={() => setMobileView('map')}
            />
          </div>
        </div>
      </aside>

      <div
        className={`relative flex-1 ${mobileView === 'map' ? 'block' : 'hidden md:block'}`}
      >
        <FacilityMap initial={facilities} onSelect={handleSelect} />
        <button
          onClick={() => setMobileView('list')}
          className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-line bg-ground/90 px-4 py-2 text-[13px] font-medium text-ink backdrop-blur md:hidden"
        >
          ← Back to list
        </button>
      </div>

      {selected ? (
        <FacilitySheet facility={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
