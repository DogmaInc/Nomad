/**
 * Opening-hours extraction from a facility's own website.
 *
 * PORTED FROM BRAVO — `hellobravo/scripts/audit/audit_hospitals.py`
 * (`extract_jsonld_hours`, `_walk_for_hours`, `extract_text_hours`, `HOURS_LINE_RE`).
 * Rod's instruction, 2026-08-11: reuse Bravo's code rather than starting from scratch. That
 * scraper already solved this against ~4,000 real veterinary sites, and its central insight
 * is worth restating: extraction is **pattern-based, not selector-based**, so it survives
 * site redesigns. Selectors would break monthly across this many independent practices.
 *
 * Two tiers, best first:
 *  1. **JSON-LD** (`openingHours` / `openingHoursSpecification`). Structured, unambiguous,
 *     and present on a surprising share of vet sites because their web vendors ship it for
 *     SEO. Walked recursively — the VeterinaryCare node is often buried inside @graph.
 *  2. **Visible text.** A day word followed by a time range, "closed", or a 24/7 marker.
 *
 * Nomad needs three things out of this, and the difference matters (§6.1, §6.3):
 *   - `hoursText`  — what to show a human
 *   - `is247`      — an explicit round-the-clock claim, never inferred from silence
 *   - `confidence` — 'seeded' when hours were actually found, 'unknown' otherwise, which
 *                    widens the displayed band rather than pretending we know
 */

const DAY_WORDS =
  '(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekdays|weekends|daily|every\\s?day|m-f|mon-fri)';
const TIME_WORD = '\\d{1,2}(:\\d{2})?\\s*(a\\.?m\\.?|p\\.?m\\.?|am|pm)';

const HOURS_LINE_RE = new RegExp(
  `${DAY_WORDS}[^\\n<>{};]{0,60}?(${TIME_WORD}\\s*(-|–|—|to)\\s*${TIME_WORD}|closed|24\\s*(hours|hrs|/7))`,
  'gi',
);

/** Explicit round-the-clock claims only. "Open late" and "extended hours" are not this. */
const OPEN_247_RE =
  /\b24\s*\/\s*7\b|\b24\s*hours?\s*(a\s*day)?\b|\b24[-\s]?hour\b|\bopen\s+24\b|\baround the clock\b/i;

export interface ExtractedHours {
  /** Human-readable, e.g. "Mon-Fri: 08:00-20:00; Sat: 09:00-17:00". */
  hoursText: string | null;
  /** True only on an explicit claim; null when the page says nothing either way. */
  is247: boolean | null;
  source: 'jsonld' | 'text' | null;
}

/** Strip scripts/styles, then tags, then collapse whitespace. */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');
}

/**
 * Recursively hunt for schema.org opening hours.
 *
 * Recursion rather than a top-level lookup because the useful node is usually nested —
 * inside `@graph`, or under a `department` / `subOrganization` for a hospital that lists
 * its ER separately from its general practice.
 */
function walkForHours(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkForHours(item);
      if (found) return found;
    }
    return null;
  }

  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  const openingHours = obj.openingHours;
  if (openingHours) {
    return Array.isArray(openingHours)
      ? openingHours.join('; ')
      : String(openingHours);
  }

  const spec = obj.openingHoursSpecification;
  if (spec) {
    const entries = Array.isArray(spec) ? spec : [spec];
    const parts: string[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const s = entry as Record<string, unknown>;
      const rawDays = s.dayOfWeek;
      // schema.org days arrive as full URLs: https://schema.org/Monday
      const days = Array.isArray(rawDays)
        ? rawDays.map((d) => String(d).split('/').pop()).join(', ')
        : String(rawDays ?? '').split('/').pop() ?? '';
      const opens = String(s.opens ?? '');
      const closes = String(s.closes ?? '');
      if (days || opens) parts.push(`${days}: ${opens}-${closes}`);
    }
    if (parts.length) return parts.join('; ');
  }

  for (const value of Object.values(obj)) {
    const found = walkForHours(value);
    if (found) return found;
  }
  return null;
}

export function extractJsonLdHours(html: string): string | null {
  const blocks = html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      return walkForHours(JSON.parse(block[1].trim())) ?? null;
    } catch {
      continue; // malformed JSON-LD is common; skip it rather than fail the page
    }
  }
  return null;
}

export function extractTextHours(text: string, cap = 10): string | null {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(HOURS_LINE_RE)) {
    const line = match[0].replace(/\s+/g, ' ').trim();
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      lines.push(line);
    }
    if (lines.length >= cap) break;
  }
  return lines.length ? lines.join('; ') : null;
}

/**
 * Decide 24/7 from the EXTRACTED HOURS ONLY — never from the whole page.
 *
 * This caused a real false positive. Royal Oak Veterinary + Urgent Care was marked 24/7
 * while its own schedule read "Mon 8AM-5PM; Tue Closed; Wed Closed", because somewhere on
 * the page it says it refers cases to a 24-hour emergency hospital. Almost every veterinary
 * site mentions "24 hour" at some point — usually about somebody else's hospital — so the
 * full page is the wrong haystack. Falsely telling someone a closed clinic is open all
 * night is among the worst errors this product can make.
 *
 * A schedule that covers every day with no gaps is the other legitimate signal: JSON-LD
 * encodes 24/7 as 00:00-23:59 or 00:00-24:00.
 */
function is247FromHours(hoursText: string): boolean {
  if (/00:00(:00)?\s*-\s*(23:59|24:00|00:00)/.test(hoursText)) return true;
  if (!OPEN_247_RE.test(hoursText)) return false;
  // "24 hours" alongside an explicit closure is a contradiction; trust the closure.
  return !/\bclosed\b/i.test(hoursText);
}

export function extractHours(html: string): ExtractedHours {
  const text = visibleText(html);

  const jsonld = extractJsonLdHours(html);
  if (jsonld) {
    return { hoursText: jsonld, is247: is247FromHours(jsonld), source: 'jsonld' };
  }

  const textHours = extractTextHours(text);
  if (textHours) {
    return { hoursText: textHours, is247: is247FromHours(textHours), source: 'text' };
  }

  // No schedule anywhere. A bare "open 24/7" line is still a claim about this facility,
  // but only when the page offers nothing else to contradict it.
  if (OPEN_247_RE.test(text)) {
    return { hoursText: '24/7', is247: true, source: 'text' };
  }

  // Silence is not "closed" and not "open" — it is unknown, and §6.1 widens the band.
  return { hoursText: null, is247: null, source: null };
}
