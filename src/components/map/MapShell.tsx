'use client';

import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { publicEnv } from '@/lib/env';

type Props = {
  /** Initial centre. Defaults to the DMV — the M1 calibration region (CLAUDE.md §4). */
  center?: [number, number];
  zoom?: number;
};

/**
 * M0 map shell — renders an empty, interactive basemap and nothing else.
 *
 * Deliberately undesigned: §12 requires pulling real references and committing to a
 * palette/type direction in writing BEFORE building the real map UI. Pins, clustering,
 * estimate bands and the bottom sheet all land in M3.
 *
 * MapLibre is imported at runtime inside the effect so nothing touches `window`
 * during server rendering.
 */
export default function MapShell({
  center = [-77.0369, 38.9072],
  zoom = 9,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { Map, AttributionControl, NavigationControl } = await import(
        'maplibre-gl'
      );
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = new Map({
        container: containerRef.current,
        style: publicEnv.mapStyleUrl,
        center,
        zoom,
        attributionControl: false,
      });

      // ODbL: OSM attribution is required wherever OSM-derived data is shown (§7).
      map.addControl(
        new AttributionControl({
          compact: true,
          customAttribution:
            '© OpenStreetMap contributors · Facility data: state boards, OSM, clinics',
        }),
        'bottom-right',
      );

      map.addControl(
        new NavigationControl({ showCompass: false }),
        'top-right',
      );

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Mount-only: re-centering is handled imperatively once ranking exists (M3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label="Map of veterinary emergency facilities"
    />
  );
}
