/**
 * Fill in opening hours from each facility's own website.
 *
 *   npm run seed:hours -- --dry-run
 *   npm run seed:hours
 *   npm run seed:hours -- --refresh     ignore the on-disk cache
 *
 * Uses the extractor ported from Bravo's audit scraper (lib/hours.ts). Why this is worth
 * running: `hours_confidence` drives the width of the displayed band (§6.1). A facility with
 * unknown hours shows 0.55–1.60 × p50; one with known hours shows 0.65–1.45. Filling hours
 * in makes every one of those estimates visibly tighter without touching the model.
 *
 * Politeness (§7.2): one request per site, cached on disk, serialised with a delay, honest
 * User-Agent. These are small practices' servers.
 *
 * IMPORTANT — this never changes `is_24_7` on an emergency hospital from true to false.
 * Per Rod's rule (§6.3), an ER's published hours may lag reality in either direction, and a
 * scrape that quietly downgrades an ER because a page was mid-edit is exactly the silent
 * error the rule exists to prevent. Hours are recorded; the ER stays an ER.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nomadDb } from './lib/db';
import { extractHours } from './lib/hours';

const CACHE_DIR = resolve(process.cwd(), 'scripts/seed/.cache/sites');
const USER_AGENT =
  'NomadVetERMap/0.1 (veterinary ER map; github.com/DogmaInc/Nomad)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cacheKey(url: string): string {
  return url.replace(/[^a-z0-9]+/gi, '_').slice(0, 120) + '.html';
}

async function fetchSite(url: string, useCache: boolean): Promise<string | null> {
  await mkdir(CACHE_DIR, { recursive: true });
  const path = resolve(CACHE_DIR, cacheKey(url));

  if (useCache) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      // not cached yet
    }
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    await writeFile(path, html, 'utf8');
    return html;
  } catch {
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const refresh = process.argv.includes('--refresh');

  const db = nomadDb();
  const { data, error } = await db
    .from('facilities')
    .select('id, name, city, state, website, is_24_7, hours, hours_confidence, facility_type')
    .eq('status', 'active')
    .in('state', ['MD', 'DC', 'VA'])
    .not('website', 'is', null);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  console.log(`\nHours enrichment · ${rows.length} facilities with a website${dryRun ? ' · DRY RUN' : ''}\n`);

  let found = 0;
  let unchanged = 0;
  let unreachable = 0;
  const changes: string[] = [];

  for (const row of rows) {
    const html = await fetchSite(row.website as string, !refresh);
    if (!html) {
      unreachable++;
      continue;
    }

    const hours = extractHours(html);
    if (!hours.hoursText) {
      unchanged++;
      continue;
    }
    found++;

    const patch: Record<string, unknown> = {
      hours: { raw: hours.hoursText, source: hours.source, retrieved_at: new Date().toISOString() },
      hours_confidence: 'seeded',
    };

    // Only ever promote to 24/7, never demote. See the header note.
    const isEmergency = row.facility_type === 'er' || row.facility_type === 'er_specialty';
    if (hours.is247 === true && row.is_24_7 !== true) {
      patch.is_24_7 = true;
    } else if (hours.is247 === false && row.is_24_7 === true && !isEmergency) {
      patch.is_24_7 = false;
    }

    const note =
      row.hours_confidence === 'unknown' ? 'hours now known' : 'hours refreshed';
    changes.push(
      `  ${row.state} ${String(row.name).slice(0, 40).padEnd(40)} ${note}` +
        `${patch.is_24_7 === true ? ' · now 24/7' : ''}\n      ${hours.hoursText.slice(0, 110)}`,
    );

    if (!dryRun) {
      const { error: updateError } = await db.from('facilities').update(patch).eq('id', row.id);
      if (updateError) throw new Error(`${row.name}: ${updateError.message}`);
    }

    await sleep(600); // one site at a time, unhurried
  }

  for (const change of changes) console.log(change);
  console.log(
    `\n  hours found ${found} · no hours on page ${unchanged} · unreachable ${unreachable}` +
      `${dryRun ? '\n  Dry run — nothing written.' : ''}\n`,
  );
}

main().catch((err) => {
  console.error('\nHours enrichment failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
