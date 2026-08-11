import dynamic from 'next/dynamic';
import { getFacilities } from '@/lib/facilities/query';
import { CriticalSignsBanner } from '@/components/CriticalSignsBanner';

/**
 * DMV prototype home (CLAUDE.md §4 M1 / §10).
 *
 * Server-renders the facilities so the map and list have data on first paint — invariant #2
 * says the map is useful to the very first user with zero clinics enrolled, and a spinner
 * is not useful.
 *
 * Only emergency-layer facilities are fetched: `getFacilities` defaults to er /
 * er_specialty / urgent_care and to status='active'. Appointment-only specialty practices
 * and unconfirmed classifications stay in the registry and off the map.
 */

// ssr:false is only permitted inside a Client Component in Next 16 (see AGENTS.md), so the
// workspace is imported normally and guards `window` inside its own effect instead.
const MapWorkspace = dynamic(() =>
  import('@/components/map/MapWorkspace').then((m) => m.MapWorkspace),
);

export const revalidate = 60;

export default async function HomePage() {
  const facilities = await getFacilities({ bbox: [-84, 35, -74, 40.5] });

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight">
              Nomad <span className="font-normal text-slate-500">· DMV prototype</span>
            </h1>
            <p className="truncate text-xs text-slate-500">
              {facilities.length} emergency and urgent-care facilities · estimates are
              typical for stable pets — always call ahead while driving
            </p>
          </div>
        </div>
      </header>

      <CriticalSignsBanner />

      <div className="min-h-0 flex-1">
        <MapWorkspace facilities={facilities} />
      </div>
    </div>
  );
}
