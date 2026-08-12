-- Client-asserted proximity on an owner report.
--
-- Rod, 2026-08-12: weight a report higher when it comes from someone at or near the
-- hospital — "but make the reporting anon always from the client side."
--
-- That instruction is what makes this safe to build now. §13 forbids location tracking and
-- defers arrival tracking to Phase 2, and §5 gives owner_reports no location column on
-- purpose. The client-side split honours all of it: the browser compares ITS OWN position
-- to the facility's published coordinates locally and sends one boolean. No latitude, no
-- longitude, no trail — nothing that could place a person anywhere, ever, in this table.
--
-- ┌ WHAT THIS FLAG IS AND IS NOT ────────────────────────────────────────────────┐
-- │ It is CLIENT-ASSERTED and therefore trivially forgeable. Anyone can POST      │
-- │ near_facility: true from anywhere. It is a convenience signal, NOT proof of   │
-- │ presence, and it must never be treated as verification.                       │
-- │                                                                               │
-- │ That matters most for the exact attack it was raised to defend against — a    │
-- │ hospital owner or manager reporting from inside their own building. They can  │
-- │ forge this flag as easily as anyone. So presence cannot be the defence.       │
-- │                                                                               │
-- │ The real defences do not depend on location at all:                           │
-- │   1. Reports are COUNTED, never averaged. Contradiction tallies reports that   │
-- │      are ≥2 buckets worse than a clinic's claim; a reassuring report is not a  │
-- │      vote against them, so it cannot dilute genuine complaints.                │
-- │   2. Presence only ever adds weight to a report that LENGTHENS the picture.    │
-- │      Staff want to look fast; presence buys them nothing in that direction.    │
-- │   3. Repeat presence marks a device as staff. A client visits an ER once; a    │
-- │      device reporting from the same hospital three times in 90 days works      │
-- │      there. That is a frequency signal on the hash we already store, and it    │
-- │      needs no geofence.                                                        │
-- │                                                                               │
-- │ Verified presence — the kind that cannot be forged — is Phase 2's              │
-- │ `nomad_arrivals` tier, where consent is designed in rather than bolted on.     │
-- └───────────────────────────────────────────────────────────────────────────────┘
--
-- Nullable: null means the browser could not or would not say, which is different from
-- "not nearby" and must not be read as either.

alter table owner_reports
  add column near_facility boolean;

comment on column owner_reports.near_facility is
  'Client-asserted proximity at report time. Forgeable — a weak signal, never proof of presence. No coordinates are stored or transmitted.';
