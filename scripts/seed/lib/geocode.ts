/**
 * Address → coordinates for the verified seed (CLAUDE.md §7 "geocode where the source
 * lacks coordinates").
 *
 * Primary: the **US Census Geocoder**. Public domain, no API key, no rate card, and — the
 * reason it beats Google here — no restriction on storing the result. Google Maps Platform
 * terms forbid persisting geocoded coordinates long-term, which is the same class of
 * constraint §7 already flags for Places. Nomad's registry is permanent, so a source whose
 * output we may keep is worth more than a marginally better match rate.
 *
 * Fallback: Nominatim (OSM, ODbL — already attributed in the map footer).
 *
 * Both are donated/public infrastructure: results are cached on disk and requests are
 * serialised with a delay, per §7.2's politeness rule.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CACHE_PATH = resolve(process.cwd(), 'scripts/seed/.cache/geocode.json');
const USER_AGENT =
  'NomadVetERMap/0.1 (veterinary ER map; github.com/DogmaInc/Nomad)';

export interface GeocodeResult {
  lat: number;
  lng: number;
  source: 'census' | 'nominatim';
  matchedAddress: string;
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

  let result: GeocodeResult | null = null;
  try {
    result = await census(street, city, state, zip);
  } catch {
    // fall through to Nominatim
  }

  if (!result) {
    await sleep(1100); // Nominatim asks for ≤1 request/second
    try {
      result = await nominatim(`${street}, ${city}, ${state} ${zip ?? ''}`.trim());
    } catch {
      result = null;
    }
  }

  cached[key] = result ?? { failed: true };
  await saveCache();
  return result;
}
