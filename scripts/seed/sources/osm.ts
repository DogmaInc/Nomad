/**
 * OpenStreetMap importer via Overpass (CLAUDE.md §7.2 source 2).
 *
 * OSM is the highest-leverage source for the facilities Bravo cannot supply, because it is
 * ownership-blind by nature: a VEG location and an independent ER are just two nodes. It is
 * also structured and durable, so it beats parsing a chain's marketing site — those change
 * layout without warning, OSM's tag schema does not.
 *
 * ODbL: OSM must be attributed in the app footer, and every row keeps its OSM id in
 * `seed_sources` so OSM-derived data stays isolatable if licensing review ever demands it.
 *
 * Politeness (§7.2): one request per state, a real User-Agent, and raw responses cached on
 * disk so re-runs and dry-runs never re-fetch. Overpass is donated infrastructure.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { classify } from '../lib/classify';
import {
  normalizeName, normalizeText, normalizeUrl, normalizeZip, toE164, validCoords,
} from '../lib/normalize';
import type { FacilityCandidate } from '../lib/upsert';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const CACHE_DIR = resolve(process.cwd(), 'scripts/seed/.cache');
const USER_AGENT =
  'NomadVetERMap/0.1 (national veterinary ER wait-time map; contact via github.com/DogmaInc/Nomad)';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Deliberately broad: fetch every veterinary facility in the state, then let
 * `classify` decide. Filtering emergencies in the Overpass query would bake the
 * classification rules into a query string, where they cannot be tested.
 */
function queryFor(state: string): string {
  return `
[out:json][timeout:90];
area["ISO3166-2"="US-${state}"][admin_level~"4|6"]->.searchArea;
(
  node["amenity"="veterinary"](area.searchArea);
  way["amenity"="veterinary"](area.searchArea);
  node["healthcare"="veterinary"](area.searchArea);
  way["healthcare"="veterinary"](area.searchArea);
);
out center tags;`.trim();
}

async function fetchState(state: string, useCache: boolean): Promise<OverpassElement[]> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = resolve(CACHE_DIR, `osm-${state}.json`);

  if (useCache) {
    try {
      const cached = await readFile(cachePath, 'utf8');
      const parsed = JSON.parse(cached);
      console.log(`  ${state}: ${parsed.elements?.length ?? 0} elements (cached)`);
      return parsed.elements ?? [];
    } catch {
      // No usable cache — fall through and fetch.
    }
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({ data: queryFor(state) }),
  });

  if (!response.ok) {
    throw new Error(`Overpass ${state}: HTTP ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  await writeFile(cachePath, body, 'utf8');
  const parsed = JSON.parse(body);
  console.log(`  ${state}: ${parsed.elements?.length ?? 0} elements (fetched)`);
  return parsed.elements ?? [];
}

/** OSM `opening_hours=24/7` is the canonical round-the-clock marker. */
function is247(tags: Record<string, string>): boolean | null {
  const hours = tags.opening_hours;
  if (!hours) return null;
  return /^24\/7$/i.test(hours.trim()) ? true : false;
}

function addressFrom(tags: Record<string, string>): string | null {
  const number = tags['addr:housenumber'];
  const street = tags['addr:street'];
  if (number && street) return normalizeText(`${number} ${street}`);
  return normalizeText(street ?? null);
}

export interface OsmImportResult {
  candidates: FacilityCandidate[];
  skipped: Array<{ name: string; reason: string }>;
  scanned: number;
}

export async function fetchOsmCandidates(
  states: string[],
  options: { useCache?: boolean } = {},
): Promise<OsmImportResult> {
  const retrievedAt = new Date().toISOString();
  const candidates: FacilityCandidate[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  let scanned = 0;

  for (const state of states) {
    const elements = await fetchState(state, options.useCache ?? true);
    scanned += elements.length;

    for (const element of elements) {
      const tags = element.tags ?? {};
      const rawName = tags.name ?? tags['operator'] ?? '';
      const name = rawName ? normalizeName(rawName) : '';
      if (!name) {
        skipped.push({ name: `osm:${element.type}/${element.id}`, reason: 'unnamed' });
        continue;
      }

      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      const coords = validCoords(lat, lon);
      if (!coords) {
        skipped.push({ name, reason: 'no coordinates' });
        continue;
      }

      // Everything the classifier can learn from this element, as one text blob.
      const descriptive = [
        tags.description, tags['healthcare:speciality'], tags.speciality,
        tags.emergency === 'yes' ? 'emergency' : '', tags.opening_hours,
        tags['service:vet'], tags.operator,
      ]
        .filter(Boolean)
        .join(' ');

      const classification = classify({
        name,
        sourceType: null, // OSM has no facility-type column; the name and tags carry it
        tags: Object.entries(tags).map(([k, v]) => `${k}=${v}`),
        text: descriptive,
        is247: is247(tags),
        // A mapper set this deliberately; it is not inferred from the name.
        structuredEmergency: tags.emergency === 'yes',
      });

      // OSM's veterinary tag covers every GP in the country. Only emergency-layer
      // classifications are worth importing; the rest would drown /admin/review.
      const wanted =
        classification.status === 'active' &&
        ['er', 'er_specialty', 'urgent_care'].includes(classification.facilityType);

      if (!wanted) {
        skipped.push({ name, reason: classification.reason });
        continue;
      }

      const hours247 = is247(tags);
      candidates.push({
        name,
        facilityType: classification.facilityType,
        status: classification.status,
        address1: addressFrom(tags),
        city: normalizeText(tags['addr:city']),
        state,
        zip: normalizeZip(tags['addr:postcode']),
        lat: coords[0],
        lng: coords[1],
        phone: toE164(tags.phone ?? tags['contact:phone']),
        website: normalizeUrl(tags.website ?? tags['contact:website']),
        is247: hours247,
        // An explicit opening_hours tag is a real signal; absence stays honest as unknown,
        // which widens the displayed band (§6.1) rather than pretending we know.
        hoursConfidence: tags.opening_hours ? 'seeded' : 'unknown',
        capabilities: classification.capabilities,
        species: classification.species,
        source: {
          source: 'osm',
          source_id: `${element.type}/${element.id}`,
          retrieved_at: retrievedAt,
          classification: classification.reason,
          url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        },
      });
    }
  }

  return { candidates, skipped, scanned };
}
