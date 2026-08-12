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

## Rule 2 — urgent care means the business model, not a service line

Include a facility as `urgent_care` when **walk-in urgent care is what the business is
for**. That includes hospitals that are deliberately BOTH general practice AND urgent
care — Bond Vet, Heart + Paw, Small Door, Modern Animal, PetMedic, UrgentVet, Vetco Total
Care and similar. For those, same-day walk-in sick care is the core proposition, not a
favour they do for existing clients. **Include them.**

Exclude a general practice that merely *lists* urgent care among its services. The test:

| Include | Exclude |
|---|---|
| Walk-ins are the model — advertised on the homepage | "We accommodate urgent cases during business hours" |
| Open to anyone, not just existing clients | Current clients only |
| Extended evenings/weekends built for urgent care | Ordinary Mon–Fri 9–5 practice hours |
| No appointment needed (or same-day guaranteed) | Appointment required |

Both of these fail the test even though they say "urgent care":
- *Meadow Branch Animal Hospital* — "veterinary urgent care (appointment required)",
  closed weekends.
- *Caring Hands* — "During our regular hours, we do our best to accommodate urgent cases."

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
