/**
 * Bravo importer (CLAUDE.md §7.1, §7.2 source 1-adjacent).
 *
 * Bravo is a separate product with a national database of *independent* hospitals. That
 * makes it a verified backbone but a structurally partial one: ER/specialty is the most
 * consolidated segment in veterinary medicine, so the corporate ERs a 2 a.m. user is most
 * likely to reach are absent by construction. Scraping covers that gap; this covers the
 * independents with already-geocoded, already-checked records.
 *
 * INVARIANT #1 IS ENFORCED BY THE SELECT LIST BELOW. Bravo's ownership columns
 * (ownership_basis, verification_status, pe_name, group, investor) are never requested,
 * so there is no code path by which they could reach a Nomad table.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { classify } from '../lib/classify';
import {
  normalizeName, normalizeState, normalizeText, normalizeUrl, normalizeZip, toE164, validCoords,
} from '../lib/normalize';
import type { FacilityCandidate } from '../lib/upsert';

/** The only Bravo columns Nomad ever reads. Adding an ownership column here is a bug. */
const COLUMNS =
  'id,name,hospital_type,secondary_tags,street,city,state,zip,latitude,longitude,phone,website,listing_status';

interface BravoRow {
  id: number;
  name: string | null;
  hospital_type: string | null;
  secondary_tags: string[] | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  phone: string | null;
  website: string | null;
  listing_status: string | null;
}

export interface BravoImportOptions {
  states: string[];
  /** Keep GP rows too. Off by default — they land as needs_review and bloat the queue. */
  includeGeneralPractice?: boolean;
}

export interface BravoImportResult {
  candidates: FacilityCandidate[];
  skipped: Array<{ name: string; reason: string }>;
  scanned: number;
}

export async function fetchBravoCandidates(
  bravo: SupabaseClient,
  options: BravoImportOptions,
): Promise<BravoImportResult> {
  const retrievedAt = new Date().toISOString();

  const { data, error } = await bravo
    .from('hospitals')
    .select(COLUMNS)
    .in('state', options.states)
    .eq('listing_status', 'public') // staged/unpublished rows are not Bravo's public truth
    .limit(5000);

  if (error) throw new Error(`Bravo query failed: ${error.message}`);
  const rows = (data ?? []) as unknown as BravoRow[];

  const candidates: FacilityCandidate[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const row of rows) {
    const name = row.name ? normalizeName(row.name) : null;
    if (!name) {
      skipped.push({ name: `bravo:${row.id}`, reason: 'no name' });
      continue;
    }

    const state = normalizeState(row.state);
    if (!state) {
      skipped.push({ name, reason: `unusable state ${JSON.stringify(row.state)}` });
      continue;
    }

    // Coordinates are required — `location` is NOT NULL and every estimate is geographic.
    const coords = validCoords(row.latitude, row.longitude);
    if (!coords) {
      skipped.push({ name, reason: 'missing or implausible coordinates' });
      continue;
    }
    const [lat, lng] = coords;

    const tags = row.secondary_tags ?? [];
    const classification = classify({
      name,
      sourceType: row.hospital_type,
      tags,
      is247: null, // Bravo does not track hours; never inferred from silence
    });

    // Emergency layers only. `specialty` is excluded deliberately: an appointment-only
    // ophthalmologist, dental surgeon or orthopedist cannot see a walk-in emergency, and
    // importing them put exactly those practices on the map as pins beside real ERs.
    const isEmergencyLayer =
      classification.status === 'active' &&
      (classification.facilityType === 'er' ||
        classification.facilityType === 'er_specialty' ||
        classification.facilityType === 'urgent_care');

    if (!isEmergencyLayer && !options.includeGeneralPractice) {
      skipped.push({ name, reason: `not an emergency-layer facility (${classification.reason})` });
      continue;
    }

    candidates.push({
      name,
      facilityType: classification.facilityType,
      status: classification.status,
      address1: normalizeText(row.street),
      city: normalizeText(row.city),
      state,
      zip: normalizeZip(row.zip),
      lat,
      lng,
      phone: toE164(row.phone),
      website: normalizeUrl(row.website),
      is247: null,
      // Bravo has no hours at all, so bands stay wide until a clinic or scrape confirms (§6.1).
      hoursConfidence: 'unknown',
      capabilities: classification.capabilities,
      species: classification.species,
      source: {
        source: 'bravo',
        source_id: String(row.id),
        retrieved_at: retrievedAt,
        classification: classification.reason,
      },
    });
  }

  return { candidates, skipped, scanned: rows.length };
}
