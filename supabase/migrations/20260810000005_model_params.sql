-- Nomad Phase 1 — predictive model parameters (CLAUDE.md §5, §6)
-- Every number the model uses lives here, admin-tunable. Structure is the contract; numbers are knobs.

create table base_waits (
  facility_type facility_type primary key,
  base_minutes  int not null,
  min_minutes   int not null,
  max_minutes   int not null
);

create table hod_curves (             -- hour-of-day multipliers, facility-local time
  facility_type facility_type not null,
  hour          smallint not null check (hour between 0 and 23),
  multiplier    numeric not null,
  primary key (facility_type, hour)
);

create table day_mults (
  day_class  text primary key check (day_class in
             ('weekday','friday','saturday','sunday','holiday','holiday_adjacent')),
  multiplier numeric not null
);

create table shift_windows (          -- intake stalls during handoffs
  facility_type facility_type not null,
  start_hour    smallint not null,
  end_hour      smallint not null,    -- exclusive
  multiplier    numeric not null,
  primary key (facility_type, start_hour)
);

create table holidays (
  day        date primary key,
  name       text not null,
  class      text not null check (class in ('major','minor'))
);

create table model_params (           -- global knobs: TTLs, thresholds, band ratios
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger model_params_set_updated_at
  before update on model_params
  for each row execute function set_updated_at();

-- ───────── billing stub (seam only — NO billing logic in Phase 1, §13) ─────────
create table billing_customers (
  facility_id        uuid primary key references facilities(id),
  stripe_customer_id text,
  plan               text not null default 'free'
);
