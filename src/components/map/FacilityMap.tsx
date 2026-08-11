'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { publicEnv } from '@/lib/env';
import type { FacilityPin } from '@/lib/facilities/query';
import { FacilitySheet } from './FacilitySheet';

/**
 * The facility map (CLAUDE.md §10.1).
 *
 * ┌ PRE-DESIGN ────────────────────────────────────────────────────────────────────┐
 * │ §12 requires pulling real references and committing to a palette and type       │
 * │ direction in writing BEFORE the real UI is built. That has not happened, so     │
 * │ this is deliberately restrained: it proves the data and the model end to end    │
 * │ and is not the visual direction. The design pass is still owed.                 │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * Two rules from §10 ARE honoured here, because they are correctness, not taste:
 *  - The estimate is encoded by colour AND a text label. Never colour alone (§10.1) —
 *    roughly 1 in 12 men cannot reliably separate the red/green ends of a ramp.
 *  - Dark basemap: the primary user is in a parking lot at 2 a.m. (§10).
 */

const SOURCE_ID = 'facilities';

/** Severity ramp keyed off p50 minutes. Mirrors the admin legend. */
function severityColor(p50: number | null, type: string): string {
  if (type === 'specialty' || p50 === null) return '#64748b'; // slate — not a walk-in ER
  if (p50 < 45) return '#34d399';
  if (p50 < 90) return '#5eead4';
  if (p50 < 150) return '#facc15';
  if (p50 < 240) return '#fb923c';
  return '#f87171';
}

export default function FacilityMap({ initial }: { initial: FacilityPin[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [facilities] = useState<FacilityPin[]>(initial);
  const [selected, setSelected] = useState<FacilityPin | null>(null);

  const toGeoJson = useCallback(
    (rows: FacilityPin[]) => ({
      type: 'FeatureCollection' as const,
      features: rows.map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.lng, f.lat] },
        properties: {
          id: f.id,
          name: f.name,
          facilityType: f.facilityType,
          // Specialty has no queue to model, so it gets a word rather than a number (§8).
          label: f.estimate ? f.estimate.band : 'Referral',
          color: severityColor(f.estimate?.p50Minutes ?? null, f.facilityType),
        },
      })),
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const maplibre = await import('maplibre-gl');
      const { Map, AttributionControl, NavigationControl } = maplibre;
      if (cancelled || !containerRef.current || mapRef.current) return;

      // MapLibre v6 loads its tile-parsing worker from a sibling .mjs, resolved against
      // import.meta.url. Inside a Turbopack chunk that resolves to a path that 404s, and
      // the failure is completely silent: the map constructs, controls render, no error
      // fires — but 'load' never does, so no tiles and no layers ever appear. Pointing at
      // the copy in public/ (see scripts/copy-maplibre-worker.mjs) is what makes the map
      // actually render.
      maplibre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

      const map = new Map({
        container: containerRef.current,
        style: publicEnv.mapStyleUrl,
        center: [-77.3, 38.6],
        zoom: 7.2,
        attributionControl: false,
      });

      // ODbL: OSM must be attributed wherever OSM-derived data is shown (§7.2).
      map.addControl(
        new AttributionControl({
          compact: true,
          customAttribution:
            '© OpenStreetMap contributors · Facility data: OSM, Bravo, clinics',
        }),
        'bottom-right',
      );
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        if (cancelled) return;

        map.addSource(SOURCE_ID, { type: 'geojson', data: toGeoJson(facilities) });

        map.addLayer({
          id: 'facility-halo',
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 13,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.18,
          },
        });

        map.addLayer({
          id: 'facility-dot',
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 6,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#0f172a',
          },
        });

        // The redundant channel: the band as text, so the pin is readable without colour.
        map.addLayer({
          id: 'facility-label',
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 11,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-font': ['Noto Sans Regular'],
          },
          paint: {
            'text-color': '#e2e8f0',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.6,
          },
        });

        const openFeature = (feature: MapGeoJSONFeature) => {
          const id = feature.properties?.id as string | undefined;
          const match = facilities.find((f) => f.id === id);
          if (match) setSelected(match);
        };

        for (const layer of ['facility-dot', 'facility-halo', 'facility-label']) {
          map.on('click', layer, (event) => {
            if (event.features?.[0]) openFeature(event.features[0]);
          });
          map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
          });
        }
      });

      // Dev-only handle so the map's real state can be inspected from a headless browser
      // or the console. Headless WebGL does not paint reliably, so "is the screenshot
      // blank" is not the same question as "are the layers correct".
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __nomadMap?: MapLibreMap }).__nomadMap = map;
      }

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Mount-only. Bbox-driven refetching lands with the real map UI in M3.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label="Map of veterinary emergency facilities"
      />
      {selected ? (
        <FacilitySheet facility={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}
