/**
 * Normalisation shared by every importer (CLAUDE.md §7, "normalize" stage).
 *
 * Every source spells things differently — Bravo has "(907) 488-2906", a scraped
 * page will have "907.488.2906", a board roster "9074882906". Normalising here means
 * the dedupe stage compares like with like, and it means one bug gets fixed once.
 */

/** US phone → E.164 (+1XXXXXXXXXX). Returns null when it isn't a usable US number. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // 11 digits starting with 1 is already country-coded; 10 is bare US.
  const national =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  // NANP: area code and exchange both start 2-9. Filters placeholders like 000-000-0000.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

const ALWAYS_UPPER = new Set([
  'er','ii','iii','iv','dvm','vca','veg','ct','mri','icu','us','usa','nw','ne','sw','se','dc',
]);
const ALWAYS_LOWER = new Set(['of','and','at','the','for','on','in','a','an','&']);

/**
 * Title-case a name without destroying intentional casing.
 *
 * Sources arrive in three states: ALL CAPS ("PETDOCKS VETERINARY HOSPITAL"),
 * all lower, or already correct ("BluePearl", "MedVet"). Re-casing a name that is
 * already mixed-case would turn "BluePearl" into "Bluepearl", so we leave those alone.
 */
export function normalizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return name;

  const hasLower = /[a-z]/.test(name);
  const hasUpper = /[A-Z]/.test(name);
  if (hasLower && hasUpper) return name; // already deliberately cased — don't touch

  return name
    .split(' ')
    .map((word, i) => {
      const bare = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (ALWAYS_UPPER.has(bare)) return word.toUpperCase();
      if (i > 0 && ALWAYS_LOWER.has(bare)) return word.toLowerCase();
      // Handle hyphenates and possessives: "wellesley-natick" → "Wellesley-Natick"
      return word.replace(
        /[a-zA-Z]+/g,
        (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
      );
    })
    .join(' ');
}

/** Collapse whitespace and strip a trailing comma; null for empty. */
export function normalizeText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const out = raw.trim().replace(/\s+/g, ' ').replace(/,\s*$/, '');
  return out.length ? out : null;
}

/** 5-digit ZIP. Bravo has some 4-digit ZIPs where a leading zero was lost to a numeric cast. */
export function normalizeZip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9) return digits.slice(0, 5); // ZIP+4 → ZIP
  if (digits.length === 5) return digits;
  if (digits.length === 4) return `0${digits}`; // "1830" → "01830"
  return null;
}

export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** Website → canonical origin+path, https where the source was sloppy. Null if unparseable. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!url.hostname.includes('.')) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Lat/lng sanity — rejects (0,0) and anything outside the US bounding box incl. AK/HI. */
export function validCoords(lat: unknown, lng: unknown): [number, number] | null {
  const la = typeof lat === 'string' ? Number(lat) : lat;
  const ln = typeof lng === 'string' ? Number(lng) : lng;
  if (typeof la !== 'number' || typeof ln !== 'number') return null;
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  if (la < 17 || la > 72) return null;
  if (ln < -180 || ln > -64) return null;
  return [la, ln];
}
