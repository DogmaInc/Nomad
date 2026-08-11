/**
 * Idempotent facility write (CLAUDE.md §7 + §7.3).
 *
 * Re-running any importer must be safe, cheap, and produce a change report rather than a
 * silent overwrite — that is the precondition for ever putting seeding on a schedule.
 *
 * Identity is `seed_sources`: a row carries the list of sources that produced it, and a
 * re-run finds its own prior row by (source, source_id). `seed_sources` is append-only,
 * so a facility discovered by both Bravo and a scrape keeps both provenance entries.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import tzLookup from 'tz-lookup';
import type { Capability, FacilityStatus, FacilityType, Species } from './classify';

export interface SeedSource {
  source: string;
  source_id: string;
  retrieved_at: string;
  /** Why the classifier landed where it did — makes /admin/review explicable. */
  classification?: string;
  url?: string;
}

export interface FacilityCandidate {
  name: string;
  facilityType: FacilityType;
  status: FacilityStatus;
  address1: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  is247: boolean | null;
  hoursConfidence: 'verified' | 'seeded' | 'unknown';
  capabilities: Capability[];
  species: Species[];
  source: SeedSource;
}

export type UpsertOutcome = 'inserted' | 'updated' | 'unchanged' | 'merged';

export interface UpsertResult {
  outcome: UpsertOutcome;
  facilityId: string;
  name: string;
  /** Field-level changes, for the diff report a scheduled run would emit. */
  changes: string[];
  /**
   * A co-located facility that is probably but not certainly the same place. Inserted
   * anyway — §7 says never hard-delete and never auto-merge when uncertain — and reported
   * so it can be resolved in /admin/review.
   */
  possibleDuplicateOf?: { id: string; name: string; metres: number; similarity: number };
}

/** Metres between two WGS84 points. */
function haversineMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Trigram Dice coefficient — the same shape of measure as Postgres `pg_trgm` similarity,
 * which §7's 0.45 threshold is written against.
 */
export function nameSimilarity(a: string, b: string): number {
  const trigrams = (s: string): Set<string> => {
    const padded = `  ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
    const out = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
    return out;
  };
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  return (2 * shared) / (setA.size + setB.size);
}

const DEDUPE_METRES = 300;
const DEDUPE_SIMILARITY = 0.45;

/** IANA timezone from coordinates (§6.1 — local time or nothing). */
export function tzFor(lat: number, lng: number): string {
  return tzLookup(lat, lng);
}

/**
 * Fields an importer is allowed to refresh on a re-run.
 *
 * Deliberately excludes `facility_type` and `status`: a later re-run should not silently
 * re-classify a facility an admin has already reviewed by hand. Classification changes go
 * through /admin/review.
 */
const REFRESHABLE = ['name', 'address1', 'city', 'zip', 'phone', 'website', 'is_24_7'] as const;

export async function upsertFacility(
  db: SupabaseClient,
  candidate: FacilityCandidate,
): Promise<UpsertResult> {
  const existing = await findBySource(db, candidate.source.source, candidate.source.source_id);

  const row = {
    name: candidate.name,
    facility_type: candidate.facilityType,
    status: candidate.status,
    address1: candidate.address1,
    city: candidate.city,
    state: candidate.state,
    zip: candidate.zip,
    location: `SRID=4326;POINT(${candidate.lng} ${candidate.lat})`,
    tz: tzFor(candidate.lat, candidate.lng),
    phone: candidate.phone,
    website: candidate.website,
    is_24_7: candidate.is247,
    hours_confidence: candidate.hoursConfidence,
  };

  if (!existing) {
    // ── §7 dedupe: a different source may already have written this same place. ──
    const neighbour = await findNearbyMatch(db, candidate);

    if (neighbour && neighbour.similarity >= DEDUPE_SIMILARITY) {
      // Same name, same spot — safe to auto-merge. Provenance is appended, so the row
      // now records that both sources found it.
      const sources: SeedSource[] = Array.isArray(neighbour.seed_sources)
        ? neighbour.seed_sources
        : [];
      const already = sources.some(
        (s) => s.source === candidate.source.source && s.source_id === candidate.source.source_id,
      );
      if (!already) {
        const { error } = await db
          .from('facilities')
          .update({ seed_sources: [...sources, candidate.source] })
          .eq('id', neighbour.id);
        if (error) throw new Error(`merge ${candidate.name}: ${error.message}`);
      }
      await writeChildren(db, neighbour.id, candidate);
      return {
        outcome: 'merged',
        facilityId: neighbour.id,
        name: candidate.name,
        changes: [`merged into "${neighbour.name}" (${Math.round(neighbour.metres)} m away)`],
      };
    }

    const { data, error } = await db
      .from('facilities')
      .insert({ ...row, seed_sources: [candidate.source] })
      .select('id')
      .single();
    if (error) throw new Error(`insert ${candidate.name}: ${error.message}`);

    await writeChildren(db, data.id, candidate);
    return {
      outcome: 'inserted',
      facilityId: data.id,
      name: candidate.name,
      changes: [],
      // Co-located but differently named: could be one campus with two services, or two
      // genuinely separate hospitals. §7 says queue it rather than guess.
      possibleDuplicateOf: neighbour
        ? {
            id: neighbour.id,
            name: neighbour.name,
            metres: neighbour.metres,
            similarity: neighbour.similarity,
          }
        : undefined,
    };
  }

  // Report what actually differs rather than blind-writing (§7 post-seed jobs).
  const changes: string[] = [];
  const patch: Record<string, unknown> = {};
  for (const field of REFRESHABLE) {
    const next = row[field];
    const prev = (existing as Record<string, unknown>)[field];
    if (next !== null && next !== prev) {
      changes.push(`${field}: ${JSON.stringify(prev)} → ${JSON.stringify(next)}`);
      patch[field] = next;
    }
  }

  // Append this source if it isn't already recorded — never overwrite provenance.
  const sources: SeedSource[] = Array.isArray(existing.seed_sources) ? existing.seed_sources : [];
  const idx = sources.findIndex(
    (s) => s.source === candidate.source.source && s.source_id === candidate.source.source_id,
  );
  if (idx === -1) {
    patch.seed_sources = [...sources, candidate.source];
  } else if (sources[idx].retrieved_at !== candidate.source.retrieved_at) {
    const next = [...sources];
    next[idx] = candidate.source;
    patch.seed_sources = next;
  }

  if (Object.keys(patch).length === 0) {
    return { outcome: 'unchanged', facilityId: existing.id, name: candidate.name, changes: [] };
  }

  const { error } = await db.from('facilities').update(patch).eq('id', existing.id);
  if (error) throw new Error(`update ${candidate.name}: ${error.message}`);

  await writeChildren(db, existing.id, candidate);
  return {
    outcome: changes.length ? 'updated' : 'unchanged',
    facilityId: existing.id,
    name: candidate.name,
    changes,
  };
}

/**
 * Nearest existing facility within the §7 radius, with its name similarity.
 *
 * Done in JS over the state's rows rather than in PostGIS. That is deliberate for now and
 * wrong at national scale: it is fine for a few hundred rows per state, but the national
 * seed should move this behind an RPC using the GiST index (the same way
 * recompute_density_mult already does).
 */
async function findNearbyMatch(db: SupabaseClient, candidate: FacilityCandidate) {
  const { data, error } = await db
    .from('facilities')
    .select('id, name, seed_sources, lat, lng')
    .eq('state', candidate.state)
    .neq('status', 'duplicate');
  if (error) throw new Error(`dedupe scan ${candidate.name}: ${error.message}`);

  let best: {
    id: string; name: string; seed_sources: unknown; metres: number; similarity: number;
  } | null = null;

  for (const row of data ?? []) {
    if (typeof row.lat !== 'number' || typeof row.lng !== 'number') continue;

    const metres = haversineMetres(candidate.lat, candidate.lng, row.lat, row.lng);
    if (metres > DEDUPE_METRES) continue;

    const similarity = nameSimilarity(candidate.name, row.name);
    if (!best || similarity > best.similarity) {
      best = { id: row.id, name: row.name, seed_sources: row.seed_sources, metres, similarity };
    }
  }
  return best;
}

async function findBySource(db: SupabaseClient, source: string, sourceId: string) {
  // NOTE: the filter value is a JSON *string*, not an array. Given an array,
  // supabase-js serialises it as a Postgres array literal (`cs.{...}`), which Postgres
  // rejects against a jsonb column with "invalid input syntax for type json".
  // Passing a pre-stringified value takes the string branch and emits valid `cs.[{...}]`.
  const filter = JSON.stringify([{ source, source_id: sourceId }]);
  const { data, error } = await db
    .from('facilities')
    .select('id, name, address1, city, zip, phone, website, is_24_7, seed_sources')
    .contains('seed_sources', filter)
    .maybeSingle();
  if (error) throw new Error(`lookup ${source}:${sourceId}: ${error.message}`);
  return data;
}

/** Capabilities and species are additive sets — upsert, never delete a clinic's own edits. */
async function writeChildren(db: SupabaseClient, facilityId: string, c: FacilityCandidate) {
  if (c.capabilities.length) {
    const { error } = await db.from('facility_capabilities').upsert(
      c.capabilities.map((capability) => ({ facility_id: facilityId, capability, source: 'seed' })),
      { onConflict: 'facility_id,capability', ignoreDuplicates: true },
    );
    if (error) throw new Error(`capabilities ${c.name}: ${error.message}`);
  }
  if (c.species.length) {
    const { error } = await db.from('facility_species').upsert(
      c.species.map((species) => ({ facility_id: facilityId, species })),
      { onConflict: 'facility_id,species', ignoreDuplicates: true },
    );
    if (error) throw new Error(`species ${c.name}: ${error.message}`);
  }
}
