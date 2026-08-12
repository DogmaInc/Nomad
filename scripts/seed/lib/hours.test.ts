/**
 * Hours extraction (ported from Bravo's audit scraper — see hours.ts).
 *
 * The fixtures below are the shapes real veterinary sites actually use, including the
 * awkward ones: JSON-LD buried in @graph, 24/7 encoded as 00:00-23:59, and pages that say
 * nothing at all. The last case is the one that matters most — silence must stay `null`,
 * because §6.1 widens the displayed band on unknown hours rather than inventing a schedule.
 */

import { describe, expect, it } from 'vitest';
import { extractHours, extractJsonLdHours, extractTextHours, visibleText } from './hours';

describe('JSON-LD', () => {
  it('reads openingHoursSpecification', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'VeterinaryCare',
      name: 'Somewhere Animal Hospital',
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['https://schema.org/Monday', 'https://schema.org/Tuesday'],
          opens: '08:00',
          closes: '20:00',
        },
      ],
    })}</script>`;
    expect(extractJsonLdHours(html)).toBe('Monday, Tuesday: 08:00-20:00');
  });

  it('reads the simpler openingHours array', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'VeterinaryCare',
      openingHours: ['Mo-Fr 08:00-18:00', 'Sa 09:00-13:00'],
    })}</script>`;
    expect(extractJsonLdHours(html)).toBe('Mo-Fr 08:00-18:00; Sa 09:00-13:00');
  });

  it('finds hours nested inside @graph', () => {
    // The common shape from SEO plugins — the useful node is never at the top level.
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Site' },
        { '@type': 'VeterinaryCare', openingHours: 'Mo-Su 00:00-23:59' },
      ],
    })}</script>`;
    expect(extractJsonLdHours(html)).toBe('Mo-Su 00:00-23:59');
  });

  it('treats 00:00-23:59 as a 24/7 claim', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'VeterinaryCare',
      openingHours: 'Mo-Su 00:00-23:59',
    })}</script>`;
    expect(extractHours(html).is247).toBe(true);
  });

  it('skips malformed JSON-LD instead of throwing', () => {
    const html =
      `<script type="application/ld+json">{ not valid json </script>` +
      `<script type="application/ld+json">${JSON.stringify({ openingHours: 'Mo-Fr 09:00-17:00' })}</script>`;
    expect(extractJsonLdHours(html)).toBe('Mo-Fr 09:00-17:00');
  });
});

describe('visible text', () => {
  it('drops scripts and styles so their contents never look like hours', () => {
    const html = `<style>.a{content:"Monday 9am-5pm"}</style><p>Open Tue 8am - 6pm</p>`;
    const text = visibleText(html);
    expect(text).not.toContain('Monday');
    expect(text).toContain('Tue 8am - 6pm');
  });

  it('finds day/time lines and de-duplicates them', () => {
    const text = 'Mon-Fri 8am - 6pm Mon-Fri 8am - 6pm Saturday 9am - 1pm Sunday closed';
    const hours = extractTextHours(text);
    expect(hours).toContain('Mon-Fri 8am - 6pm');
    expect(hours).toContain('Saturday 9am - 1pm');
    expect(hours!.match(/Mon-Fri 8am - 6pm/g)).toHaveLength(1);
  });
});

describe('24/7 detection', () => {
  it.each([
    'We are open 24/7 for emergencies',
    'Our hospital is open 24 hours a day',
    'A 24-hour emergency hospital',
    'Doctors on site around the clock',
  ])('recognises %s', (copy) => {
    expect(extractHours(`<p>${copy}</p>`).is247).toBe(true);
  });

  it('does not treat "open late" or "extended hours" as 24/7', () => {
    expect(extractHours('<p>Open late! Extended evening hours.</p>').is247).not.toBe(true);
  });
});

describe('the unknown case', () => {
  it('returns null rather than guessing when a page states no hours', () => {
    const result = extractHours('<p>Compassionate care for your pet since 1997.</p>');
    expect(result.hoursText).toBeNull();
    expect(result.is247).toBeNull();
    expect(result.source).toBeNull();
  });

  it('believes a bare 24/7 claim even with no schedule', () => {
    const result = extractHours('<p>Open 24/7. Walk-ins welcome.</p>');
    expect(result.is247).toBe(true);
    expect(result.hoursText).toBe('24/7');
  });
});
