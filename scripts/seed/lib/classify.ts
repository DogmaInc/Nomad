/**
 * Facility classification (CLAUDE.md §7).
 *
 * The rule that governs this file: **precision over recall for the emergency layers.**
 * Showing a daytime GP as a 2 a.m. ER is the failure mode that hurts someone, so a row
 * only earns `er` / `er_specialty` / `urgent_care` on a strong signal. Everything
 * ambiguous lands as `needs_review`, which keeps it on the map (invariant #3) but out of
 * emergency ranking until a human classifies it.
 *
 * "GP with an emergency mention" is deliberately NOT strong enough. Half the general
 * practices in the country say "we see emergencies during business hours" — that is a
 * different promise from an ER, and at 2 a.m. the difference is the whole product.
 */

export type FacilityType = 'er' | 'er_specialty' | 'specialty' | 'urgent_care';
export type FacilityStatus = 'active' | 'needs_review' | 'closed_permanently' | 'duplicate';

export type Capability =
  | 'overnight_care' | 'exotics' | 'avian' | 'oxygen_support' | 'isolation'
  | 'er_surgery' | 'endoscopy' | 'ventilator' | 'blood_products' | 'ct' | 'mri' | 'dialysis';

export type Species =
  | 'dog' | 'cat' | 'exotic' | 'avian' | 'reptile' | 'small_mammal' | 'equine' | 'farm';

export interface ClassificationInput {
  name: string;
  /** Source's own type string, if it has one (e.g. Bravo `hospital_type`). */
  sourceType?: string | null;
  /** Free-form tags/services from the source. */
  tags?: string[];
  /** Any longer prose the source gave us (services blurb, scraped page text). */
  text?: string | null;
  /** True only when the source states round-the-clock operation explicitly. */
  is247?: boolean | null;
  /**
   * A structured, machine-set emergency marker from the source — OSM's `emergency=yes`,
   * a board licence category. NOT inferred from prose: this is the source asserting it.
   */
  structuredEmergency?: boolean | null;
}

export interface Classification {
  facilityType: FacilityType;
  status: FacilityStatus;
  /** Why this row was classified as it was — written to seed_sources for auditability. */
  reason: string;
  capabilities: Capability[];
  species: Species[];
}

const RE = {
  emergency: /\bemergenc(y|ies)\b|\bER\b|\be-?vet\b|\bcritical care\b/i,
  urgent: /\burgent care\b|\bwalk[- ]?in (clinic|care)\b/i,
  // "Specialists" is at least as common as "Specialty" in hospital names — matching only
  // the latter typed VCA SouthPaws Veterinary *Specialists* & Emergency Center as plain er.
  // Note the two stems genuinely differ: specialTy vs specialIst. One pattern cannot cover
  // both by extending the suffix group, which is how the first attempt at this failed.
  specialty: /\bspecialt(y|ies)\b|\bspecialists?\b/i,
  specialtyService: /\breferral\b|\binternal medicine\b|\boncology\b|\bcardiolog|\bneurolog|\bsurger|\bdentistry\b|\bophthalmolog|\bdermatolog|\borthopedic/i,
  /** Strong 24/7 phrasing only — "open late" and "extended hours" do not count. */
  open247: /\b24[\s/-]?7\b|\b24[\s-]?hour/i,
  gpOnly: /\bgeneral practice\b|\bwellness\b|\bvaccine clinic\b|\bgrooming\b|\bboarding\b/i,
};

const CAPABILITY_PATTERNS: Array<[Capability, RegExp]> = [
  ['overnight_care', /\bovernight\b|\b24[\s/-]?7\b|\b24[\s-]?hour\b|\binpatient\b/i],
  ['exotics',        /\bexotic/i],
  ['avian',          /\bavian\b|\bbird/i],
  ['oxygen_support', /\boxygen\b/i],
  ['isolation',      /\bisolation\b|\bquarantine\b/i],
  ['er_surgery',     /\bemergency surger|\bsoft tissue surger|\bER surger/i],
  ['endoscopy',      /\bendoscop/i],
  ['ventilator',     /\bventilat/i],
  ['blood_products', /\bblood (bank|product|transfus)/i],
  ['ct',             /\bCT\b|\bcomputed tomograph/i],
  ['mri',            /\bMRI\b|\bmagnetic resonance/i],
  ['dialysis',       /\bdialysis\b|\bhemodialysis\b/i],
];

const SPECIES_PATTERNS: Array<[Species, RegExp]> = [
  ['exotic',       /\bexotic/i],
  ['avian',        /\bavian\b|\bbird/i],
  ['reptile',      /\breptile|\bherp\b/i],
  ['small_mammal', /\bsmall mammal|\brabbit|\bferret|\bguinea pig/i],
  ['equine',       /\bequine\b|\bhorse/i],
  ['farm',         /\bfarm\b|\blivestock\b|\bbovine\b|\blarge animal\b/i],
];

/** Normalised haystack: name + source type + tags + prose, lowercased. */
function haystack(input: ClassificationInput): string {
  return [input.name, input.sourceType ?? '', (input.tags ?? []).join(' '), input.text ?? '']
    .join(' ')
    .toLowerCase();
}

export function classify(input: ClassificationInput): Classification {
  const hay = haystack(input);
  const sourceType = (input.sourceType ?? '').toLowerCase().trim();

  // Structured vs prose 24/7 are NOT the same claim and must not be trusted equally.
  // A source that sets `opening_hours=24/7` is asserting a fact in a machine field. A
  // sentence in a description that happens to contain "open 24/7 daily" is marketing copy
  // that may describe a general practice. Collapsing the two put Aldie Veterinary Hospital
  // — a GP — on the map as an ER.
  const is247Structured = input.is247 === true;
  const mentions247 = RE.open247.test(hay);
  const is247 = is247Structured || mentions247;
  const saysEmergency = RE.emergency.test(hay);
  const saysUrgent = RE.urgent.test(hay);
  const saysSpecialty = RE.specialty.test(hay) || RE.specialtyService.test(hay);

  // ── Strong signal 1: the source itself categorised the facility. ────────────
  // A source that maintains a type column has already done the classification work;
  // trusting it beats re-deriving from a name string.
  const sourceSaysEmergency = /^(emergency|er|emergency_specialty|emergency_critical_care)/.test(sourceType);
  const sourceSaysUrgent = /^(urgent_care|urgent care)/.test(sourceType);
  const sourceSaysSpecialty = /^(specialty|specialty_)/.test(sourceType);

  if (sourceSaysEmergency) {
    const type: FacilityType = saysSpecialty ? 'er_specialty' : 'er';
    return finish(type, 'active', `source type "${input.sourceType}"${saysSpecialty ? ' + specialty signal' : ''}`, hay, is247);
  }
  if (sourceSaysUrgent) {
    return finish('urgent_care', 'active', `source type "${input.sourceType}"`, hay, is247);
  }
  if (sourceSaysSpecialty) {
    // Appointment-based referral practice. Seeded and shown, never ranked (§8).
    return finish('specialty', 'active', `source type "${input.sourceType}"`, hay, is247);
  }

  // ── Strong signal 2: the source structurally asserts emergency service. ─────
  // OSM `emergency=yes` is set deliberately by a mapper, not inferred from a name. It
  // catches the after-hours ER — open 3 p.m. to 11 p.m., closed by day — which is a very
  // common model and which a 24/7 test would wrongly reject. (Example found in the DMV:
  // EMMAVet, emergency=yes, Mo-Fr 15:00-23:00.)
  if (input.structuredEmergency === true) {
    const type: FacilityType = saysSpecialty ? 'er_specialty' : 'er';
    return finish(type, 'active', 'source asserts emergency service (structured tag)', hay, is247);
  }

  // ── Strong signal 3: explicit emergency naming AND round-the-clock operation. ──
  if (saysEmergency && is247) {
    const type: FacilityType = saysSpecialty ? 'er_specialty' : 'er';
    return finish(type, 'active', 'emergency naming + 24/7 hours', hay, is247);
  }

  // ── Weak signal: round-the-clock operation with no emergency wording anywhere. ──
  // §7 lists "24/7 hours" as a strong signal, and often it is — Blue Ridge Veterinary
  // Associates and both Virginia Veterinary Centers are real 24/7 ERs whose names never
  // say "emergency". But the inverse also exists: a general practice that keeps 24-hour
  // boarding staff, or a source whose hours are simply wrong.
  //
  // So this earns a place in the registry but NOT on the map. `needs_review` keeps the row
  // and its provenance for /admin/review while withholding the claim "you can be seen here
  // at 2 a.m." until a human or a verified record confirms it. Prose-only 24/7 is weaker
  // still and lands in the same place.
  if (is247) {
    const type: FacilityType = saysSpecialty ? 'er_specialty' : 'er';
    const basis = is247Structured
      ? '24/7 hours from a structured field, but no emergency wording — needs confirmation'
      : '24/7 mentioned only in prose, no emergency wording — weakest possible basis';
    return finish(type, 'needs_review', basis, hay, is247);
  }

  // ── Strong signal 5: unambiguous urgent-care naming. ───────────────────────
  if (saysUrgent && !RE.gpOnly.test(hay)) {
    return finish('urgent_care', 'active', 'explicit urgent-care naming', hay, is247);
  }

  // ── Everything else is ambiguous. On the map, out of emergency ranking. ────
  // The commonest case here is a GP that mentions emergencies — see the file header.
  const type: FacilityType = saysSpecialty ? 'specialty' : 'er';
  const why = saysEmergency
    ? 'mentions emergency but no 24/7 confirmation — GP-with-emergency-hours is not an ER'
    : 'no strong emergency/urgent/specialty signal';
  return finish(type, 'needs_review', why, hay, is247);
}

function finish(
  facilityType: FacilityType,
  status: FacilityStatus,
  reason: string,
  hay: string,
  is247: boolean,
): Classification {
  const capabilities = CAPABILITY_PATTERNS.filter(([, re]) => re.test(hay)).map(([c]) => c);

  // A 24/7 ER keeps patients overnight by definition, even if no source says the word.
  if (is247 && (facilityType === 'er' || facilityType === 'er_specialty')) {
    if (!capabilities.includes('overnight_care')) capabilities.push('overnight_care');
  }

  const species = SPECIES_PATTERNS.filter(([, re]) => re.test(hay)).map(([s]) => s);
  // Small-animal practice is the overwhelming default; assume dog+cat unless the row
  // reads as exclusively large-animal.
  const largeAnimalOnly =
    (species.includes('equine') || species.includes('farm')) &&
    /\b(equine only|horses only|large animal only)\b/i.test(hay);
  if (!largeAnimalOnly) {
    if (!species.includes('dog')) species.unshift('cat');
    if (!species.includes('dog')) species.unshift('dog');
  }

  return { facilityType, status, reason, capabilities, species: [...new Set(species)] };
}
