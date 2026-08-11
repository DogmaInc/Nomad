# Verified DMV emergency facility records

One JSON array per region file. Every record is a facility a pet owner could
drive to RIGHT NOW and be seen as a walk-in emergency or urgent care.

```json
{
  "name": "Friendship Hospital for Animals",
  "address1": "4105 Brandywine St NW",
  "city": "Washington", "state": "DC", "zip": "20016",
  "phone": "202-364-5300",
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
- `urgent_care` — walk-in urgent care (not 24/7, but same-day walk-in for sick pets)

## EXCLUDE — these are the errors being corrected
- General practice / wellness clinics — **even if they say "we see emergencies
  during business hours"**. That is not an ER.
- Specialty-ONLY / referral-only: ophthalmology, dentistry, oral surgery,
  dermatology, orthopedics-only, oncology-only, cardiology-only, rehab, behavior.
- Mobile vets, house-call practices, boarding, grooming, shelters.
- Permanently closed locations.

## Rules
- Evidence is mandatory. No record without `evidenceUrl` + `evidenceQuote`.
- Never guess an address or phone. Omit the record instead.
- `is247: true` ONLY if the source explicitly says 24/7 / 24 hours / always open.
- If a hospital has several locations, one record per physical location.
