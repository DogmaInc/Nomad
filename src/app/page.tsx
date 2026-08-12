import dynamic from 'next/dynamic';
import { getFacilities } from '@/lib/facilities/query';
import { CriticalSignsBanner } from '@/components/CriticalSignsBanner';
import { DesktopHero } from '@/components/DesktopHero';

/**
 * DMV prototype home (CLAUDE.md §4 M1 / §10 / §12).
 *
 * Two audiences arrive at this URL needing opposite things:
 *
 *   A phone (95–100% of use) is someone mid-emergency. They get the product immediately —
 *   banner, one action, ranked hospitals. No marketing, nothing to scroll past.
 *
 *   A desktop visitor is discovering or sharing. They get the Flighty treatment: the pitch,
 *   with the real product running in a phone beside it.
 *
 * `?view=embed` renders the bare workspace. That is what the hero's phone frame loads, so
 * the thing in the picture is the running product rather than a screenshot that starts
 * lying the moment a row changes.
 *
 * Server-renders the facilities so both views have data on first paint — invariant #2 says
 * the map is useful to the very first user, and a spinner is not useful.
 */

// ssr:false is only permitted inside a Client Component in Next 16 (see AGENTS.md), so the
// workspace is imported normally and guards `window` inside its own effect instead.
const MapWorkspace = dynamic(() =>
  import('@/components/map/MapWorkspace').then((m) => m.MapWorkspace),
);

export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const facilities = await getFacilities({ bbox: [-84, 35, -74, 40.5] });

  // The phone inside the desktop hero. Bare product, no chrome, no hero of its own.
  if (view === 'embed') {
    return (
      <div className="flex h-dvh flex-col bg-ground text-ink">
        <CriticalSignsBanner />
        <div className="min-h-0 flex-1">
          <MapWorkspace facilities={facilities} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-ground text-ink">
      <DesktopHero facilities={facilities} />

      {/* On a phone this is the whole page and fills the viewport. On a desktop it sits
          below the pitch, for the visitor who wants to poke at the real thing. */}
      <div className="flex h-dvh flex-col md:h-[82vh]">
        {/* One line. Every bar above the answer is a bar between someone and an ER. */}
        <header className="flex items-baseline justify-between gap-3 px-4 py-2.5 md:hidden">
          <h1 className="text-[15px] font-semibold tracking-tight">
            Nomad <span className="font-normal text-ink-faint">· DMV</span>
          </h1>
          <span className="provenance">{facilities.length} ERs &amp; urgent care</span>
        </header>

        <CriticalSignsBanner />

        <div className="min-h-0 flex-1">
          <MapWorkspace facilities={facilities} />
        </div>
      </div>
    </div>
  );
}
