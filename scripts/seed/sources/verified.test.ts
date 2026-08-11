/**
 * Verified-record validation (CLAUDE.md §7, §15).
 *
 * These records are produced by research agents, which means they are untrusted input.
 * The asymmetry that governs every case here: a fabricated or mistyped ER sends someone
 * with a dying animal to the wrong building at 2 a.m.; a missing one is only a gap. So
 * validation rejects rather than repairs, and every rule below exists because the
 * alternative is worse than losing the record.
 */

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadVerifiedRecords, type VerifiedRecord } from './verified';

/** A complete, valid record. Individual tests break one field at a time. */
function validRecord(overrides: Partial<VerifiedRecord> = {}): VerifiedRecord {
  return {
    name: 'Friendship Hospital For Animals',
    address1: '4105 Brandywine St NW',
    city: 'Washington',
    state: 'DC',
    zip: '20016',
    phone: '(202) 364-5300',
    website: 'friendshiphospital.com',
    type: 'er_specialty',
    is247: true,
    hoursText: 'Open 24 hours',
    evidenceUrl: 'https://friendshiphospital.com/emergency/',
    evidenceQuote: 'Our emergency service is open 24 hours a day, 365 days a year.',
    // Coordinates supplied so the tests never touch the network.
    lat: 38.9497,
    lng: -77.0805,
    ...overrides,
  };
}

async function loadFixture(records: unknown[]): Promise<ReturnType<typeof loadVerifiedRecords>> {
  const dir = await mkdtemp(join(tmpdir(), 'nomad-verified-'));
  const file = join(dir, 'records.json');
  await writeFile(file, JSON.stringify(records), 'utf8');
  // loadVerifiedRecords resolves against cwd.
  return loadVerifiedRecords([relative(process.cwd(), file)]);
}

describe('accepting a good record', () => {
  it('normalises the fields it keeps', async () => {
    const { candidates, rejected } = await loadFixture([validRecord()]);
    expect(rejected).toHaveLength(0);
    expect(candidates).toHaveLength(1);

    const c = candidates[0];
    expect(c.facilityType).toBe('er_specialty');
    expect(c.status).toBe('active');
    expect(c.phone).toBe('+12023645300');
    expect(c.website).toBe('https://friendshiphospital.com');
    expect(c.hoursConfidence).toBe('seeded'); // published hours narrow the band (§6.1)
    expect(c.capabilities).toContain('overnight_care'); // implied by 24/7
    expect(c.species).toEqual(expect.arrayContaining(['dog', 'cat']));
  });

  it('records the evidence quote as provenance', async () => {
    const { candidates } = await loadFixture([validRecord()]);
    expect(candidates[0].source.source).toBe('verified');
    expect(candidates[0].source.classification).toContain('open 24 hours a day');
    expect(candidates[0].source.url).toBe('https://friendshiphospital.com/emergency/');
  });

  it('leaves hours unconfirmed when the record has none', async () => {
    const { candidates } = await loadFixture([
      validRecord({ hoursText: undefined, is247: undefined }),
    ]);
    // §6.1 widens the displayed band rather than pretending we know the hours.
    expect(candidates[0].hoursConfidence).toBe('unknown');
  });
});

describe('rejecting bad records', () => {
  it('rejects a record with no evidence', async () => {
    const { candidates, rejected } = await loadFixture([
      validRecord({ evidenceUrl: '', evidenceQuote: '' }),
    ]);
    expect(candidates).toHaveLength(0);
    expect(rejected[0].reason).toContain('evidence');
  });

  it('rejects specialty-only practices — the exact bug being fixed', async () => {
    // An ophthalmologist or oral surgeon cannot see a walk-in emergency. These appeared
    // as pins on the map, which is what prompted this whole source.
    const { candidates, rejected } = await loadFixture([
      validRecord({ name: 'Armour Veterinary Ophthalmology', type: 'specialty' as never }),
    ]);
    expect(candidates).toHaveLength(0);
    expect(rejected[0].reason).toContain('not an emergency layer');
  });

  it('rejects a record missing its street or city', async () => {
    const { rejected } = await loadFixture([validRecord({ address1: '' })]);
    expect(rejected[0].reason).toContain('missing street or city');
  });

  it('rejects an unusable state', async () => {
    const { rejected } = await loadFixture([validRecord({ state: 'Washington DC' })]);
    expect(rejected[0].reason).toContain('state');
  });

  it('drops the second copy when two regions both claim a border facility', async () => {
    const { candidates, rejected } = await loadFixture([validRecord(), validRecord()]);
    expect(candidates).toHaveLength(1);
    expect(rejected[0].reason).toContain('duplicate');
  });

  it('ignores capability and species values it does not recognise', async () => {
    const { candidates } = await loadFixture([
      validRecord({
        capabilities: ['ct', 'teleportation', 'mri'],
        species: ['dog', 'dragon'],
      }),
    ]);
    expect(candidates[0].capabilities).toEqual(expect.arrayContaining(['ct', 'mri']));
    expect(candidates[0].capabilities).not.toContain('teleportation');
    expect(candidates[0].species).toEqual(['dog']);
  });
});

describe('surviving malformed files', () => {
  it('skips a file that is not an array without losing the others', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nomad-verified-'));
    const bad = join(dir, 'bad.json');
    const good = join(dir, 'good.json');
    await writeFile(bad, JSON.stringify({ oops: true }), 'utf8');
    await writeFile(good, JSON.stringify([validRecord()]), 'utf8');

    const { candidates } = await loadVerifiedRecords([
      relative(process.cwd(), bad),
      relative(process.cwd(), good),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it('skips a file that does not exist', async () => {
    const { candidates, scanned } = await loadVerifiedRecords(['data/dmv/does-not-exist.json']);
    expect(candidates).toHaveLength(0);
    expect(scanned).toBe(0);
  });
});
