/**
 * Classification tests (CLAUDE.md §7, §15).
 *
 * The governing rule is precision over recall for the emergency layers: showing a daytime
 * GP as a 2 a.m. ER is the failure mode that hurts someone. These cases are drawn from real
 * DMV rows seen during the M1 seed, so they encode actual mistakes rather than imagined ones.
 */

import { describe, expect, it } from 'vitest';
import { classify } from './classify';

describe('the GP trap (the failure mode §7 is written to prevent)', () => {
  it('does not promote a general practice that merely mentions emergencies', () => {
    const result = classify({
      name: 'Riverview Animal Clinic',
      sourceType: 'general_practice',
      text: 'We see emergencies during business hours',
    });
    expect(result.status).toBe('needs_review');
    expect(result.reason).toContain('not an ER');
  });

  it('keeps a plain GP out of the emergency layers', () => {
    const result = classify({ name: 'Soldotna Animal Hospital', sourceType: 'general_practice' });
    expect(result.status).toBe('needs_review');
  });
});

describe('source-declared types', () => {
  it('trusts a source that categorised the facility itself', () => {
    expect(classify({ name: 'Mountain View Animal Emergency', sourceType: 'emergency' }))
      .toMatchObject({ facilityType: 'er', status: 'active' });
    expect(classify({ name: 'ACHIEVE Veterinary Urgent Care', sourceType: 'urgent_care' }))
      .toMatchObject({ facilityType: 'urgent_care', status: 'active' });
  });

  it('routes appointment-based specialty practices to specialty, never to an ER type', () => {
    const result = classify({ name: 'Armour Veterinary Ophthalmology', sourceType: 'specialty' });
    expect(result.facilityType).toBe('specialty');
    expect(result.status).toBe('active');
  });

  it('upgrades an emergency source type to er_specialty when specialty is also present', () => {
    expect(classify({ name: 'Chesapeake Veterinary Referral Center', sourceType: 'emergency' }))
      .toMatchObject({ facilityType: 'er_specialty' });
  });
});

describe('"Specialists" vs "Specialty"', () => {
  // This exact hospital was typed as plain `er` until the pattern covered "Specialist".
  it('recognises Specialists in a name', () => {
    const result = classify({
      name: 'VCA SouthPaws Veterinary Specialists & Emergency Center',
      is247: true,
    });
    expect(result.facilityType).toBe('er_specialty');
  });
});

describe('24/7 without emergency wording is a lead, not a conclusion (§7)', () => {
  // Real DMV hospitals whose names never say "emergency" but which run around the clock.
  // They are plausible ERs, so they belong in the registry — but they are not put on the
  // map on this basis alone. A verified record promotes them; a regex does not.
  it.each([
    'Blue Ridge Veterinary Associates',
    'Virginia Veterinary Centers',
  ])('registers %s as needs_review on structured 24/7 alone', (name) => {
    const result = classify({ name, is247: true });
    expect(result.facilityType).toBe('er');
    expect(result.status).toBe('needs_review');
  });

  it('distinguishes structured 24/7 from a marketing sentence', () => {
    // Aldie Veterinary Hospital is a general practice. Its ONLY 24/7 signal was an OSM
    // description reading "Animal Veterinary Hospital that is open 24/7 daily", and that
    // put it on an emergency map. Prose must be recognisably the weakest basis.
    const prose = classify({
      name: 'Aldie Veterinary Hospital',
      text: 'Animal Veterinary Hospital that is open 24/7 daily.',
    });
    expect(prose.status).toBe('needs_review');
    expect(prose.reason).toContain('prose');

    const structured = classify({ name: 'Some Animal Hospital', is247: true });
    expect(structured.reason).toContain('structured');
  });

  it('adds overnight_care to any 24/7 facility even when no source says the word', () => {
    expect(classify({ name: 'Some Animal Hospital', is247: true }).capabilities)
      .toContain('overnight_care');
  });
});

describe('structured emergency markers', () => {
  it('accepts an after-hours ER that is not 24/7', () => {
    // EMMAVet: emergency=yes, open 15:00–23:00. A 24/7 test would wrongly reject it.
    const result = classify({ name: 'EMMAVet', structuredEmergency: true, is247: false });
    expect(result.facilityType).toBe('er');
    expect(result.status).toBe('active');
  });
});

describe('capabilities and species', () => {
  it('reads capabilities out of tags and prose', () => {
    const result = classify({
      name: 'Big Referral Hospital',
      sourceType: 'emergency',
      tags: ['MRI', 'blood bank', 'ventilator'],
      text: 'CT and endoscopy available',
    });
    expect(result.capabilities).toEqual(
      expect.arrayContaining(['mri', 'blood_products', 'ventilator', 'ct', 'endoscopy']),
    );
  });

  it('assumes dog and cat unless the facility reads as large-animal only', () => {
    expect(classify({ name: 'City Animal ER', sourceType: 'emergency' }).species)
      .toEqual(expect.arrayContaining(['dog', 'cat']));
  });

  it('picks up exotics when stated', () => {
    expect(classify({ name: 'Exotic Pet ER', sourceType: 'emergency' }).species)
      .toContain('exotic');
  });
});
