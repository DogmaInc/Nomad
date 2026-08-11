'use server';

/**
 * Server Actions for the admin area (§9).
 *
 * Every action re-checks authentication. A Server Action is a POST endpoint, so it is
 * reachable independently of the layout that gates the page — the layout check protects
 * rendering, not mutation.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkPassword, createSession, destroySession, isAuthenticated } from '@/lib/admin/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { invalidateModelParamsCache } from '@/lib/model/params';

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = String(formData.get('password') ?? '');
  if (!checkPassword(password)) return 'Incorrect password.';
  await createSession();
  redirect('/admin/model');
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/admin/login');
}

/** Server Actions are POST endpoints reachable independently of any page, so each one
 *  re-checks authorisation rather than trusting that a guarded page rendered the form. */
async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error('Not authorised.');
}

/** Parse a numeric form field, rejecting blanks and nonsense rather than coercing to 0. */
function numberField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export interface SaveResult {
  ok: boolean;
  message: string;
}

/**
 * Resolve a review-queue facility (§7 classification queue).
 *
 * `approve` sets the type explicitly and makes the facility active — that is what puts it
 * on the map. `reject` marks it `not_emergency`: the row and its provenance stay (§7 never
 * hard-deletes), but it leaves both the map and the queue. Every rejected row is also a
 * record of a case the importer classified wrongly, which is how the classifier improves.
 */
export async function resolveFacility(
  facilityId: string,
  decision: 'approve' | 'reject',
  facilityType: string,
): Promise<SaveResult> {
  await requireAdmin();

  const allowed = ['er', 'er_specialty', 'urgent_care'];
  if (decision === 'approve' && !allowed.includes(facilityType)) {
    return { ok: false, message: `"${facilityType}" is not an emergency layer.` };
  }

  const db = createServiceClient();
  const patch =
    decision === 'approve'
      ? { status: 'active', facility_type: facilityType }
      : { status: 'not_emergency' };

  const { error } = await db.from('facilities').update(patch).eq('id', facilityId);
  if (error) return { ok: false, message: error.message };

  revalidatePath('/admin/review');
  revalidatePath('/');
  return {
    ok: true,
    message: decision === 'approve' ? `Approved as ${facilityType}.` : 'Kept off the map.',
  };
}

/**
 * Save the §6.2 parameters.
 *
 * This is the form that makes the M1 gate passable: Rod re-tunes numbers here and the
 * inspection table re-renders, with no deploy and no engineer. The in-process param cache
 * is invalidated on write so the change is visible on the very next render (§6 allows a
 * 5-minute cache, which would otherwise make tuning feel broken).
 */
export async function saveModelParams(formData: FormData): Promise<SaveResult> {
  await requireAdmin();
  const db = createServiceClient();

  const errors: string[] = [];

  // ── base_waits ────────────────────────────────────────────────────────────
  for (const type of ['er', 'er_specialty', 'urgent_care'] as const) {
    const base = numberField(formData, `base.${type}.base`);
    const min = numberField(formData, `base.${type}.min`);
    const max = numberField(formData, `base.${type}.max`);
    if (base === null || min === null || max === null) continue;

    if (min > base || base > max) {
      errors.push(`${type}: need min ≤ base ≤ max (got ${min}, ${base}, ${max}).`);
      continue;
    }
    const { error } = await db
      .from('base_waits')
      .update({ base_minutes: Math.round(base), min_minutes: Math.round(min), max_minutes: Math.round(max) })
      .eq('facility_type', type);
    if (error) errors.push(`${type} base waits: ${error.message}`);
  }

  // ── day_mults ─────────────────────────────────────────────────────────────
  const dayClasses = ['weekday', 'friday', 'saturday', 'sunday', 'holiday', 'holiday_adjacent'] as const;
  for (const dayClass of dayClasses) {
    const value = numberField(formData, `day.${dayClass}`);
    if (value === null) continue;
    if (value <= 0) {
      errors.push(`${dayClass}: multiplier must be greater than 0.`);
      continue;
    }
    const { error } = await db
      .from('day_mults')
      .update({ multiplier: value })
      .eq('day_class', dayClass);
    if (error) errors.push(`${dayClass}: ${error.message}`);
  }

  // ── hod_curves ────────────────────────────────────────────────────────────
  for (const type of ['er', 'er_specialty', 'urgent_care'] as const) {
    for (let hour = 0; hour < 24; hour++) {
      const value = numberField(formData, `hod.${type}.${hour}`);
      if (value === null) continue;
      if (value <= 0) {
        errors.push(`${type} hour ${hour}: multiplier must be greater than 0.`);
        continue;
      }
      const { error } = await db
        .from('hod_curves')
        .update({ multiplier: value })
        .eq('facility_type', type)
        .eq('hour', hour);
      if (error) errors.push(`${type} hour ${hour}: ${error.message}`);
    }
  }

  // ── band ratios ───────────────────────────────────────────────────────────
  const bandLo = numberField(formData, 'band.lo');
  const bandHi = numberField(formData, 'band.hi');
  if (bandLo !== null && bandHi !== null) {
    if (bandLo >= 1 || bandHi <= 1) {
      errors.push('Band ratios must straddle 1 (low < 1 < high) so the band contains the estimate.');
    } else {
      for (const [key, value] of [['band_lo', bandLo], ['band_hi', bandHi]] as const) {
        const { error } = await db.from('model_params').update({ value }).eq('key', key);
        if (error) errors.push(`${key}: ${error.message}`);
      }
    }
  }

  invalidateModelParamsCache();
  revalidatePath('/admin/model');

  return errors.length
    ? { ok: false, message: errors.join(' ') }
    : { ok: true, message: 'Saved. The table below is recomputed.' };
}
