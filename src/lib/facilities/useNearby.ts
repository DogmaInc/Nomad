'use client';

import { useCallback, useMemo, useState } from 'react';
import type { FacilityPin } from './query';

/**
 * Location, drive time, and total-time-until-seen (CLAUDE.md §8, §10.3).
 *
 * Without this the list is not an answer. Sorting 81 facilities by wait alone puts a
 * hospital ninety minutes away above one down the road, because the model does not know
 * where "down the road" is. A shorter wait you cannot reach in time is not a shorter wait.
 *
 * **Total until seen = drive + wait.** That single figure is the product's thesis — it is
 * what makes "drive further to be seen sooner" visible instead of counter-intuitive.
 *
 * Drive time uses the §8 heuristic provider, computed on the device: haversine × 1.30 for
 * road winding, ÷ 45 km/h in dense areas or 65 km/h where facilities are sparse. It is
 * labelled "~drive" everywhere it appears because it is an estimate, not a routed time.
 * A real routing provider drops in behind the same shape later.
 *
 * The position never leaves the device. Nothing is sent to our server, stored, or logged —
 * §13 forbids location tracking, and none happens here.
 */

const ROAD_WINDING = 1.3;
const METRO_KMH = 45;
const RURAL_KMH = 65;
/** Above this density multiplier a facility is in a sparse area — faster roads. */
const METRO_DENSITY_MAX = 0.95;

export interface NearbyFacility extends FacilityPin {
  /** Straight-line kilometres. */
  distanceKm: number;
  /** Estimated driving minutes (heuristic — see §8). */
  driveMinutes: number;
  /** drive + modeled wait, in minutes. Null when the facility has no estimate. */
  totalMinutes: number | null;
}

export type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; lat: number; lng: number }
  | { status: 'denied'; message: string };

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useNearby(facilities: FacilityPin[]) {
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocation({
        status: 'denied',
        message: 'This browser cannot share your location. Use the map to find an ER near you.',
      });
      return;
    }

    setLocation({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation({
          status: 'ready',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) =>
        setLocation({
          status: 'denied',
          message:
            error.code === error.PERMISSION_DENIED
              ? 'Location is off, so these are sorted by typical wait only. Turn it on to see which is fastest to reach.'
              : 'Could not get your location. Sorted by typical wait only.',
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const ranked = useMemo<NearbyFacility[] | null>(() => {
    if (location.status !== 'ready') return null;

    const withDistance = facilities.map((facility) => {
      const distanceKm = haversineKm(location.lat, location.lng, facility.lat, facility.lng);
      const kmh = facility.densityMult > METRO_DENSITY_MAX ? RURAL_KMH : METRO_KMH;
      const driveMinutes = Math.round((distanceKm * ROAD_WINDING) / kmh * 60);
      const wait = facility.estimate?.p50Minutes ?? null;
      return {
        ...facility,
        distanceKm,
        driveMinutes,
        totalMinutes: wait === null ? null : driveMinutes + wait,
      };
    });

    return withDistance.sort(
      (a, b) => (a.totalMinutes ?? Infinity) - (b.totalMinutes ?? Infinity),
    );
  }, [facilities, location]);

  /**
   * The further-but-faster callout (§8.4) — the sentence the product exists to say.
   * Fires when a hospital that is NOT the nearest beats the nearest by a meaningful margin.
   */
  const furtherButFaster = useMemo(() => {
    if (!ranked || ranked.length < 2) return null;

    const nearest = [...ranked].sort((a, b) => a.driveMinutes - b.driveMinutes)[0];
    const best = ranked.find((f) => f.totalMinutes !== null);
    if (!best || !nearest || best.id === nearest.id) return null;
    if (nearest.totalMinutes === null || best.totalMinutes === null) return null;

    const saved = nearest.totalMinutes - best.totalMinutes;
    if (saved < 30) return null;

    return {
      facility: best,
      extraDriveMinutes: best.driveMinutes - nearest.driveMinutes,
      savedMinutes: saved,
    };
  }, [ranked]);

  return { location, request, ranked, furtherButFaster };
}
