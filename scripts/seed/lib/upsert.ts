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

export type UpsertOutcome = 'inserted' | 'updated' | 'unchanged';

export interface UpsertResult {
  outcome: UpsertOutcome;
  facilityId: string;
  name: string;
  /** Field-level changes, for the diff report a scheduled run would emit. */
  changes: string[];
}

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
    const { data, error } = await db
      .from('facilities')
      .insert({ ...row, seed_sources: [candidate.source] })
      .select('id')
      .single();
    if (error) throw new Error(`insert ${candidate.name}: ${error.message}`);

    await writeChildren(db, data.id, candidate);
    return { outcome: 'inserted', facilityId: data.id, name: candidate.name, changes: [] };
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
