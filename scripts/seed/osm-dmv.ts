/**
 * Seed the DMV from OpenStreetMap.
 *
 *   npm run seed:osm -- --dry-run     inspect, write nothing
 *   npm run seed:osm                  apply
 *   npm run seed:osm -- --refresh     bypass the on-disk Overpass cache
 *
 * Run `npm run seed:density` afterwards — adding ERs changes the scarcity multiplier of
 * every facility within 40 km (§6.2).
 */

import { nomadDb } from './lib/db';
import { fetchOsmCandidates } from './sources/osm';
import { upsertFacility, type UpsertResult } from './lib/upsert';

const STATES = ['MD', 'DC', 'VA'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const refresh = process.argv.includes('--refresh');

  console.log(`\nOSM → Nomad · ${STATES.join(', ')}${dryRun ? ' · DRY RUN' : ''}\n`);

  const { candidates, skipped, scanned } = await fetchOsmCandidates(STATES, {
    useCache: !refresh,
  });

  console.log(`\nscanned ${scanned} OSM elements → ${candidates.length} emergency-layer candidates\n`);

  for (const c of candidates) {
    console.log(
      `  ${c.state} ${c.facilityType.padEnd(13)} ${c.name}\n` +
        `       ${c.address1 ?? '(no street)'}, ${c.city ?? '?'} ${c.zip ?? ''} · ${c.phone ?? 'no phone'}` +
        `${c.is247 ? ' · 24/7' : ''}\n` +
        `       why: ${c.source.classification}`,
    );
  }

  if (dryRun) {
    console.log(`\n${skipped.length} skipped. Dry run — nothing written.\n`);
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
    `  inserted ${counts.inserted ?? 0} · updated ${counts.updated ?? 0} · unchanged ${counts.unchanged ?? 0}`,
  );
  for (const r of results.filter((x) => x.changes.length)) {
    console.log(`  ~ ${r.name}`);
    for (const change of r.changes) console.log(`      ${change}`);
  }

  const suspects = results.filter((r) => r.possibleDuplicateOf);
  if (suspects.length) {
    console.log(`\n  ⚠ ${suspects.length} co-located but differently named — for /admin/review:`);
    for (const r of suspects) {
      const d = r.possibleDuplicateOf!;
      console.log(
        `    "${r.name}"\n      is ${Math.round(d.metres)} m from "${d.name}" ` +
          `(name similarity ${d.similarity.toFixed(2)} — below the 0.45 auto-merge threshold)`,
      );
    }
  }
  console.log('\n  Next: npm run seed:density\n');
}

main().catch((err) => {
  console.error('\nOSM seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
