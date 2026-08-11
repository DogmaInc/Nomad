/**
 * GET /api/facilities (CLAUDE.md §9)
 *
 *   ?bbox=west,south,east,north   ?state=MD   ?types=er,urgent_care   ?limit=200
 *
 * Returns pins with their current modeled estimate. §9 requires bbox for the map path and
 * caps results; `state` is accepted as the equivalent for the SSR index pages, and one of
 * the two must be present so nothing can ask for the whole national registry by accident.
 */

import { NextResponse } from 'next/server';
import { getFacilities } from '@/lib/facilities/query';
import type { FacilityType } from '@/lib/model/types';

const VALID_TYPES: FacilityType[] = ['er', 'er_specialty', 'specialty', 'urgent_care'];
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const bboxParam = searchParams.get('bbox');
  const state = searchParams.get('state');

  let bbox: [number, number, number, number] | undefined;
  if (bboxParam) {
    const parts = bboxParam.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return NextResponse.json(
        { error: 'bbox must be four numbers: west,south,east,north' },
        { status: 400 },
      );
    }
    bbox = [parts[0], parts[1], parts[2], parts[3]];
  }

  if (!bbox && !state) {
    return NextResponse.json({ error: 'Provide bbox or state.' }, { status: 400 });
  }

  const typesParam = searchParams.get('types');
  const types = typesParam
    ? (typesParam.split(',').filter((t) => VALID_TYPES.includes(t as FacilityType)) as FacilityType[])
    : undefined;

  const limitParam = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_LIMIT)
    : undefined;

  try {
    const facilities = await getFacilities({ bbox, state: state ?? undefined, types, limit });
    return NextResponse.json(
      { facilities, count: facilities.length, generatedAt: new Date().toISOString() },
      {
        // Estimates change on the hour boundary, so a short cache is safe and keeps the
        // map responsive while panning. Never longer: staleness must stay invisible.
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
