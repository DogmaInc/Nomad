import dynamic from 'next/dynamic';
import { getFacilities } from '@/lib/facilities/query';
import { CriticalSignsBanner } from '@/components/CriticalSignsBanner';

/**
 * DMV prototype home (CLAUDE.md §4 M1 / §10).
 *
 * Server-renders the facilities so the map has data on first paint — invariant #2 says the
 * map is useful to the very first user with zero clinics enrolled, and a spinner is not
 * useful.
 *
 * PRE-DESIGN: §12's reference pass is still owed. This proves the pipeline end to end.
 */

// ssr:false is only permitted inside a Client Component in Next 16 (see AGENTS.md), so the
// map is imported normally and guards `window` inside its own effect instead.
const FacilityMap = dynamic(() => import('@/components/map/FacilityMap'));

// Estimates move with the clock, so the page cannot be cached indefinitely.
export const revalidate = 60;

export default async function HomePage() {
  const facilities = await getFacilities({ state: undefined, bbox: [-84, 35, -74, 40.5] });
  const rankable = facilities.filter((f) => f.facilityType !== 'specialty');

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Nomad <span className="font-normal text-slate-500">· DMV prototype</span>
            </h1>
            <p className="text-xs text-slate-500">
              {rankable.length} emergency and urgent-care facilities · estimates are typical
              for stable pets — always call ahead while driving
            </p>
          </div>
        </div>
      </header>

      <CriticalSignsBanner />

      <div className="relative flex-1">
        <FacilityMap initial={facilities} />
      </div>
    </div>
  );
}
