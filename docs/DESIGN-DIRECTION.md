# Nomad — design direction

Committed 2026-08-12, per CLAUDE.md §12 ("commit to a direction in writing — palette
hexes, type roles, layout concept, the signature — before coding it").

References pulled via the Refero MCP and reviewed as images, not descriptions.

---

## 1. References, and what each one is for

**Mapbox** — mapbox.com · *the ground*
A near-black void where the map imagery is the only real light in the composition.
Correct instinct for our situation: at 2 a.m. the map should be the lit thing and the
chrome should recede. **What we take:** the map as the light source. **What we reject:**
its coldness. Mapbox is selling infrastructure to developers; we are talking to someone
frightened in a car park.

**19–86** — 19-86.fr · *the record*
An architectural archive rendered as a dense table — every row a project, every column a
piece of its metadata, ruled with 1px hairlines and set in tight tabular alignment. It
reads as *printed evidence* rather than as a web page. **What we take:** the idea that
each hospital is a **record with its metadata visible** — wait, source, age, in aligned
columns. **What we reject:** the full broadsheet treatment; §12 names "broadsheet
hairlines everywhere" as an AI-default look, so the tabular discipline is applied to the
facility rows only, not to the whole page.

**August Health** — augusthealth.com · *the warning*
Soft healthcare SaaS: rounded pastel blobs, photographic portraits, a serif hero. Warm,
and competently done — and exactly the register to avoid. It is a sales page for a buyer
in an office, not a tool for someone under stress. **What we take:** nothing visual. It
usefully marks the boundary: our warmth has to come from language and colour temperature,
never from pastel geometry.

**Raise / Open Collective** — opencollective.com · *the civic note*
Community funding, navy typography, restrained and structured, trustworthy without
selling. **What we take:** the plain-spoken civic register — a public utility that happens
to be well made.

---

## 2. Palette

Extends the palette already in the app rather than inventing a second system. Grounded in
the subject: **the colour of an ER entrance at 2 a.m.** — blue-black sky, sodium light,
lit glass. Not "midnight console", which is the generic dark-mode default.

| Token | Hex | Role |
|---|---|---|
| `ground` | `#0A0F16` | blue-black night sky — the page |
| `surface` | `#141B25` | raised cards, the sheet |
| `surface-sunk` | `#0F1721` | wells, table stripes |
| `line` | `#26313F` | hairlines, borders |
| `ink` | `#E7EDF5` | primary text |
| `ink-soft` | `#A7B4C6` | secondary text |
| `ink-faint` | `#7A8799` | provenance, timestamps |
| `teal` | `#4FD1C5` | fast — the good end of the wait ramp, and the accent |
| `amber` | `#F2A03D` | slow — sodium light, the honest warm |
| `orange` | `#FB923C` | slowest |
| `red` | `#EF4444` | **critical-signs banner only** (§10.6) |

The wait ramp is `emerald → teal → amber → orange`, always paired with a text label so it
never relies on colour alone (§10.1, colourblind-safe).

**The deliberate risk:** amber as a co-equal brand colour rather than a warning colour. In
most products amber means "caution" and gets used sparingly. Here a long wait is not an
error — it is the ordinary truth of a Sunday night, and the palette should say that
without alarm. Red stays locked to the one place it belongs.

## 3. Type

Three roles. All self-hosted via `next/font` — no CDN, no silent fallback.

| Role | Face | Use |
|---|---|---|
| Display | **Söhne Breit** or fallback `Inter Tight`, 640 weight, `-0.025em` | the wait band, the one number that matters |
| Body | **Söhne** / system sans, 400–500 | prose, labels, copy |
| Data | **Söhne Mono** / `ui-monospace`, `tabular-nums` | every time, timestamp, provenance line, distance |

The rule that carries the identity: **anything measured is set in mono with tabular
numerals.** Waits, ages, distances, hours. Anything said in words is set in the sans. A
reader can tell at a glance which parts of the screen are measurements and which are
claims — which is the whole product argument, expressed typographically.

## 4. Layout

**Superseded 2026-08-12 — see CLAUDE.md §12.** Rod picked Flighty as the direction, for
the phone-as-hero showing real content, and set the constraint that 95–100% of use is on a
phone. That splits the page in two: on mobile the URL opens the product directly (no
marketing), and the Flighty treatment applies only to the desktop visitor, who is
discovering or sharing rather than in an emergency. The rest of this section still holds
for what the mobile view contains.

**The landing page is not a marketing page — it is the answer.**

§10.3 already says it: one primary action, then the ranked list. So the page opens with
the critical-signs banner pinned (§10.4, never dismissible), then a single large action —
*Find fastest care near me* — and immediately below it, the ranked list of hospitals as
records. No feature grid, no testimonial row, no hero illustration. Someone arriving here
at 2 a.m. should be able to act inside one screen height without scrolling or reading.

Each row in the ranked list is a **record**, taking 19–86's discipline:

```
  total until seen      hospital                     drive     wait          source
  ──────────────────────────────────────────────────────────────────────────────────
  1¼–2½ hr              Friendship Hospital           14 min    1–2 hr        modeled · now
  2–3½ hr               VEG Georgetown                 9 min    1½–3 hr       modeled · now
```

Below the fold, and only below it: what the estimates mean, and how they are calculated.

## 5. The signature

**Provenance as a visible material.**

§12 suggests it and it is the right call, because it is the product's actual thesis. Every
number on the page carries its source and its age, in mono, in `ink-faint`, immediately
beneath it — never hidden behind a tooltip:

> **1¼–2½ hr**
> modeled · no live data · call to confirm

And the part that makes it a *design* idea rather than a caption: **freshness is
rendered.** A clinic's own report arrives at full contrast with a live timestamp, and
visibly fades toward `ink-faint` as it decays, until it hands back to the modeled estimate
and says so. Staleness is shown, never silently served (§10.1).

If Nomad is remembered for one visual idea, it should be that the map is honest about what
it knows, and you can see it being honest.

---

## Not doing

- Cream + serif + terracotta; near-black + acid green; purple-blue gradient hero.
- Rounded pastel blobs and stock portraits (the August Health register).
- Any hero image of a sad dog. The user already has one.
- Feature grids, logo walls, testimonials. Nobody in an emergency reads them.
