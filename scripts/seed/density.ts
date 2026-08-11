/**
 * Recompute density_mult for every facility (CLAUDE.md §6.2).
 *
 *   npm run seed:density
 *
 * Run after any seed that adds or removes emergency facilities — adding one ER changes the
 * scarcity multiplier of every other ER within 40 km, so the whole neighbourhood shifts.
 */

import { nomadDb } from './lib/db';

async function main() {
  const db = nomadDb();

  const { data, error } = await db.rpc('recompute_density_mult');
  if (error) throw new Error(error.message);

  const changed = (data ?? []) as Array<{ facility_id: string; others: number; mult: number }>;
  console.log(`\ndensity_mult recomputed · ${changed.length} facilities changed\n`);

  const { data: all, error: readErr } = await db
    .from('facilities')
    .select('name, state, city, facility_type, density_mult')
    .order('density_mult', { ascending: false });
  if (readErr) throw new Error(readErr.message);

  const buckets = new Map<number, number>();
  for (const f of all ?? []) {
    const m = Number(f.density_mult);
    buckets.set(m, (buckets.get(m) ?? 0) + 1);
  }
  console.log('  distribution:');
  for (const [mult, n] of [...buckets].sort((a, b) => b[0] - a[0])) {
    const meaning =
      mult >= 1.3 ? 'no other ER within 40 km' :
      mult >= 1.15 ? '1 other' :
      mult >= 1.0 ? '2–3 others' :
      mult >= 0.92 ? '4–6 others' : '7+ others';
    console.log(`    ×${mult.toFixed(2)}  ${String(n).padStart(3)} facilities   (${meaning})`);
  }
  console.log();
}

main().catch((err) => {
  console.error('\nDensity recompute failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
