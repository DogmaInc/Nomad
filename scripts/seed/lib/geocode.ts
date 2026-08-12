/**
 * Address → coordinates for the verified seed (CLAUDE.md §7 "geocode where the source
 * lacks coordinates").
 *
 * Four tiers, tried in order. Each exists because the one before it failed on a real DMV
 * address during the M1 seed:
 *
 *  1. **Google Geocoding** — best coverage, and the only tier that resolves brand-new
 *     developments. Used ONLY when `GOOGLE_GEOCODING_API_KEY` is set, because it must be a
 *     server-side key: Bravo's existing key is HTTP-referrer restricted and Google rejects
 *     those for this API with REQUEST_DENIED. When Google answers we also store the
 *     `place_id`, which is the piece Google's terms allow keeping indefinitely and which
 *     lets coordinates be refreshed later rather than cached in violation (§7 item 4).
 *  2. **US Census** — public domain, no key, no storage restriction. Excellent on
 *     established street addresses, blind to new construction.
 *  3. **Photon** (Komoot, OSM) — fuzzier matching than Nominatim, and the tier that
 *     actually resolved "6645 Lake Harbour Drive, Midlothian" and "135 Robinson Mill Plaza,
 *     Leesburg" when both 1 and 2 returned nothing.
 *  4. **Nominatim** (OSM, ODbL — already attributed in the map footer).
 *
 * Tiers 2–4 are donated or public infrastructure: results are cached on disk and requests
 * are serialised with a delay, per §7.2's politeness rule.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CACHE_PATH = resolve(process.cwd(), 'scripts/seed/.cache/geocode.json');
const USER_AGENT =
  'NomadVetERMap/0.1 (veterinary ER map; github.com/DogmaInc/Nomad)';

export interface GeocodeResult {
  lat: number;
  lng: number;
  source: 'google' | 'census' | 'photon' | 'nominatim';
  matchedAddress: string;
  /** Google only. The one field Google's terms permit storing indefinitely (§7 item 4). */
  placeId?: string;
}

type Cache = Record<string, GeocodeResult | { failed: true }>;

let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CACHE_PATH, 'utf8')) as Cache;
  } catch {
    cache = {};
  }
  return cache;
}

async function saveCache(): Promise<void> {
  await mkdir(resolve(process.cwd(), 'scripts/seed/.cache'), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function census(street: string, city: string, state: string, zip?: string) {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/address');
  url.searchParams.set('street', street);
  url.searchParams.set('city', city);
  url.searchParams.set('state', state);
  if (zip) url.searchParams.set('zip', zip);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    result?: { addressMatches?: Array<{ coordinates: { x: number; y: number }; matchedAddress: string }> };
  };
  const match = body.result?.addressMatches?.[0];
  if (!match) return null;

  // Census returns x = longitude, y = latitude.
  return {
    lat: match.coordinates.y,
    lng: match.coordinates.x,
    source: 'census' as const,
    matchedAddress: match.matchedAddress,
  };
}

async function nominatim(query: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;

  const body = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!body.length) return null;

  return {
    lat: Number(body[0].lat),
    lng: Number(body[0].lon),
    source: 'nominatim' as const,
    matchedAddress: body[0].display_name,
  };
}

/**
 * Google Geocoding.
 *
 * Requires a SERVER-SIDE key. A browser key with HTTP-referrer restrictions — which is what
 * Bravo uses — returns REQUEST_DENIED here: "API keys with referer restrictions cannot be
 * used with this API." Create a second key restricted by IP (or unrestricted) with the
 * Geocoding API enabled, and set GOOGLE_GEOCODING_API_KEY.
 */
async function google(street: string, city: string, state: string, zip?: string) {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', `${street}, ${city}, ${state} ${zip ?? ''}`.trim());
  url.searchParams.set('key', key);

  const res = await fetch(url);
  if (!res.ok) return null;

  const body = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: Array<{
      geometry: { location: { lat: number; lng: number }; location_type: string };
      formatted_address: string;
      place_id: string;
    }>;
  };

  if (body.status !== 'OK' || !body.results?.length) {
    // Configuration errors are silent data loss otherwise — say them out loud.
    if (body.status === 'REQUEST_DENIED' || body.status === 'OVER_QUERY_LIMIT') {
      console.warn(`  ! Google geocoding ${body.status}: ${body.error_message ?? ''}`);
    }
    return null;
  }

  const best = body.results[0];
  // APPROXIMATE means Google fell back to a city or ZIP centroid, which drops the pin in the
  // wrong place. Better to let a later tier try to find the real street.
  if (best.geometry.location_type === 'APPROXIMATE') return null;

  return {
    lat: best.geometry.location.lat,
    lng: best.geometry.location.lng,
    source: 'google' as const,
    matchedAddress: best.formatted_address,
    placeId: best.place_id,
  };
}

/** Photon (Komoot, OSM). Fuzzier than Nominatim — resolves plazas and new streets. */
async function photon(query: string) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    features?: Array<{
      geometry: { coordinates: [number, number] };
      properties: Record<string, string>;
    }>;
  };
  const hit = body.features?.[0];
  if (!hit) return null;

  const p = hit.properties;
  return {
    lat: hit.geometry.coordinates[1],
    lng: hit.geometry.coordinates[0],
    source: 'photon' as const,
    matchedAddress: [p.name, p.street, p.city, p.state].filter(Boolean).join(', '),
  };
}

/**
 * Drop suite/unit designators.
 *
 * The Census matcher wants a plain street address and returns no match for
 * "14300 Winterview Pkwy Suite 106". The suite does not change the coordinates — a pin is
 * for the building — so stripping it is lossless for our purposes and recovers real
 * facilities that would otherwise be dropped for a formatting reason.
 */
function withoutUnit(street: string): string {
  return street
    .replace(/[,#]?\s*\b(suite|ste|unit|apt|bldg|building|floor|fl)\b\.?\s*[\w-]*/gi, '')
    .replace(/\s*#\s*[\w-]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,\s]+$/, '')
    .trim();
}

export async function geocode(
  street: string,
  city: string,
  state: string,
  zip?: string,
): Promise<GeocodeResult | null> {
  const key = `${street}|${city}|${state}|${zip ?? ''}`.toLowerCase();
  const cached = await loadCache();

  const hit = cached[key];
  if (hit) return 'failed' in hit ? null : hit;

  const simplified = withoutUnit(street);
  const attempts = simplified && simplified !== street ? [street, simplified] : [street];

  let result: GeocodeResult | null = null;

  // Tiers 1-2: keyed and public-domain, each tried with and without the suite number.
  for (const provider of [google, census]) {
    for (const attempt of attempts) {
      try {
        result = await provider(attempt, city, state, zip);
      } catch {
        // fall through to the next attempt or provider
      }
      if (result) break;
    }
    if (result) break;
  }

  // Tiers 3-4: OSM-derived, rate-limited to roughly one request per second.
  if (!result) {
    for (const provider of [photon, nominatim]) {
      for (const attempt of attempts) {
        await sleep(1100);
        try {
          result = await provider(`${attempt}, ${city}, ${state} ${zip ?? ''}`.trim());
        } catch {
          result = null;
        }
        if (result) break;
      }
      if (result) break;
    }
  }

  cached[key] = result ?? { failed: true };
  await saveCache();
  return result;
}
