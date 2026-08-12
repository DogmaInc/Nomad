import type { FacilityPin } from '@/lib/facilities/query';

/**
 * The desktop landing (CLAUDE.md §12, docs/DESIGN-DIRECTION.md).
 *
 * Rod picked Flighty as the direction for one specific reason — "the iPhone and phone
 * communicating what the client needs, what the product is" — and set the constraint that
 * 95–100% of use is on a phone. Those two facts split this page in half:
 *
 *   On a phone, this component never renders. The URL opens straight into the product,
 *   because showing someone a picture of a phone while they are holding that phone wastes
 *   the screen, and at 2 a.m. a wasted screen is a wasted minute.
 *
 *   On a desktop, this is the whole pitch. That visitor is not in an emergency — they are
 *   a vet, a clinic, a journalist, or someone forwarding the link to a friend whose dog is
 *   sick. They need to understand what it is in four seconds.
 *
 * THE PHONE IS A LIVE IFRAME OF THE ACTUAL PRODUCT, not a mockup. Flighty shows real
 * flights with real delays; this shows the real DMV registry with wait bands computed at
 * the moment the page loaded. It cannot drift from the product because it *is* the
 * product, and a screenshot would start lying the first time we changed a row.
 */
export function DesktopHero({ facilities }: { facilities: FacilityPin[] }) {
  const open247 = facilities.filter((f) => f.is247).length;

  return (
    <section className="hidden border-b border-line-soft md:block">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-8 py-16 lg:grid-cols-[1.05fr_auto] lg:py-20">
        <div className="max-w-xl">
          <p className="provenance uppercase tracking-[0.16em] text-teal">
            Washington DC · Maryland · Virginia
          </p>

          <h1 className="mt-5 text-[clamp(2.6rem,5vw,3.9rem)] font-bold leading-[1.03] tracking-[-0.03em] text-balance">
            Know the wait before you drive.
          </h1>

          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-soft">
            Every veterinary ER and urgent care in the DMV, with an honest estimate of how
            long you would actually wait — at this hour, on this kind of night. Sometimes
            the hospital twenty minutes further away is an hour faster.
          </p>

          {/* The counts are the credibility. Mono, because they are measurements. */}
          <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-5">
            {[
              [facilities.length, 'hospitals'],
              [open247, 'open 24/7'],
              ['0', 'need to sign up'],
            ].map(([value, label]) => (
              <div key={label as string}>
                <dt className="measure text-[30px] font-semibold leading-none tracking-tight text-ink">
                  {value}
                </dt>
                <dd className="provenance mt-1.5">{label}</dd>
              </div>
            ))}
          </dl>

          {/* Sans, not mono. The type rule is that measurements are mono and claims are
              sans — this is a claim, and setting it in mono would blur the one distinction
              the whole system rests on. */}
          <p className="mt-9 max-w-md text-[14px] leading-relaxed text-ink-faint">
            Every figure is modeled from how busy that kind of hospital typically is, never
            reported live — so each one carries its source and always says: call to confirm.
          </p>
        </div>

        {/* ── the phone: the real product, running ── */}
        <div className="justify-self-center">
          <div className="relative w-[330px] rounded-[2.4rem] border border-line bg-surface p-2.5 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]">
            <div className="h-[660px] overflow-hidden rounded-[1.9rem] bg-ground">
              <iframe
                src="/?view=embed"
                title="Nomad running on a phone — live DMV wait estimates"
                className="h-full w-full border-0"
                loading="lazy"
                scrolling="no"
              />
            </div>
          </div>
          <p className="provenance mt-3 text-center">
            live · not a mockup
          </p>
        </div>
      </div>
    </section>
  );
}
