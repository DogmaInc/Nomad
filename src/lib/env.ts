/**
 * Environment access (CLAUDE.md §14).
 *
 * Split deliberately: `publicEnv` is safe in the browser bundle, `serverEnv` throws
 * if it is ever imported from client code. The service role key must never leak.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  mapStyleUrl:
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
    'https://tiles.openfreemap.org/styles/positron',
} as const;

export type DriveTimeProviderName = 'heuristic' | 'osrm' | 'mapbox';

export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called from client code.');
  }
  const provider = (process.env.DRIVE_TIME_PROVIDER ??
    'heuristic') as DriveTimeProviderName;

  return {
    supabaseUrl: required(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    serviceRoleKey: required(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    driveTimeProvider: provider,
    osrmUrl: process.env.OSRM_URL ?? '',
    mapboxToken: process.env.MAPBOX_TOKEN ?? '',
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
    deviceHashSalt: process.env.DEVICE_HASH_SALT ?? '',
  } as const;
}
