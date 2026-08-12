/**
 * Verified-facility importer (CLAUDE.md §7, source 5 — human/agent-curated with evidence).
 *
 * WHY THIS EXISTS, AND WHY IT OUTRANKS THE HEURISTIC IMPORTERS
 *
 * The first DMV seed classified facilities by pattern-matching names, hours strings and
 * OSM tags. It put an ophthalmologist, two dental practices, an orthopedic surgeon and a
 * 24-hour general practice on an emergency map, and it missed most of the region's real
 * ERs. §7 asks for "precision over recall for the emergency layers"; heuristics delivered
 * the opposite of both.
 *
 * So the emergency layer is now driven by records that each carry an evidence URL and a
 * verbatim quote from the facility's own site proving it takes walk-in emergencies. The
 * heuristic importers still run, but they can no longer be the reason a facility is shown
 * as an ER — see the `verified` provenance flag.
 *
 * Records live in data/dmv/*.json and are reviewable as plain text, in git, by a
 * non-engineer. That is the point: the claim "this place is an ER at 2 a.m." should be
 * auditable by reading one line, not by re-deriving a regex.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Capability, FacilityType, Species } from '../lib/classify';
import { geocode } from '../lib/geocode';
import {
  normalizeName, normalizeState, normalizeText, normalizeUrl, normalizeZip, toE164,
} from '../lib/normalize';
import type { FacilityCandidate } from '../lib/upsert';

export interface VerifiedRecord {
  name: string;
  address1: string;
  city: string;
  state: string;
  zip?: string;
  phone?: string;
  website?: string;
  type: FacilityType;
  is247?: boolean;
  hoursText?: string;
  evidenceUrl: string;
  evidenceQuote: string;
  capabilities?: string[];
  species?: string[];
  confidence?: 'high' | 'medium';
  /** Optional explicit coordinates; geocoded from the address when absent. */
  lat?: number;
  lng?: number;
}

const VALID_TYPES: FacilityType[] = ['er', 'er_specialty', 'urgent_care'];

const VALID_CAPABILITIES = new Set<Capability>([
  'overnight_care', 'exotics', 'avian', 'oxygen_support', 'isolation',
  'er_surgery', 'endoscopy', 'ventilator', 'blood_products', 'ct', 'mri', 'dialysis',
]);

const VALID_SPECIES = new Set<Species>([
  'dog', 'cat', 'exotic', 'avian', 'reptile', 'small_mammal', 'equine', 'farm',
]);

export interface VerifiedImportResult {
  candidates: FacilityCandidate[];
  rejected: Array<{ name: string; reason: string }>;
  scanned: number;
}

/**
 * Load and validate verified records.
 *
 * Validation is strict and rejects rather than repairs. These files are produced by
 * research agents, and an agent that invents an address is a worse failure than a missing
 * facility — a made-up ER is a wrong turn at 2 a.m., a missing one is merely a gap.
 */
export async function loadVerifiedRecords(
  files: string[],
): Promise<VerifiedImportResult> {
  const retrievedAt = new Date().toISOString();
  const candidates: FacilityCandidate[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  const seen = new Set<string>();
  let scanned = 0;

  for (const file of files) {
    let records: VerifiedRecord[];
    try {
      const raw = await readFile(resolve(process.cwd(), file), 'utf8');
      records = JSON.parse(raw) as VerifiedRecord[];
    } catch (error) {
      console.warn(
        `  ! skipping ${file}: ${error instanceof Error ? error.message : 'unreadable'}`,
      );
      continue;
    }
    if (!Array.isArray(records)) {
      console.warn(`  ! skipping ${file}: expected a JSON array`);
      continue;
    }

    for (const record of records) {
      scanned++;
      const name = record?.name ? normalizeName(record.name) : '';
      if (!name) {
        rejected.push({ name: '(unnamed)', reason: 'no name' });
        continue;
      }

      // Evidence is the whole premise of this source.
      if (!record.evidenceUrl || !record.evidenceQuote) {
        rejected.push({ name, reason: 'no evidence url/quote' });
        continue;
      }

      if (!VALID_TYPES.includes(record.type)) {
        rejected.push({
          name,
          reason: `type "${record.type}" is not an emergency layer (specialty-only and GP are excluded)`,
        });
        continue;
      }

      const state = normalizeState(record.state);
      if (!state) {
        rejected.push({ name, reason: `unusable state ${JSON.stringify(record.state)}` });
        continue;
      }

      const address1 = normalizeText(record.address1);
      const city = normalizeText(record.city);
      if (!address1 || !city) {
        rejected.push({ name, reason: 'missing street or city' });
        continue;
      }

      // Two agents covering neighbouring regions will both find a border facility.
      const key = `${name.toLowerCase()}|${address1.toLowerCase()}`;
      if (seen.has(key)) {
        rejected.push({ name, reason: 'duplicate within verified records' });
        continue;
      }
      seen.add(key);

      const zip = normalizeZip(record.zip);
      let lat = record.lat;
      let lng = record.lng;
      let googlePlaceId: string | null = null;

      if (typeof lat !== 'number' || typeof lng !== 'number') {
        const located = await geocode(address1, city, state, zip ?? undefined);
        if (!located) {
          rejected.push({ name, reason: `could not geocode "${address1}, ${city} ${state}"` });
          continue;
        }
        lat = located.lat;
        lng = located.lng;
        googlePlaceId = located.placeId ?? null;
      }

      const capabilities = (record.capabilities ?? []).filter((c): c is Capability =>
        VALID_CAPABILITIES.has(c as Capability),
      );
      const species = (record.species ?? []).filter((s): s is Species =>
        VALID_SPECIES.has(s as Species),
      );
      if (!species.length) species.push('dog', 'cat');

      // A 24/7 ER keeps patients overnight by definition.
      if (record.is247 === true && !capabilities.includes('overnight_care')) {
        capabilities.push('overnight_care');
      }

      candidates.push({
        name,
        facilityType: record.type,
        status: 'active',
        address1,
        city,
        state,
        zip,
        lat,
        lng,
        phone: toE164(record.phone),
        website: normalizeUrl(record.website),
        is247: record.is247 ?? null,
        // Published hours were read off the facility's own site, so the band narrows (§6.1).
        hoursConfidence: record.hoursText ? 'seeded' : 'unknown',
        capabilities,
        species,
        googlePlaceId,
        source: {
          source: 'verified',
          // Stable per physical location so re-runs update rather than duplicate.
          source_id: `${state}:${address1}`.toLowerCase().replace(/\s+/g, '-'),
          retrieved_at: retrievedAt,
          classification: `verified ${record.type}${
            record.confidence === 'medium' ? ' (medium confidence)' : ''
          }: "${record.evidenceQuote.slice(0, 140)}"`,
          url: record.evidenceUrl,
        },
      });
    }
  }

  return { candidates, rejected, scanned };
}
