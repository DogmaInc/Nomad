/**
 * Environment access (CLAUDE.md §14).
 *
 * Split deliberately: `publicEnv` is safe in the browser bundle, `serverEnv` throws
 * if it is ever imported from client code. The secret / service-role key must never leak.
 *
 * Supabase is mid-migration between two key schemes and this project has both enabled:
 *   - new:    sb_publishable_... (browser)  /  sb_secret_...      (server)
 *   - legacy: anon JWT           (browser)  /  service_role JWT   (server)
 * We prefer the new scheme and fall back to the legacy one, so rotating to new-style
 * keys later is a .env change with no code change.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

// NOTE: these must be statically analysable literals — Next inlines NEXT_PUBLIC_* at
// build time, so `process.env[someVariable]` would silently produce undefined.
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  /** Browser-safe Supabase key. RLS is what protects the data, not this value. */
  supabaseKey: publishableKey,
  mapStyleUrl:
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
    'https://tiles.openfreemap.org/styles/positron',
} as const;

export type DriveTimeProviderName = 'heuristic' | 'osrm' | 'mapbox';

export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called from client code.');
  }

  const secretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const provider = (process.env.DRIVE_TIME_PROVIDER ??
    'heuristic') as DriveTimeProviderName;

  return {
    supabaseUrl: required(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    /** Bypasses RLS. Server only, never sent to a client. */
    secretKey: required(
      'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)',
      secretKey,
    ),
    driveTimeProvider: provider,
    osrmUrl: process.env.OSRM_URL ?? '',
    mapboxToken: process.env.MAPBOX_TOKEN ?? '',
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
    deviceHashSalt: process.env.DEVICE_HASH_SALT ?? '',
  } as const;
}
