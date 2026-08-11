import 'server-only';

/**
 * Admin gate for /admin/* (CLAUDE.md §9 — "role-gated server components").
 *
 * ┌ SCAFFOLDING — deliberately not the final design ──────────────────────────────┐
 * │ §5 defines the real admin model: Supabase Auth + an `admins` table + is_admin().│
 * │ That needs a login flow, an account, and an email round-trip — none of which     │
 * │ exist in M1, and all of which stand between Rod and the inspection page that IS  │
 * │ the M1 gate. So this is a single shared password held in the environment,        │
 * │ exchanged for a signed, httpOnly, expiring cookie.                              │
 * │                                                                                 │
 * │ Properties it does have: the password is never in the repo, comparison is        │
 * │ timing-safe, the cookie is HMAC-signed so it cannot be forged, it is httpOnly    │
 * │ so client JS cannot read it, and it expires. Properties it does NOT have: per-   │
 * │ user identity, revocation, or an audit trail of who changed a parameter.        │
 * │                                                                                 │
 * │ Replace with Supabase Auth + `admins` in M4, when clinic accounts arrive and     │
 * │ there is a login flow to reuse. The call sites below are the only two places     │
 * │ that need to change.                                                            │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

const COOKIE_NAME = 'nomad_admin';
const SESSION_HOURS = 12;

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error('ADMIN_SESSION_SECRET is not set — see .env.example.');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/** Constant-time compare that tolerates length differences without leaking them. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the failure takes the same time as a mismatch.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export async function createSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expiresAt);
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return false;

  const separator = raw.lastIndexOf('.');
  if (separator === -1) return false;

  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!safeEqual(signature, sign(payload))) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/**
 * Redirect to the login page unless the caller is an authenticated admin.
 *
 * ┌ WHY THIS IS NOT DONE IN THE LAYOUT ────────────────────────────────────────────┐
 * │ It was, and it leaked. A layout that renders <LoginForm/> instead of {children} │
 * │ still lets the page Server Component run: the router renders route segments     │
 * │ independently, so the page's data ends up in the RSC payload of the response     │
 * │ even though the browser paints a login form. Measured on this app before the     │
 * │ fix: an unauthenticated GET of /admin/model returned 145 KB containing every     │
 * │ facility name and every computed estimate.                                       │
 * │                                                                                  │
 * │ Next's own auth guide states it plainly — "a layout ... does not stop them from  │
 * │ running or from appearing in the RSC Payload" — and prescribes checking close to │
 * │ the data source instead. Hence `adminDb()` below: the check and the data handle  │
 * │ are the same call, so a future admin page cannot fetch data without being        │
 * │ authorised, even if someone forgets to guard the page.                           │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) redirect('/admin/login');
}

/**
 * The admin Data Access Layer: authorisation and data access in one call.
 *
 * Returns a service-role client, which bypasses RLS — so it must never be reachable
 * without the check that precedes it on the line above.
 */
export async function adminDb(): Promise<SupabaseClient> {
  await requireAdmin();
  const env = serverEnv();
  return createClient(env.supabaseUrl, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
