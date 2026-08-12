/**
 * Remove general-practice / urgent-care hybrids from the map.
 *
 *   npm run seed:hybrids -- --dry-run
 *   npm run seed:hybrids
 *
 * RULE CHANGE (Rod, 2026-08-12), superseding the hybrid allowance of 2026-08-11:
 *
 *   "Small Door, Livewell and PetWell are not true ER or Urgent Care. The new criteria is
 *    only ER, ER/Specialty and Urgent Care only. No hybrid like Bond, otherwise the system
 *    can't tell the difference."
 *
 * The reasoning is a modelling constraint, not a preference. A primary-care clinic that
 * also takes walk-ins has completely different queue dynamics from a dedicated urgent care:
 * its day is booked with wellness appointments, so a walk-in sick pet waits behind a
 * vaccination schedule. §6 models a facility TYPE, so mixing the two makes the type
 * meaningless and every estimate for both worse.
 *
 * The test is now the facility's PRIMARY function, not whether walk-ins are accepted:
 *   - dedicated emergency hospital            → er / er_specialty
 *   - dedicated walk-in urgent care clinic    → urgent_care
 *   - a general practice, however convenient  → not on the map
 *
 * Rows become `not_emergency`: kept in the registry with provenance (§7 never hard-deletes),
 * off the map, out of the review queue.
 */

import { nomadDb } from './lib/db';

/** Exact names, so a rule change can never quietly catch more than it was aimed at. */
const HYBRIDS: Array<{ match: string; reason: string }> = [
  // The chains Rod named. Primary care is the business; walk-in is a convenience feature.
  { match: 'Bond Vet', reason: 'Primary-care clinic that also takes walk-ins — the hybrid model this rule excludes.' },
  { match: 'Small Door Veterinary', reason: 'Membership-based primary care with walk-in availability, not a dedicated urgent care.' },
  { match: 'Livewell Animal Hospital', reason: 'General practice advertising same-day walk-ins; primary care is the business.' },
  { match: 'PetWellClinic', reason: 'Walk-in preventive/wellness clinic — no-appointment, but not urgent care for sick pets.' },

  // Same model, different brands.
  { match: 'CityVet', reason: 'General-practice chain with an urgent-care service line.' },
  { match: 'Heart + Paw', reason: 'Combined primary care, daycare and urgent care — hybrid.' },
  { match: 'Dulles South Veterinary Center', reason: 'Thrive general practice carrying an urgent-care service flag.' },
  { match: 'Thrive Pet Healthcare - Catonsville', reason: 'Thrive general practice carrying an urgent-care service flag.' },
  { match: 'Swan Harbor Animal Hospital', reason: 'General practice with an urgent-care service line.' },
  { match: 'VivaVets Animal Hospital', reason: 'General practice with urgent-care hours, closed midweek — not a dedicated urgent care.' },

  // Previously admitted on hours alone; each is a GP first.
  { match: 'Blue Ridge Veterinary Associates', reason: 'Wellness, boarding and daycare practice that adds overnight urgent care Fri-Sun only.' },
  { match: 'Royal Oak Veterinary + Urgent Care', reason: 'General practice plus urgent care; schedule shows Tue and Wed closed.' },
  { match: 'Autumn Trails Veterinary Center', reason: 'General practice offering urgent-care hours rather than a dedicated urgent care clinic.' },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = nomadDb();

  const { data, error } = await db
    .from('facilities')
    .select('id, name, city, state, facility_type, status, seed_sources')
    .eq('status', 'active')
    .in('state', ['MD', 'DC', 'VA']);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  console.log(`\nHybrid removal · ${rows.length} active DMV rows${dryRun ? ' · DRY RUN' : ''}\n`);

  let removed = 0;
  for (const hybrid of HYBRIDS) {
    const matches = rows.filter((r) =>
      r.name.toLowerCase().includes(hybrid.match.toLowerCase()),
    );
    if (!matches.length) continue;

    for (const row of matches) {
      console.log(`  ✗ ${row.name} (${row.city ?? '?'}, ${row.state})`);
      removed++;
      if (dryRun) continue;

      const sources = Array.isArray(row.seed_sources) ? row.seed_sources : [];
      const { error: updateError } = await db
        .from('facilities')
        .update({
          status: 'not_emergency',
          seed_sources: [
            ...sources,
            {
              source: 'rule',
              source_id: 'no-gp-urgent-care-hybrids-2026-08-12',
              retrieved_at: new Date().toISOString(),
              classification: `removed as hybrid: ${hybrid.reason}`,
            },
          ],
        })
        .eq('id', row.id);
      if (updateError) throw new Error(`${row.name}: ${updateError.message}`);
    }
    console.log(`      ${hybrid.reason}\n`);
  }

  console.log(
    `${removed} row(s) ${dryRun ? 'would be' : ''} set to not_emergency` +
      `${dryRun ? ' (dry run — nothing written)' : ''}\n`,
  );
}

main().catch((err) => {
  console.error('\nHybrid removal failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
