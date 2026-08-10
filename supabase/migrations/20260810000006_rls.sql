-- Nomad Phase 1 — Row Level Security (CLAUDE.md §5)
--
-- Principle: the public map is readable by anyone with zero participation (invariant #2),
-- clinics can only ever write status for a facility they are a member of, and the
-- abuse-sensitive tables (owner_reports, facility_flags) have NO direct client access at all —
-- inserts go through API routes holding the service role, where the §6.5 rate limits live.
--
-- The service role bypasses RLS entirely; absence of a policy is therefore the deny.

-- ───────── admin identity ─────────
-- Minimal admin model: membership in this table. Populated manually / by another admin.
-- (Engineering call, not specified in CLAUDE.md — see §9 "role-gated server components".)
create table admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins a where a.user_id = auth.uid());
$$;

create policy admins_self_select on admins
  for select to authenticated
  using (user_id = auth.uid());

-- ───────── public registry: readable by everyone, writable by no one ─────────
alter table facilities             enable row level security;
alter table facility_capabilities  enable row level security;
alter table facility_species       enable row level security;

create policy facilities_public_read on facilities
  for select to anon, authenticated using (true);

create policy facility_capabilities_public_read on facility_capabilities
  for select to anon, authenticated using (true);

create policy facility_species_public_read on facility_species
  for select to anon, authenticated using (true);

-- ───────── model parameter tables: public read (the model is inspectable by design) ─────────
alter table base_waits    enable row level security;
alter table hod_curves    enable row level security;
alter table day_mults     enable row level security;
alter table shift_windows enable row level security;
alter table holidays      enable row level security;
alter table model_params  enable row level security;

create policy base_waits_public_read    on base_waits    for select to anon, authenticated using (true);
create policy hod_curves_public_read    on hod_curves    for select to anon, authenticated using (true);
create policy day_mults_public_read     on day_mults     for select to anon, authenticated using (true);
create policy shift_windows_public_read on shift_windows for select to anon, authenticated using (true);
create policy holidays_public_read      on holidays      for select to anon, authenticated using (true);
create policy model_params_public_read  on model_params  for select to anon, authenticated using (true);

-- ───────── clinic status reports: public read, member-only insert ─────────
alter table status_reports enable row level security;

create policy status_reports_public_read on status_reports
  for select to anon, authenticated using (true);

create policy status_reports_member_insert on status_reports
  for insert to authenticated
  with check (
    exists (
      select 1 from clinic_members m
      where m.user_id = auth.uid()
        and m.facility_id = status_reports.facility_id
    )
  );

-- ───────── clinic membership: users see only their own ─────────
alter table clinic_members enable row level security;

create policy clinic_members_self_read on clinic_members
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- ───────── claim requests: users see their own, admins see all ─────────
alter table claim_requests enable row level security;

create policy claim_requests_self_read on claim_requests
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

create policy claim_requests_self_insert on claim_requests
  for insert to authenticated
  with check (user_id = auth.uid());

-- ───────── abuse-sensitive tables: RLS on, ZERO policies = no client access ─────────
-- Reads happen only through the aggregate views below. Writes only via service role.
alter table owner_reports  enable row level security;
alter table facility_flags enable row level security;

-- ───────── billing stub: no client access at all (§13) ─────────
alter table billing_customers enable row level security;

-- ───────── aggregate view: owner reports WITHOUT device_hash ─────────
-- security_invoker = off (default for views) would run as owner; we instead expose only
-- non-identifying aggregates, and grant select to anon explicitly.
create view owner_report_aggregates
with (security_invoker = off)
as
  select
    facility_id,
    kind,
    reported_wait_bucket,
    count(*)                        as report_count,
    count(distinct device_hash)     as distinct_devices,
    max(created_at)                 as latest_at
  from owner_reports
  where status = 'active'
    and created_at > now() - interval '4 hours'   -- reports expire from fusion after 4h (§6.5)
  group by facility_id, kind, reported_wait_bucket;

grant select on owner_report_aggregates to anon, authenticated;
