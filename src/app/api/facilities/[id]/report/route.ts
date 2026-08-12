/**
 * POST /api/facilities/:id/report — an owner report (CLAUDE.md §9, §6.4 Tier 2, §6.5).
 *
 * This is the function Rod asked for: a way for the person actually standing in the waiting
 * room to tell the map what is really happening. Everything about it is shaped by one
 * invariant (#6): **owner reports move the display toward the model, never beyond it.**
 *
 * They can revert a rosy clinic claim to the neutral baseline. They cannot make a hospital
 * look faster, and they cannot make a rival look slower. That bounds every gaming strategy —
 * a clinic astroturfing its own queue, or a competitor brigading someone else's — at the
 * neutral model estimate, which is the worst anyone can achieve by lying.
 *
 * Anonymous by design: no account, no location stored, no free text (§13). The only handle
 * is a salted device hash used for rate limiting and never shown.
 *
 * Runs with the service role because `owner_reports` has RLS on and zero policies (§5) —
 * clients cannot touch the table directly, so the limits below cannot be bypassed by
 * calling Supabase from the browser.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { deviceHash } from '@/lib/reports/deviceHash';

const KINDS = ['still_waiting', 'total_wait', 'left_for_faster'] as const;
const BUCKETS = ['none', 'under_30', 'min_30_60', 'hr_1_2', 'hr_2_4', 'hr_4_plus'] as const;

// §6.5, verbatim: 1 per device per facility per 4 h, 5 per device per day.
const PER_FACILITY_HOURS = 4;
const PER_DAY_LIMIT = 5;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: facilityId } = await context.params;

  let body: { kind?: string; bucket?: string; clientToken?: string; nearFacility?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const kind = body.kind as (typeof KINDS)[number];
  if (!KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `kind must be one of ${KINDS.join(', ')}` },
      { status: 400 },
    );
  }

  const bucket = body.bucket as (typeof BUCKETS)[number] | undefined;
  if (kind !== 'left_for_faster' && !BUCKETS.includes(bucket as never)) {
    return NextResponse.json(
      { error: `bucket must be one of ${BUCKETS.join(', ')}` },
      { status: 400 },
    );
  }

  if (!body.clientToken || body.clientToken.length < 8) {
    return NextResponse.json({ error: 'Missing client token.' }, { status: 400 });
  }

  const db = createServiceClient();

  // The facility must exist and be one we actually show.
  const { data: facility, error: facilityError } = await db
    .from('facilities')
    .select('id')
    .eq('id', facilityId)
    .eq('status', 'active')
    .maybeSingle();
  if (facilityError) {
    return NextResponse.json({ error: facilityError.message }, { status: 500 });
  }
  if (!facility) {
    return NextResponse.json({ error: 'No such facility.' }, { status: 404 });
  }

  let hash: string;
  try {
    hash = deviceHash(body.clientToken, request.headers);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Hashing failed.' },
      { status: 500 },
    );
  }

  // ── rate limits (§6.5) — enforced by counting recent rows, no extra infra ──
  const since4h = new Date(Date.now() - PER_FACILITY_HOURS * 3600_000).toISOString();
  const { count: recentHere, error: e1 } = await db
    .from('owner_reports')
    .select('id', { count: 'exact', head: true })
    .eq('facility_id', facilityId)
    .eq('device_hash', hash)
    .gte('created_at', since4h);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  if ((recentHere ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `You already reported this hospital in the last ${PER_FACILITY_HOURS} hours. Thank you — that is enough to count.`,
      },
      { status: 429 },
    );
  }

  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: recentAnywhere, error: e2 } = await db
    .from('owner_reports')
    .select('id', { count: 'exact', head: true })
    .eq('device_hash', hash)
    .gte('created_at', since24h);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  if ((recentAnywhere ?? 0) >= PER_DAY_LIMIT) {
    return NextResponse.json(
      { error: 'Daily report limit reached.' },
      { status: 429 },
    );
  }

  const { error: insertError } = await db.from('owner_reports').insert({
    facility_id: facilityId,
    kind,
    reported_wait_bucket: kind === 'left_for_faster' ? null : bucket,
    device_hash: hash,
    // Client-asserted and forgeable — stored as a weak signal, never as proof of
    // presence. The client computes it locally; no coordinates reach this server.
    near_facility: typeof body.nearFacility === 'boolean' ? body.nearFacility : null,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Thank you — this helps the next person.',
  });
}
