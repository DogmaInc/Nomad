-- Regional-scarcity factor (CLAUDE.md §6.2)
--
-- density_mult is precomputed rather than derived at read time: it changes only when the
-- registry changes, and the map reads it on every pin. §6.2 rerun trigger is "after the
-- national seed", so this is a job, not a view.
--
-- The ladder: count OTHER active er/er_specialty facilities within 40 km.
--   0 others → 1.30 · 1 → 1.15 · 2–3 → 1.00 · 4–6 → 0.92 · 7+ → 0.85
-- Fewer nearby options means a fuller waiting room, so the multiplier rises as alternatives
-- disappear. Note the counted set is emergency-only — an urgent care is not an alternative
-- for the case that needs an ER — but every facility type RECEIVES a multiplier.
--
-- Written in SQL so it runs in one round trip against PostGIS indexes; a JS implementation
-- would be N+1 queries and would duplicate the distance maths the database already has.

create or replace function recompute_density_mult()
returns table (facility_id uuid, others bigint, mult numeric)
language sql
as $$
  with counts as (
    select
      f.id,
      (
        select count(*)
        from facilities g
        where g.id <> f.id
          and g.status = 'active'
          and g.facility_type in ('er', 'er_specialty')
          -- geography ST_DWithin takes metres and uses the GiST index on location
          and st_dwithin(g.location, f.location, 40000)
      ) as others
    from facilities f
    where f.status <> 'duplicate'
  ),
  ladder as (
    select
      c.id,
      c.others,
      case
        when c.others = 0 then 1.30
        when c.others = 1 then 1.15
        when c.others between 2 and 3 then 1.00
        when c.others between 4 and 6 then 0.92
        else 0.85
      end::numeric as mult
    from counts c
  )
  update facilities f
     set density_mult = l.mult
    from ladder l
   where f.id = l.id
     and f.density_mult is distinct from l.mult
  returning f.id, l.others, l.mult;
$$;

comment on function recompute_density_mult is
  'Recomputes facilities.density_mult from the §6.2 scarcity ladder. Idempotent: returns only rows it actually changed.';
