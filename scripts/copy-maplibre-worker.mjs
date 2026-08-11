/**
 * Copy MapLibre's worker modules into public/maplibre/.
 *
 * WHY THIS EXISTS
 * MapLibre GL JS v6 is ESM-only and runs tile parsing in a Web Worker that lives in a
 * separate file. It locates that file with `new URL('maplibre-gl-worker.mjs',
 * import.meta.url)`. Inside a Next/Turbopack bundle, `import.meta.url` is the hashed chunk
 * URL, so that resolves to /_next/static/chunks/maplibre-gl-worker.mjs — which does not
 * exist. Next serves its HTML 404 page instead, the browser refuses it ("Failed to load
 * module script: non-JavaScript MIME type of text/html"), and the worker never starts.
 *
 * The failure is silent in the worst way: `new Map()` succeeds, controls and attribution
 * render, no error fires on the map, `map.on('load')` simply never runs. The symptom is a
 * blank basemap with zero tile requests — nothing in the console points at the worker.
 *
 * Serving the worker from a stable public path and calling `setWorkerUrl` fixes it. Both
 * files are needed: the worker imports './maplibre-gl-shared.mjs' as a sibling, so they
 * must land in the same directory.
 *
 * Runs on postinstall so a fresh clone or a MapLibre upgrade cannot leave a stale copy.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const distDir = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
const outDir = resolve(process.cwd(), 'public/maplibre');

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

await mkdir(outDir, { recursive: true });
for (const file of FILES) {
  await copyFile(resolve(distDir, file), resolve(outDir, file));
  console.log(`maplibre worker: copied ${file} → public/maplibre/`);
}
