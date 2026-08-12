import 'server-only';

/**
 * Facility reads with their fused estimate (CLAUDE.md §9).
 *
 * Uses the anon key, not the service role: the public map must be readable with exactly the
 * permissions a browser has, so RLS is exercised on every request rather than bypassed.
 * If a policy is wrong, this surfaces it here instead of in production.
 */

import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import { estimateWait } from '@/lib/model/estimate';
import { loadModelParams } from '@/lib/model/params';
import { formatBand } from '@/lib/model/format';
import type { FacilityType, HoursConfidence } from '@/lib/model/types';

export interface FacilityPin {
  id: string;
  name: string;
  facilityType: FacilityType;
  status: string;
  city: string | null;
  state: string;
  address1: string | null;
  phone: string | null;
  website: string | null;
  lat: number;
  lng: number;
  is247: boolean | null;
  hoursConfidence: HoursConfidence;
  /** Capability chips (§10.1) — what this hospital can actually do at 2 a.m. */
  capabilities: string[];
  /** How the floor runs. Changes what "wait" means to the person standing there. */
  careModel: 'open_floor' | 'traditional' | null;
  /** Null for specialty — appointment-based, no walk-in queue to model (§8). */
  estimate: {
    p50Minutes: number;
    bandLoMinutes: number;
    bandHiMinutes: number;
    band: string;
    /** The full public sentence, provenance included (invariant #4). */
    sentence: string;
    localHour: number;
    dayClass: string;
    /** Signal tier that produced this. Only 'model' exists in M1 (§6.4). */
    provenance: 'model';
  } | null;
}

function publicDb() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface FacilityQuery {
  /** [west, south, east, north] */
  bbox?: [number, number, number, number];
  state?: string;
  types?: FacilityType[];
  limit?: number;
  /**
   * Include appointment-only specialty practices. Off by default — see EMERGENCY_TYPES.
   * Kept as an option because specialty rows still matter to /admin/review.
   */
  includeSpecialty?: boolean;
}

/**
 * What belongs on an emergency map.
 *
 * `specialty` is deliberately NOT here. A referral ophthalmologist or an oral surgeon
 * cannot help a pet owner at 2 a.m. — they are appointment-only, and §8 already bars them
 * from ranking. Showing them as pins put a dental practice and an eye clinic on the map
 * next to real ERs, which is noise at best and a wrong turn at worst.
 */
export const EMERGENCY_TYPES: FacilityType[] = ['er', 'er_specialty', 'urgent_care'];

export async function getFacilities(query: FacilityQuery = {}): Promise<FacilityPin[]> {
  const db = publicDb();
  const { params, holidays } = await loadModelParams(db);

  let select = db
    .from('facilities')
    .select(
      'id, name, facility_type, status, address1, city, state, phone, website, lat, lng, tz, is_24_7, hours_confidence, density_mult, care_model, facility_capabilities(capability)',
    )
    // Only `active`. §7 puts ambiguous classifications in as `needs_review` and excludes
    // them from emergency ranking until a human confirms them — and a pin on an emergency
    // map IS a ranking claim. An unconfirmed facility shown as an ER is the exact failure
    // §7 exists to prevent, so needs_review stays in the registry and off the map.
    .eq('status', 'active')
    .limit(query.limit ?? 500);

  if (query.state) select = select.eq('state', query.state.toUpperCase());

  const types = query.types?.length
    ? query.types
    : query.includeSpecialty
      ? undefined
      : EMERGENCY_TYPES;
  if (types) select = select.in('facility_type', types);
  if (query.bbox) {
    const [west, south, east, north] = query.bbox;
    select = select.gte('lng', west).lte('lng', east).gte('lat', south).lte('lat', north);
  }

  const { data, error } = await select;
  if (error) throw new Error(`Facility query failed: ${error.message}`);

  const now = new Date();

  return (data ?? []).map((row): FacilityPin => {
    const estimate = estimateWait(
      {
        facilityType: row.facility_type,
        tz: row.tz,
        densityMult: Number(row.density_mult),
        hoursConfidence: row.hours_confidence,
      },
      now,
      params,
      holidays,
    );

    return {
      id: row.id,
      name: row.name,
      facilityType: row.facility_type,
      status: row.status,
      city: row.city,
      state: row.state,
      address1: row.address1,
      phone: row.phone,
      website: row.website,
      lat: Number(row.lat),
      lng: Number(row.lng),
      is247: row.is_24_7,
      hoursConfidence: row.hours_confidence,
      capabilities: (row.facility_capabilities ?? []).map(
        (c: { capability: string }) => c.capability,
      ),
      careModel: row.care_model ?? null,
      estimate: estimate
        ? {
            p50Minutes: estimate.p50Minutes,
            bandLoMinutes: estimate.bandLoMinutes,
            bandHiMinutes: estimate.bandHiMinutes,
            band: formatBand(estimate.bandLoMinutes, estimate.bandHiMinutes),
            sentence: `Typically ${formatBand(
              estimate.bandLoMinutes,
              estimate.bandHiMinutes,
            )} at this hour (modeled — call to confirm)`,
            localHour: estimate.localHour,
            dayClass: estimate.dayClass,
            provenance: 'model',
          }
        : null,
    };
  });
}
