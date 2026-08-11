import { adminDb } from '@/lib/admin/auth';
import { ReviewActions } from './ReviewActions';

/**
 * Classification review queue (CLAUDE.md §9 `/admin/review`).
 *
 * This is the other half of "precision over recall" (§7). Holding a facility back as
 * `needs_review` is only defensible if something actually reviews it — otherwise the
 * strict classifier just quietly loses hospitals, which in a rural county is its own kind
 * of harm.
 *
 * Each row shows WHY the importer landed where it did, taken from `seed_sources`, so the
 * decision is explicable rather than a coin flip.
 */

export const dynamic = 'force-dynamic';

interface SeedSource {
  source?: string;
  source_id?: string;
  classification?: string;
  url?: string;
  retrieved_at?: string;
}

interface Row {
  id: string;
  name: string;
  facility_type: string;
  status: string;
  address1: string | null;
  city: string | null;
  state: string;
  phone: string | null;
  website: string | null;
  is_24_7: boolean | null;
  seed_sources: SeedSource[] | null;
}

export default async function ReviewPage() {
  const db = await adminDb();

  const { data, error } = await db
    .from('facilities')
    .select(
      'id, name, facility_type, status, address1, city, state, phone, website, is_24_7, seed_sources',
    )
    .neq('status', 'active')
    .order('state')
    .order('name');

  if (error) {
    return <p className="text-rose-400">Could not load the queue: {error.message}</p>;
  }

  const rows = (data ?? []) as Row[];
  const bySource = rows.reduce<Record<string, number>>((acc, row) => {
    const source = row.seed_sources?.[0]?.source ?? 'unknown';
    acc[source] = (acc[source] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Facilities held out of the map because their classification is not confirmed. A
          pin on an emergency map is a claim that someone can be seen there — these have not
          earned that claim yet. Approving one puts it on the map; rejecting one keeps it in
          the registry, out of sight, with its provenance intact.
        </p>
        {rows.length ? (
          <p className="mt-2 text-xs text-slate-500">
            {rows.length} awaiting review ·{' '}
            {Object.entries(bySource)
              .map(([source, n]) => `${n} from ${source}`)
              .join(' · ')}
          </p>
        ) : null}
      </header>

      {!rows.length ? (
        <p className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
          Nothing to review. Every facility in the registry is either live on the map or
          already resolved.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const source = row.seed_sources?.[0];
            return (
              <li
                key={row.id}
                className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-medium text-slate-100">{row.name}</h2>
                    <p className="mt-0.5 text-sm text-slate-400">
                      {[row.address1, row.city, row.state].filter(Boolean).join(', ')}
                      {row.phone ? ` · ${row.phone}` : ''}
                      {row.is_24_7 ? ' · 24/7' : ''}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                        {row.facility_type}
                      </span>
                      <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-amber-300">
                        {row.status}
                      </span>
                      {row.website ? (
                        <a
                          href={row.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                        >
                          website
                        </a>
                      ) : null}
                      {source?.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                        >
                          evidence
                        </a>
                      ) : null}
                    </p>
                  </div>

                  <ReviewActions facilityId={row.id} currentType={row.facility_type} />
                </div>

                {/* Why the importer decided what it decided — the whole point of the queue. */}
                {source?.classification ? (
                  <p className="mt-3 border-l-2 border-slate-700 pl-3 text-xs leading-relaxed text-slate-400">
                    <span className="text-slate-500">
                      {source.source ?? 'source'} said:
                    </span>{' '}
                    {source.classification}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
