-- Nomad Phase 1 — facility registry (CLAUDE.md §5)
-- facilities.id is the universal key, shared forward with Phase 2. (§13)

create table facilities (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  aka              text[] default '{}',
  facility_type    facility_type not null,
  status           facility_status not null default 'active',
  address1         text,
  address2         text,
  city             text,
  state            char(2) not null,
  zip              text,
  location         geography(point, 4326) not null,
  tz               text not null,              -- IANA, derived from location at seed
  phone            text,
  website          text,
  is_24_7          boolean,
  hours            jsonb,                      -- {"mon":[["08:00","20:00"]],...}; null = unknown
  hours_confidence text not null default 'unknown'
                   check (hours_confidence in ('verified','seeded','unknown')),
  license_state    char(2),
  license_no       text,
  seed_sources     jsonb not null default '[]',-- [{"source":"md_board","source_id":"...","retrieved_at":"..."}]
  google_place_id  text,                       -- place ID ONLY; never persist other Places content (§7)
  density_mult     numeric not null default 1.0,  -- precomputed regional-scarcity factor (§6)
  credibility      numeric not null default 1.0,  -- claim-honesty score, floor 0.25 (§6.4)
  claimed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index on facilities using gist (location);
create index on facilities using gin (name gin_trgm_ops);
create index on facilities (state);
create index on facilities (facility_type) where status = 'active';

create table facility_capabilities (
  facility_id uuid references facilities(id) on delete cascade,
  capability  capability not null,
  source      text not null default 'seed',   -- seed | clinic | admin
  updated_at  timestamptz not null default now(),
  primary key (facility_id, capability)
);

create table facility_species (
  facility_id uuid references facilities(id) on delete cascade,
  species     species not null,
  primary key (facility_id, species)
);

-- keep updated_at honest
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger facilities_set_updated_at
  before update on facilities
  for each row execute function set_updated_at();
