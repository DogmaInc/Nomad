import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Use ONLY inside route handlers and server components that have already done their
 * own authorization. Anonymous writes (owner reports, flags) go through here because
 * the §6.5 rate limits live in the route, not in the database.
 */
export function createServiceClient() {
  const env = serverEnv();
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
