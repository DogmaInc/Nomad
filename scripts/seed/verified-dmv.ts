/**
 * Seed the DMV from verified, evidence-carrying records.
 *
 *   npm run seed:verified -- --dry-run    inspect, write nothing
 *   npm run seed:verified                 apply
 *   npm run seed:verified -- --prune      also demote unverified emergency rows
 *
 * `--prune` is how the heuristic mistakes get cleaned up. Any facility in MD/DC/VA that is
 * typed as an emergency layer but is NOT backed by a verified record is set to
 * `needs_review`: it stays in the registry with its provenance intact (§7 — never
 * hard-delete) but leaves the map until a human confirms it. That is the correct place for
 * "a regex thought this was an ER".
 */

import { nomadDb } from './lib/db';
import { loadVerifiedRecords } from './sources/verified';
import { upsertFacility, type UpsertResult } from './lib/upsert';

const FILES = [
  'data/dmv/dc-nova.json',
  'data/dmv/maryland.json',
  'data/dmv/va-east.json',
  'data/dmv/va-west.json',
];
const STATES = ['MD', 'DC', 'VA'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prune = process.argv.includes('--prune');

  console.log(`\nVerified → Nomad · ${STATES.join(', ')}${dryRun ? ' · DRY RUN' : ''}\n`);

  const { candidates, rejected, scanned } = await loadVerifiedRecords(FILES);

  console.log(`scanned ${scanned} verified records → ${candidates.length} accepted\n`);

  const byType = candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.facilityType] = (acc[c.facilityType] ?? 0) + 1;
    return acc;
  }, {});
  for (const [type, n] of Object.entries(byType).sort()) {
    console.log(`  ${String(n).padStart(3)}  ${type}`);
  }

  if (rejected.length) {
    console.log(`\n  ${rejected.length} rejected:`);
    for (const r of rejected) console.log(`    ✗ ${r.name} — ${r.reason}`);
  }

  if (dryRun) {
    console.log('\n── would write ──');
    for (const c of candidates) {
      console.log(
        `  ${c.state} ${c.facilityType.padEnd(13)} ${c.name}\n` +
          `       ${c.address1}, ${c.city} ${c.zip ?? ''} · ${c.phone ?? 'no phone'}${c.is247 ? ' · 24/7' : ''}`,
      );
    }
    console.log('\nDry run — nothing written.\n');
    return;
  }

  const db = nomadDb();
  const results: UpsertResult[] = [];
  for (const candidate of candidates) {
    results.push(await upsertFacility(db, candidate));
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  console.log('\n── write report ──');
  console.log(
    `  inserted ${counts.inserted ?? 0} · merged ${counts.merged ?? 0} · ` +
      `updated ${counts.updated ?? 0} · unchanged ${counts.unchanged ?? 0}`,
  );

  const suspects = results.filter((r) => r.possibleDuplicateOf);
  if (suspects.length) {
    console.log(`\n  ⚠ ${suspects.length} co-located but differently named — for /admin/review:`);
    for (const r of suspects) {
      const d = r.possibleDuplicateOf!;
      console.log(`    "${r.name}" is ${Math.round(d.metres)} m from "${d.name}" (sim ${d.similarity.toFixed(2)})`);
    }
  }

  if (prune) await pruneUnverified(db, new Set(results.map((r) => r.facilityId)));

  console.log('\n  Next: npm run seed:density\n');
}

/**
 * Demote emergency-typed DMV facilities that no verified record vouches for.
 *
 * Deliberately NOT a delete. The row keeps its seed_sources so /admin/review can show
 * where it came from and why the classifier believed it, which is how the classifier gets
 * better rather than just quieter.
 */
async function pruneUnverified(
  db: ReturnType<typeof nomadDb>,
  verifiedIds: Set<string>,
): Promise<void> {
  const { data, error } = await db
    .from('facilities')
    .select('id, name, city, state, facility_type, status')
    .in('state', STATES)
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  const stale = (data ?? []).filter((f) => !verifiedIds.has(f.id));
  if (!stale.length) {
    console.log('\n── prune ── nothing to demote; every active DMV row is verified.');
    return;
  }

  console.log(`\n── prune ── demoting ${stale.length} unverified row(s) to needs_review:`);
  for (const f of stale) {
    console.log(`    ↓ ${f.facility_type.padEnd(13)} ${f.name} (${f.city ?? '?'}, ${f.state})`);
  }

  const { error: updateError } = await db
    .from('facilities')
    .update({ status: 'needs_review' })
    .in('id', stale.map((f) => f.id));
  if (updateError) throw new Error(updateError.message);

  console.log('  They remain in the registry with provenance intact, but leave the map.');
}

main().catch((err) => {
  console.error('\nVerified seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
