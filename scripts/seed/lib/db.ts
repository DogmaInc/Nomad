/**
 * Database access for seed scripts.
 *
 * Seeding runs with the Nomad secret key (bypasses RLS — the registry is service-role
 * write-only by design, §5). This module is never imported by app code.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Scripts run outside Next, so nothing has loaded .env.local for us.
config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Seed scripts read .env.local from the repo root — run them from there.`,
    );
  }
  return value;
}

/** Nomad, with the secret key. Writes bypass RLS. */
export function nomadDb(): SupabaseClient {
  return createClient(
    need('NEXT_PUBLIC_SUPABASE_URL'),
    process.env.SUPABASE_SECRET_KEY || need('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Bravo, read-only with its anon key.
 *
 * Bravo is a separate product and a separate Supabase project; Nomad only ever reads
 * from it, and only the facility columns (§7.1). Ownership columns are dropped at this
 * boundary and never reach a Nomad table — invariant #1.
 */
export function bravoDb(): SupabaseClient {
  return createClient(need('BRAVO_SUPABASE_URL'), need('BRAVO_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
