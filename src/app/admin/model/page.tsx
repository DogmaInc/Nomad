import Link from 'next/link';
import { adminDb } from '@/lib/admin/auth';
import { loadModelParams } from '@/lib/model/params';
import { estimateAtLocal } from '@/lib/model/estimate';
import { formatBand } from '@/lib/model/format';
import type { DayClass, EstimableFacility, FacilityType, HoursConfidence } from '@/lib/model/types';
import { ParamEditor } from './ParamEditor';
import { logout } from '../actions';

/**
 * The M1 inspection page (CLAUDE.md §4, §9).
 *
 * The gate reads: "Rod looks at his own DMV hospitals on the inspection page and nods at
 * the Sunday 2 a.m. numbers." So this page shows every facility in a region across all 24
 * local hours for a chosen day class, using the same estimate function the map and the
 * ranking use — never a re-implementation, or the thing being signed off would not be the
 * thing that ships.
 */

export const dynamic = 'force-dynamic';

const DAY_CLASSES: Array<{ value: DayClass; label: string }> = [
  { value: 'weekday', label: 'Weekday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'holiday_adjacent', label: 'Holiday-adjacent' },
];

interface FacilityRow {
  id: string;
  name: string;
  city: string | null;
  state: string;
  facility_type: FacilityType;
  status: string;
  tz: string;
  density_mult: number | string;
  hours_confidence: HoursConfidence;
}

export default async function ModelInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; day?: string }>;
}) {
  // Authorisation and the data handle in one call — see lib/admin/auth.ts for why this
  // cannot live in the layout. Nothing below runs for an unauthenticated request.
  const db = await adminDb();

  const sp = await searchParams;
  const state = (sp.state ?? 'ALL').toUpperCase();
  const dayClass = (DAY_CLASSES.find((d) => d.value === sp.day)?.value ?? 'sunday') as DayClass;

  const { params } = await loadModelParams(db, { force: true });

  let query = db
    .from('facilities')
    .select('id, name, city, state, facility_type, status, tz, density_mult, hours_confidence')
    .order('state')
    .order('city');
  if (state !== 'ALL') query = query.eq('state', state);

  const [{ data: facilities, error }, { data: states }] = await Promise.all([
    query,
    db.from('facilities').select('state'),
  ]);

  if (error) {
    return <p className="text-rose-400">Could not load facilities: {error.message}</p>;
  }

  const rows = (facilities ?? []) as FacilityRow[];
  const availableStates = [...new Set((states ?? []).map((s) => s.state))].sort();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Model inspection</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Every facility × 24 local hours for one class of day, computed by the same{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">estimateWait</code> the
            map and ranking call. Tune the parameters below and this table recomputes.
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </form>
      </header>

      {/* ── filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Filter label="Region">
          {['ALL', ...availableStates].map((s) => (
            <Chip key={s} href={`/admin/model?state=${s}&day=${dayClass}`} active={s === state}>
              {s === 'ALL' ? 'All' : s}
            </Chip>
          ))}
        </Filter>
        <Filter label="Day">
          {DAY_CLASSES.map((d) => (
            <Chip
              key={d.value}
              href={`/admin/model?state=${state}&day=${d.value}`}
              active={d.value === dayClass}
            >
              {d.label}
            </Chip>
          ))}
        </Filter>
      </div>

      <EstimateTable rows={rows} dayClass={dayClass} params={params} />

      <ParamEditor params={params} />
    </div>
  );
}

function EstimateTable({
  rows,
  dayClass,
  params,
}: {
  rows: FacilityRow[];
  dayClass: DayClass;
  params: Awaited<ReturnType<typeof loadModelParams>>['params'];
}) {
  const hours = Array.from({ length: 24 }, (_, h) => h);

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
        No facilities in this region yet.
      </p>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Estimate bands · {DAY_CLASSES.find((d) => d.value === dayClass)?.label} · facility-local
          hours
        </h2>
        <p className="text-xs text-slate-500">
          Hover a cell for the sentence a user would see. Ranges are hours unless marked min.
        </p>
      </div>

      {/* The table is intentionally wide; it scrolls inside its own container so the
          page body never scrolls sideways. */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900">
              <th className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left font-medium text-slate-300">
                Facility
              </th>
              {hours.map((h) => (
                <th
                  key={h}
                  className={`px-1.5 py-2 text-center font-medium tabular-nums ${
                    h === 2 ? 'bg-sky-950 text-sky-300' : 'text-slate-400'
                  }`}
                  title={h === 2 ? 'The 2 a.m. column — the M1 gate' : undefined}
                >
                  {String(h).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const facility: EstimableFacility = {
                facilityType: row.facility_type,
                tz: row.tz,
                densityMult: Number(row.density_mult),
                hoursConfidence: row.hours_confidence,
              };

              return (
                <tr key={row.id} className="border-t border-slate-800/70 hover:bg-slate-900/40">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[22rem] bg-slate-950 px-3 py-2 text-left font-normal"
                  >
                    <span className="block truncate text-slate-200" title={row.name}>
                      {row.name}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {row.city}, {row.state} · {row.facility_type}
                      {row.status !== 'active' ? ` · ${row.status}` : ''} · ×
                      {Number(row.density_mult).toFixed(2)}
                    </span>
                  </th>

                  {hours.map((hour) => {
                    const estimate = estimateAtLocal(facility, hour, dayClass, params);

                    if (!estimate) {
                      return (
                        <td
                          key={hour}
                          className="px-1.5 py-2 text-center text-slate-700"
                          title="Specialty — appointment-based, never ranked (§8)"
                        >
                          —
                        </td>
                      );
                    }

                    const band = formatBand(estimate.bandLoMinutes, estimate.bandHiMinutes);
                    return (
                      <td
                        key={hour}
                        className={`whitespace-nowrap px-1.5 py-2 text-center tabular-nums ${severity(
                          estimate.p50Minutes,
                        )} ${hour === 2 ? 'ring-1 ring-inset ring-sky-900' : ''}`}
                        title={`${row.name} · ${String(hour).padStart(2, '0')}:00 local · typically ${band} (p50 ${Math.round(estimate.p50Minutes)} min)`}
                      >
                        {band.replace(/ hr\+?$/, '').replace(/ min$/, 'm')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Legend />
    </section>
  );
}

/**
 * Colour by p50 severity.
 *
 * Admin-only, so this is not bound by §10.6's "red is reserved for the critical-signs
 * banner" — that rule governs the public UI. Even so the ramp stops at amber rather than
 * red, to keep the habit.
 */
function severity(p50: number): string {
  if (p50 < 45) return 'bg-emerald-950/60 text-emerald-300';
  if (p50 < 90) return 'bg-teal-950/50 text-teal-300';
  if (p50 < 150) return 'bg-slate-900 text-slate-300';
  if (p50 < 240) return 'bg-amber-950/50 text-amber-300';
  return 'bg-amber-900/50 text-amber-200';
}

function Legend() {
  const items: Array<[string, string]> = [
    ['< 45 min', 'bg-emerald-950/60 text-emerald-300'],
    ['45–90 min', 'bg-teal-950/50 text-teal-300'],
    ['1½–2½ hr', 'bg-slate-900 text-slate-300'],
    ['2½–4 hr', 'bg-amber-950/50 text-amber-300'],
    ['4 hr+', 'bg-amber-900/50 text-amber-200'],
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
      <span>Typical wait (p50):</span>
      {items.map(([label, cls]) => (
        <span key={label} className={`rounded px-2 py-0.5 ${cls}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1 text-sm transition ${
        active
          ? 'bg-sky-600 text-white'
          : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
      }`}
    >
      {children}
    </Link>
  );
}
