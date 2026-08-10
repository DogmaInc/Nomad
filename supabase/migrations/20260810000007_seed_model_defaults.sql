-- Nomad Phase 1 — v0 model parameter defaults (CLAUDE.md §6.2)
--
-- "Structure is the contract, numbers are knobs." These are directional starting points.
-- Rod calibrates them on /admin/model before the M1 gate. Every insert is
-- `on conflict do nothing` so re-applying this migration never clobbers tuned values.

-- ───────── base waits (§6.2) ─────────
-- NOTE: 'specialty' deliberately has NO row. It is appointment-based and excluded from
-- wait modeling and emergency ranking (§6.2, §8). estimate.ts returns null for it.
insert into base_waits (facility_type, base_minutes, min_minutes, max_minutes) values
  ('er',           85, 20, 360),
  ('er_specialty', 95, 20, 360),
  ('urgent_care',  40, 10, 180)
on conflict (facility_type) do nothing;

-- ───────── hour-of-day curves, facility-LOCAL time (§6.2) ─────────
-- er / er_specialty share the emergency curve:
--   00-02 1.35 · 02-05 1.25 · 05-07 1.10 · 07-09 1.05 · 09-12 0.60 (the fast window)
--   12-15 0.85 · 15-17 1.05 · 17-20 1.45 · 20-23 1.55 (peak slam) · 23-00 1.45
insert into hod_curves (facility_type, hour, multiplier) values
  ('er', 0,1.35),('er', 1,1.35),
  ('er', 2,1.25),('er', 3,1.25),('er', 4,1.25),
  ('er', 5,1.10),('er', 6,1.10),
  ('er', 7,1.05),('er', 8,1.05),
  ('er', 9,0.60),('er',10,0.60),('er',11,0.60),
  ('er',12,0.85),('er',13,0.85),('er',14,0.85),
  ('er',15,1.05),('er',16,1.05),
  ('er',17,1.45),('er',18,1.45),('er',19,1.45),
  ('er',20,1.55),('er',21,1.55),('er',22,1.55),
  ('er',23,1.45),

  ('er_specialty', 0,1.35),('er_specialty', 1,1.35),
  ('er_specialty', 2,1.25),('er_specialty', 3,1.25),('er_specialty', 4,1.25),
  ('er_specialty', 5,1.10),('er_specialty', 6,1.10),
  ('er_specialty', 7,1.05),('er_specialty', 8,1.05),
  ('er_specialty', 9,0.60),('er_specialty',10,0.60),('er_specialty',11,0.60),
  ('er_specialty',12,0.85),('er_specialty',13,0.85),('er_specialty',14,0.85),
  ('er_specialty',15,1.05),('er_specialty',16,1.05),
  ('er_specialty',17,1.45),('er_specialty',18,1.45),('er_specialty',19,1.45),
  ('er_specialty',20,1.55),('er_specialty',21,1.55),('er_specialty',22,1.55),
  ('er_specialty',23,1.45),

  -- urgent_care: flatter than the ER curve, with an at-open bump (08) and the
  -- 5-8pm after-work surge (§6.2). Overnight values exist only so the function is
  -- total; closed hours are handled by `hours`, not by the curve.
  ('urgent_care', 0,1.00),('urgent_care', 1,1.00),('urgent_care', 2,1.00),
  ('urgent_care', 3,1.00),('urgent_care', 4,1.00),('urgent_care', 5,1.00),
  ('urgent_care', 6,1.00),('urgent_care', 7,1.05),
  ('urgent_care', 8,1.25),
  ('urgent_care', 9,1.10),
  ('urgent_care',10,0.85),('urgent_care',11,0.85),
  ('urgent_care',12,0.90),('urgent_care',13,0.90),('urgent_care',14,0.90),
  ('urgent_care',15,1.00),('urgent_care',16,1.00),
  ('urgent_care',17,1.35),('urgent_care',18,1.35),('urgent_care',19,1.35),
  ('urgent_care',20,1.15),('urgent_care',21,1.15),
  ('urgent_care',22,1.00),('urgent_care',23,1.00)
on conflict (facility_type, hour) do nothing;

-- ───────── day-class multipliers (§6.2) ─────────
insert into day_mults (day_class, multiplier) values
  ('weekday',          1.00),
  ('friday',           1.15),
  ('saturday',         1.35),
  ('sunday',           1.50),
  ('holiday',          1.70),
  ('holiday_adjacent', 1.25)
on conflict (day_class) do nothing;

-- ───────── shift handoff windows (§6.2) — intake stalls during 12-hour handoffs ─────────
insert into shift_windows (facility_type, start_hour, end_hour, multiplier) values
  ('er',            7,  9, 1.15),
  ('er',           19, 21, 1.15),
  ('er_specialty',  7,  9, 1.15),
  ('er_specialty', 19, 21, 1.15)
on conflict (facility_type, start_hour) do nothing;

-- ───────── global knobs (§6.2, §6.4, §6.5) ─────────
insert into model_params (key, value) values
  -- display bands (§6.2)
  ('band_lo',                    '0.65'::jsonb),
  ('band_hi',                    '1.45'::jsonb),
  ('band_lo_hours_unknown',      '0.55'::jsonb),
  ('band_hi_hours_unknown',      '1.60'::jsonb),

  -- density multiplier ladder: other active er/er_specialty within 40km (§6.2)
  ('density_radius_km',          '40'::jsonb),
  ('density_ladder',             '[{"max_others":0,"mult":1.30},{"max_others":1,"mult":1.15},{"max_others":3,"mult":1.00},{"max_others":6,"mult":0.92},{"max_others":null,"mult":0.85}]'::jsonb),

  -- Tier 1 clinic claim decay (§6.4)
  ('claim_full_weight_minutes',  '30'::jsonb),
  ('claim_base_ttl_minutes',     '90'::jsonb),

  -- cross-check: claim midpoint < ratio x model p50 AND model p50 >= floor -> optimistic_flag (§6.4)
  ('optimistic_ratio',           '0.4'::jsonb),
  ('optimistic_p50_floor',       '60'::jsonb),

  -- Tier 2 contradiction rule (§6.4)
  ('contradiction_window_hours', '3'::jsonb),
  ('contradiction_min_devices',  '2'::jsonb),
  ('contradiction_bucket_steps', '2'::jsonb),

  -- credibility (§6.4)
  ('credibility_penalty',        '0.10'::jsonb),
  ('credibility_floor',          '0.25'::jsonb),
  ('credibility_weekly_recovery','0.02'::jsonb),
  ('credibility_cap',            '1.0'::jsonb),

  -- anti-abuse windows (§6.5)
  ('owner_report_fusion_hours',  '4'::jsonb),
  ('rl_report_per_facility_hours','4'::jsonb),
  ('rl_reports_per_device_day',  '5'::jsonb),
  ('rl_flags_per_device_day',    '3'::jsonb),

  -- drive-time heuristic (§8)
  ('drive_winding_factor',       '1.30'::jsonb),
  ('drive_metro_kmh',            '45'::jsonb),
  ('drive_rural_kmh',            '65'::jsonb),
  ('drive_metro_density_max',    '0.95'::jsonb),
  ('rank_radius_km',             '120'::jsonb),
  ('rank_max_candidates',        '25'::jsonb),
  ('further_but_faster_min_gain_minutes', '30'::jsonb)
on conflict (key) do nothing;
