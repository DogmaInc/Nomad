-- Nomad Phase 1 — wait signals (CLAUDE.md §5, §6.4)

-- ───────── Tier 1: clinic self-reports (the WEAKEST signal — §6.4, invariant #5) ─────────
create table status_reports (
  id             uuid primary key default gen_random_uuid(),
  facility_id    uuid not null references facilities(id),
  reporter_id    uuid not null references auth.users(id),
  wait_bucket    wait_bucket not null,
  capacity_state capacity_state not null,
  call_first     boolean not null default false,
  check_result   claim_check not null default 'plausible',
  superseded     boolean not null default false,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null            -- created_at + effective TTL (§6.4)
);

create index on status_reports (facility_id, created_at desc);
-- NO free-text field. Structure or nothing. (§13)

-- ───────── Tier 2: owner reports (contradiction/audit only, anonymous — §6.4) ─────────
create table owner_reports (
  id                   uuid primary key default gen_random_uuid(),
  facility_id          uuid not null references facilities(id),
  kind                 text not null check (kind in ('still_waiting','total_wait','left_for_faster')),
  reported_wait_bucket wait_bucket,
  device_hash          text not null,          -- salted hash; rate limiting only, never displayed
  status               text not null default 'active' check (status in ('active','flagged','removed')),
  created_at           timestamptz not null default now()
);

create index on owner_reports (facility_id, created_at desc);
create index on owner_reports (device_hash, created_at desc);
-- No accounts, no location stored, no free text. Exposed to clients only through aggregates.

-- ───────── crowd corrections to the registry (§5) ─────────
create table facility_flags (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  kind        text not null check (kind in ('permanently_closed','wrong_info','not_emergency','duplicate')),
  note        varchar(140),
  device_hash text not null,
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now()
);

create index on facility_flags (facility_id, created_at desc);
create index on facility_flags (device_hash, created_at desc);
create index on facility_flags (status) where status = 'open';
