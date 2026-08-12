-- Care model: how the facility physically runs its floor.
--
-- Rod, 2026-08-12: "With VEG they have an open floor concept and usually the vet will see
-- them right away for triage, but if stable they can still wait for diagnostics,
-- treatments, diagnosis."
--
-- This matters because it splits the word "wait" in two, and the product currently shows
-- only one number:
--
--   time-to-triage   — a vet lays eyes on your pet and decides how sick it is
--   time-to-treated  — diagnostics run, results come back, treatment starts
--
-- At a traditional hospital those are close together: you wait in a lobby, then you are
-- taken back and things happen. At an open-floor hospital (VEG's model — owners stay with
-- their pet in a single open treatment area) triage is nearly immediate, which feels like
-- no wait at all, but a stable patient can still sit for hours before imaging or bloodwork.
--
-- Nomad's estimate models time-to-treated, because that is what determines when your pet
-- actually gets helped. Without saying so, an open-floor hospital looks wrong to anyone who
-- has been there — they remember being seen in five minutes. So the display has to name the
-- difference rather than the model pretending it does not exist (invariant #4).
--
-- Nullable on purpose: unknown is the honest default, and §6 must not treat absence as
-- 'traditional'.

alter table facilities
  add column care_model text
  check (care_model in ('open_floor', 'traditional'));

comment on column facilities.care_model is
  'open_floor = owners stay with the pet in one open treatment area, triage is near-immediate but stable patients still wait for diagnostics. null = unknown.';
