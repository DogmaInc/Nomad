'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/** Anon-key browser client. Everything it can reach is governed by RLS (§5). */
export function createNomadBrowserClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseKey);
}
