/**
 * Seed the DMV (MD, DC, VA) from Bravo.
 *
 *   npm run seed:bravo -- --dry-run     inspect the diff, write nothing
 *   npm run seed:bravo                  apply
 *
 * Idempotent (§7.3): a second run reports "unchanged" for everything it already wrote.
 */

import { bravoDb, nomadDb } from './lib/db';
import { fetchBravoCandidates } from './sources/bravo';
import { upsertFacility, type UpsertResult } from './lib/upsert';

const STATES = ['MD', 'DC', 'VA'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const includeGeneralPractice = process.argv.includes('--include-gp');

  console.log(`\nBravo → Nomad · states: ${STATES.join(', ')}${dryRun ? ' · DRY RUN' : ''}\n`);

  const { candidates, skipped, scanned } = await fetchBravoCandidates(bravoDb(), {
    states: STATES,
    includeGeneralPractice,
  });

  console.log(`scanned ${scanned} Bravo rows → ${candidates.length} candidates\n`);

  const byType = candidates.reduce<Record<string, number>>((acc, c) => {
    const key = `${c.facilityType}${c.status === 'needs_review' ? ' (needs_review)' : ''}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  for (const [type, n] of Object.entries(byType).sort()) {
    console.log(`  ${String(n).padStart(3)}  ${type}`);
  }

  if (dryRun) {
    console.log('\n── candidates ──');
    for (const c of candidates) {
      console.log(
        `  ${c.state} ${c.facilityType.padEnd(13)} ${c.name}\n` +
          `       ${c.address1 ?? '(no street)'}, ${c.city ?? '?'} ${c.zip ?? ''} · ${c.phone ?? 'no phone'}\n` +
          `       caps: ${c.capabilities.join(', ') || 'none'} · why: ${c.source.classification}`,
      );
    }
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
  console.log(`  ${skipped.length} Bravo rows skipped (not emergency-layer or unusable)\n`);
}

main().catch((err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
