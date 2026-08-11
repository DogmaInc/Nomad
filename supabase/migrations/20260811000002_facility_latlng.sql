-- Generated lat/lng on facilities.
--
-- `location` is the source of truth (geography, GiST-indexed, used by ST_DWithin), but
-- PostgREST serialises geography as EWKB hex — "0101000020E6100000…" — which is useless to
-- a map client and to the dedupe scan without a WKB parser.
--
-- Generated STORED columns keep one source of truth while giving both a plain number. They
-- cannot drift from `location` because Postgres recomputes them on every write.

alter table facilities
  add column lat double precision generated always as (st_y(location::geometry)) stored,
  add column lng double precision generated always as (st_x(location::geometry)) stored;

comment on column facilities.lat is 'Derived from location. Read-only — write to location instead.';
comment on column facilities.lng is 'Derived from location. Read-only — write to location instead.';
