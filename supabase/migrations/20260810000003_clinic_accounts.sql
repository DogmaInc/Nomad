-- Nomad Phase 1 — clinic accounts (CLAUDE.md §5, §11)
-- Supabase Auth; shared seam with Phase 2. Clinic accounts only in Phase 1 — no owner accounts. (§13)

create table clinic_members (
  user_id     uuid references auth.users(id) on delete cascade,
  facility_id uuid references facilities(id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner','staff')),
  created_at  timestamptz not null default now(),
  primary key (user_id, facility_id)
);

create table claim_requests (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  user_id     uuid not null references auth.users(id),
  method      text not null check (method in ('phone_callback','email_domain','document')),
  evidence    jsonb,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

create index on claim_requests (facility_id, created_at desc);
create index on claim_requests (user_id);
