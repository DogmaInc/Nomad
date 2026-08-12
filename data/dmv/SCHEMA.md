# Verified DMV emergency facility records

One JSON array per region file. Every record is a facility a pet owner could
drive to and be seen as a walk-in emergency or urgent care.

```json
{
  "name": "Friendship Hospital for Animals",
  "address1": "5025 Wisconsin Ave NW",
  "city": "Washington", "state": "DC", "zip": "20016",
  "phone": "202-363-7300",
  "website": "https://friendshiphospital.com",
  "type": "er | er_specialty | urgent_care",
  "is247": true,
  "hoursText": "verbatim hours as published",
  "evidenceUrl": "https://the-page-that-proves-it",
  "evidenceQuote": "verbatim sentence proving emergency/urgent walk-in service",
  "capabilities": ["overnight_care","ct","mri","er_surgery","blood_products","exotics"],
  "confidence": "high | medium"
}
```

## INCLUDE only

- `er` — walk-in emergency hospital
- `er_specialty` — emergency PLUS specialty referral under one roof
- `urgent_care` — see the urgent-care test below

---

## Rule 1 — an ER is an ER regardless of its current hours

**If a facility is an emergency hospital, include it as `er` / `er_specialty`. Never
downgrade or omit one because its published hours currently look reduced.**

Hospital policy changes constantly — an ER cuts weekend coverage for a staffing gap, then
restores it — and leadership is slow to update the website. Published hours are a snapshot
of what someone last got round to editing, not a statement about what kind of facility it
is. A hospital that ran 24/7 last month and posts weekday-only hours today is still the
emergency hospital in that town, and it is where a pet owner needs to be told to call.

So:
- Reduced or partial hours → still `er`. Record the hours in `hoursText`, set
  `is247: false`, and move on.
- Weekend-only or overnight-only emergency coverage → still `er`.
- Only exclude an ER when it has **permanently closed** or **stopped offering emergency
  service altogether** — and that needs its own evidence, not an inference from a rota.

The display layer carries the caveat, not the registry: hours are shown with "call to
confirm" because they may be stale in either direction.

## Rule 2 — dedicated facilities only. No GP/urgent-care hybrids.

**Superseded 2026-08-12.** An earlier version of this rule admitted hospitals that are both
general practice AND urgent care. That was wrong and is reversed: Bond Vet, Small Door,
Livewell, PetWellClinic, CityVet and Heart + Paw are all now excluded.

The reason is a modelling constraint, not a preference. §6 estimates a wait for a facility
**type**. A primary-care clinic that also takes walk-ins has completely different queue
dynamics from a dedicated urgent care: its day is already booked with wellness
appointments, so a walk-in sick pet waits behind a vaccination schedule. Mixing the two into
one type makes the type meaningless and every estimate for both of them worse — the system
genuinely cannot tell the difference.

**The test is the facility's PRIMARY function, not whether it accepts walk-ins:**

| Include | Exclude |
|---|---|
| Dedicated emergency hospital | General practice, however convenient |
| Dedicated emergency + specialty hospital | GP that also runs urgent-care hours |
| Dedicated walk-in urgent care clinic — urgent care IS the whole business | Membership primary care with walk-in availability |
| Specialty hospital whose urgent care runs as its own service (e.g. BluePearl Urgent Care) | Wellness/preventive walk-in clinic |

Concrete calls already made, for calibration:
- **Include:** UrgentVet, PetMedic, ACHIEVE, Ally, Furgent Care, Old Line, Loudoun Urgent
  Vet, Urgent Animal Care of Arlington, Vets Now!, BetterPet, EMMAvet, BluePearl Urgent Care.
- **Exclude:** Bond Vet, Small Door, Livewell, PetWellClinic, CityVet, Heart + Paw, Thrive
  (any location), VivaVets, Swan Harbor, Blue Ridge Veterinary Associates, Royal Oak,
  Autumn Trails, Caring Hands, District Veterinary, Nova Pets, Vetco Total Care.

Note the interaction with Rule 1: a **dedicated ER** is never excluded for reduced hours. A
**general practice** is excluded regardless of how long it stays open.

## EXCLUDE

- General practices that offer urgent care as a service line (Rule 2).
- Specialty-ONLY / referral-only: ophthalmology, dentistry, oral surgery, dermatology,
  orthopedics-only, oncology-only, cardiology-only, rehab, behaviour.
- Mobile vets, house-call practices, boarding, grooming, shelters.
- Permanently closed locations.
- **Anything whose only evidence is a directory or aggregator.** SEO networks auto-generate
  "24 Hour Emergency Vet in ⟨town⟩" pages for towns with no ER at all. Evidence must come
  from the facility's own site.

## Rules

- Evidence is mandatory. No record without `evidenceUrl` + `evidenceQuote`.
- Never guess an address or phone. Omit the record instead.
- `is247: true` ONLY if the source explicitly says 24/7 / 24 hours / always open.
- One record per physical location.
