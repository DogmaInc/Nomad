-- Nomad Phase 1 — extensions & enums (CLAUDE.md §5)

create extension if not exists postgis;
create extension if not exists pg_trgm;

create type facility_type as enum ('er','er_specialty','specialty','urgent_care');
create type facility_status as enum ('active','needs_review','closed_permanently','duplicate');
create type wait_bucket as enum ('none','under_30','min_30_60','hr_1_2','hr_2_4','hr_4_plus');
create type capacity_state as enum ('open','at_capacity','on_divert','closed_temporarily');

create type capability as enum (
  'overnight_care','exotics','avian','oxygen_support','isolation',
  'er_surgery','endoscopy','ventilator','blood_products','ct','mri','dialysis'
);

create type species as enum ('dog','cat','exotic','avian','reptile','small_mammal','equine','farm');

-- 'passive_dwell' and 'nomad_arrivals' are RESERVED for future tiers. Do not implement. (§13)
create type signal_tier as enum ('model','clinic_claim','owner_report','passive_dwell','nomad_arrivals');

create type claim_check as enum ('plausible','optimistic_flag','contradicted');
