-- =============================================================================
-- Supplier Statement Reconciliation SaaS — Supabase PostgreSQL schema
-- Sufficient to initialize a clean Supabase project.
-- Includes: tables, foreign keys, indexes, enums, constraints, RLS + policies,
-- triggers/functions, and append-only audit protection.
-- Monetary values use NUMERIC only (never float/real).
--
-- IDEMPOTENT: safe to paste into the Supabase SQL Editor and run multiple
-- times. Enums use guarded DO blocks, tables/indexes use IF NOT EXISTS, and
-- policies/triggers are dropped (IF EXISTS) before creation. Re-running will
-- NOT delete any existing data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums (guarded so re-runs do not fail with "already exists")
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.org_role as enum ('owner', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.mapping_source_type as enum ('statement', 'ledger');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reconciliation_status as enum ('draft', 'processing', 'review', 'completed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dataset_type as enum ('supplier_statement', 'ap_ledger');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.txn_type as enum ('invoice', 'credit', 'unknown');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_type as enum (
    'exact_match',
    'probable_match',
    'manually_matched',
    'amount_mismatch',
    'missing_in_ledger',
    'missing_on_statement',
    'duplicate_statement',
    'duplicate_ledger'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.exception_status as enum ('needs_investigation', 'resolved', 'ignored');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'founding');
exception when duplicate_object then null;
end $$;

-- NOTE: helper RLS functions live AFTER the Tables/Indexes sections because
-- language-sql functions validate referenced tables at creation time.
--
-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- profiles -------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- organizations --------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  default_currency text not null default 'USD' check (char_length(default_currency) = 3),
  timezone text not null default 'UTC',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- organization_members -------------------------------------------------------
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- organization_invites (needed so invite acceptance is verifiable) -----------
create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  role public.org_role not null default 'member' check (role = 'member'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (organization_id, email)
);

-- suppliers ------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_code text check (supplier_code is null or char_length(supplier_code) <= 64),
  name text not null check (char_length(name) between 1 and 300),
  default_currency text not null default 'USD' check (char_length(default_currency) = 3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_org_code_unique
  on public.suppliers (organization_id, supplier_code)
  where supplier_code is not null;

-- mapping_profiles -----------------------------------------------------------
create table if not exists public.mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete cascade,
  source_type public.mapping_source_type not null,
  name text not null check (char_length(name) between 1 and 200),
  mapping jsonb not null default '{}'::jsonb,
  normalization_options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reconciliations ------------------------------------------------------------
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  period_start date,
  period_end date,
  currency text not null default 'USD' check (char_length(currency) = 3),
  status public.reconciliation_status not null default 'draft',
  statement_total numeric(24, 6),
  ledger_total numeric(24, 6),
  total_difference numeric(24, 6),
  created_by uuid references auth.users (id) on delete set null,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start is null or period_end is null or period_start <= period_end)
);

-- source_datasets ------------------------------------------------------------
create table if not exists public.source_datasets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reconciliation_id uuid not null references public.reconciliations (id) on delete cascade,
  type public.dataset_type not null,
  original_filename text not null,
  row_count integer not null default 0 check (row_count >= 0),
  mapping_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (reconciliation_id, type)
);

-- source_transactions --------------------------------------------------------
create table if not exists public.source_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reconciliation_id uuid not null references public.reconciliations (id) on delete cascade,
  dataset_id uuid not null references public.source_datasets (id) on delete cascade,
  source_row_number integer not null check (source_row_number >= 1),
  raw_reference text not null,
  normalized_reference text not null,
  transaction_date date,
  amount numeric(24, 6) not null,
  currency text check (currency is null or char_length(currency) = 3),
  transaction_type public.txn_type not null default 'unknown',
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (dataset_id, source_row_number)
);

-- reconciliation_matches -----------------------------------------------------
create table if not exists public.reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reconciliation_id uuid not null references public.reconciliations (id) on delete cascade,
  statement_transaction_id uuid references public.source_transactions (id) on delete cascade,
  ledger_transaction_id uuid references public.source_transactions (id) on delete cascade,
  match_type public.match_type not null,
  confidence_score numeric(5, 4) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  reason text not null default '',
  difference_amount numeric(24, 6),
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (statement_transaction_id is not null or ledger_transaction_id is not null)
);

-- exception_resolutions ------------------------------------------------------
create table if not exists public.exception_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  match_id uuid not null unique references public.reconciliation_matches (id) on delete cascade,
  status public.exception_status not null default 'needs_investigation',
  note text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz not null default now()
);

-- audit_events (append-only from application UI) -----------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- subscriptions (provider-agnostic) ------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  status public.subscription_status not null default 'trialing',
  plan_name text not null default 'Trial',
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  cancel_at_period_end boolean not null default false,
  last_event_at timestamptz,
  past_due_since timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Older installations get these columns without recreating the table.
alter table public.subscriptions
  add column if not exists provider_subscription_id text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists last_event_at timestamptz,
  add column if not exists past_due_since timestamptz;

create table if not exists public.billing_webhook_events (
  event_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  occurred_at timestamptz not null,
  processed_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists organization_members_user_idx on public.organization_members (user_id);
create index if not exists organization_invites_email_idx on public.organization_invites (lower(email));
create index if not exists suppliers_org_idx on public.suppliers (organization_id);
create index if not exists mapping_profiles_org_supplier_idx on public.mapping_profiles (organization_id, supplier_id, source_type);
create index if not exists reconciliations_org_supplier_idx on public.reconciliations (organization_id, supplier_id, created_at desc);
create index if not exists reconciliations_org_status_idx on public.reconciliations (organization_id, status, updated_at desc);
create index if not exists reconciliations_supplier_idx on public.reconciliations (supplier_id);
create index if not exists source_datasets_recon_idx on public.source_datasets (reconciliation_id);
create index if not exists source_transactions_recon_idx on public.source_transactions (reconciliation_id);
create index if not exists source_transactions_dataset_idx on public.source_transactions (dataset_id);
create index if not exists source_transactions_norm_ref_idx on public.source_transactions (reconciliation_id, normalized_reference);
create index if not exists reconciliation_matches_recon_idx on public.reconciliation_matches (reconciliation_id, match_type);
create index if not exists reconciliation_matches_statement_idx on public.reconciliation_matches (statement_transaction_id);
create index if not exists reconciliation_matches_ledger_idx on public.reconciliation_matches (ledger_transaction_id);
create index if not exists audit_events_org_idx on public.audit_events (organization_id, created_at desc);
create unique index if not exists subscriptions_provider_subscription_unique
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;
create unique index if not exists subscriptions_paddle_customer_unique
  on public.subscriptions (provider_customer_id)
  where provider = 'paddle' and provider_customer_id is not null;
create index if not exists billing_webhook_events_org_idx
  on public.billing_webhook_events (organization_id, processed_at desc);

-- -----------------------------------------------------------------------------
-- Helper functions (security definer; used by RLS policies)
-- MUST come after Tables: language-sql bodies validate table refs at creation.
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role_of(target_org uuid)
returns public.org_role
language sql
security definer
set search_path = public
stable
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = target_org
    and m.user_id = auth.uid();
$$;

create or replace function public.is_org_owner(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.org_role_of(target_org) = 'owner';
$$;

create or replace function public.auth_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select nullif(auth.jwt() ->> 'email', '')::text;
$$;

-- -----------------------------------------------------------------------------
-- Triggers / functions
-- -----------------------------------------------------------------------------

-- Create a profile row for every new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Owner membership + default subscription when an organization is created
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;

  insert into public.subscriptions (organization_id, status, plan_name, trial_ends_at)
  values (
    new.id,
    'trialing',
    'Trial',
    now() + interval '14 days'
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
drop trigger if exists mapping_profiles_updated_at on public.mapping_profiles;
create trigger mapping_profiles_updated_at before update on public.mapping_profiles
  for each row execute function public.set_updated_at();
drop trigger if exists reconciliations_updated_at on public.reconciliations;
create trigger reconciliations_updated_at before update on public.reconciliations
  for each row execute function public.set_updated_at();
drop trigger if exists reconciliation_matches_updated_at on public.reconciliation_matches;
create trigger reconciliation_matches_updated_at before update on public.reconciliation_matches
  for each row execute function public.set_updated_at();
drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Append-only guard for audit_events (application role cannot mutate history).
-- Escape hatch: purge_organization() sets app.purge_org to the org being wiped;
-- only that org's audit rows may then be deleted, and only in that transaction.
create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE'
    and current_setting('app.purge_org', true) = old.organization_id::text then
    return old;
  end if;
  raise exception 'audit_events is append-only';
end;
$$;

drop trigger if exists audit_events_no_update on public.audit_events;
create trigger audit_events_no_update
  before update on public.audit_events
  for each row execute function public.prevent_audit_mutation();
drop trigger if exists audit_events_no_delete on public.audit_events;
create trigger audit_events_no_delete
  before delete on public.audit_events
  for each row execute function public.prevent_audit_mutation();

-- -----------------------------------------------------------------------------
-- Hardening: trigger-only functions must not be callable via PostgREST RPC.
-- (Trigger firing does not require EXECUTE, so revoking is safe. RLS helper
-- functions above intentionally stay executable: policies run as the caller
-- and need EXECUTE; they only reveal the caller's own membership/email.)
-- -----------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_organization() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.prevent_audit_mutation() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Organization wipe (server-side only, via service role).
-- Deletes every workspace row including append-only audit history. The app
-- verifies ownership before calling; EXECUTE is revoked from all client roles.
-- -----------------------------------------------------------------------------
create or replace function public.purge_organization(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.purge_org', target_org::text, true);
  delete from public.audit_events where organization_id = target_org;
  delete from public.organizations where id = target_org;
end;
$$;

revoke execute on function public.purge_organization(uuid) from public, anon, authenticated;
grant execute on function public.purge_organization(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.suppliers enable row level security;
alter table public.mapping_profiles enable row level security;
alter table public.reconciliations enable row level security;
alter table public.source_datasets enable row level security;
alter table public.source_transactions enable row level security;
alter table public.reconciliation_matches enable row level security;
alter table public.exception_resolutions enable row level security;
alter table public.audit_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_webhook_events enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = (select auth.uid()));
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organizations --------------------------------------------------------------
drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations
  for select using (public.is_org_member(id));
-- Creator must see the row during INSERT...RETURNING (membership trigger fires
-- after the row exists, so is_org_member is still false at RETURNING time).
drop policy if exists "organizations_select_own_created" on public.organizations;
create policy "organizations_select_own_created" on public.organizations
  for select using (created_by = (select auth.uid()));
drop policy if exists "organizations_insert_self" on public.organizations;
create policy "organizations_insert_self" on public.organizations
  for insert with check (created_by = (select auth.uid()));
drop policy if exists "organizations_update_owner" on public.organizations;
create policy "organizations_update_owner" on public.organizations
  for update using (public.is_org_owner(id)) with check (public.is_org_owner(id));
drop policy if exists "organizations_delete_owner" on public.organizations;
create policy "organizations_delete_owner" on public.organizations
  for delete using (public.is_org_owner(id));

-- organization_members -------------------------------------------------------
drop policy if exists "members_select_same_org" on public.organization_members;
create policy "members_select_same_org" on public.organization_members
  for select using (public.is_org_member(organization_id));
drop policy if exists "members_insert_owner" on public.organization_members;
create policy "members_insert_owner" on public.organization_members
  for insert with check (public.is_org_owner(organization_id));
drop policy if exists "members_delete_owner_or_self" on public.organization_members;
create policy "members_delete_owner_or_self" on public.organization_members
  for delete using (public.is_org_owner(organization_id) or user_id = (select auth.uid()));
drop policy if exists "members_update_owner" on public.organization_members;
create policy "members_update_owner" on public.organization_members
  for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

-- organization_invites -------------------------------------------------------
drop policy if exists "invites_select_member_or_own_email" on public.organization_invites;
create policy "invites_select_member_or_own_email" on public.organization_invites
  for select using (
    public.is_org_member(organization_id)
    or lower(email) = lower(coalesce(public.auth_email(), ''))
  );
drop policy if exists "invites_insert_owner" on public.organization_invites;
create policy "invites_insert_owner" on public.organization_invites
  for insert with check (public.is_org_owner(organization_id));
drop policy if exists "invites_delete_owner" on public.organization_invites;
create policy "invites_delete_owner" on public.organization_invites
  for delete using (public.is_org_owner(organization_id));
drop policy if exists "invites_update_member_accept" on public.organization_invites;
create policy "invites_update_member_accept" on public.organization_invites
  for update using (
    public.is_org_member(organization_id)
    or lower(email) = lower(coalesce(public.auth_email(), ''))
  )
  with check (public.is_org_member(organization_id));

-- suppliers ------------------------------------------------------------------
drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select" on public.suppliers
  for select using (public.is_org_member(organization_id));
drop policy if exists "suppliers_insert" on public.suppliers;
create policy "suppliers_insert" on public.suppliers
  for insert with check (public.is_org_member(organization_id));
drop policy if exists "suppliers_update" on public.suppliers;
create policy "suppliers_update" on public.suppliers
  for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
drop policy if exists "suppliers_delete" on public.suppliers;
create policy "suppliers_delete" on public.suppliers
  for delete using (public.is_org_member(organization_id));

-- mapping_profiles -----------------------------------------------------------
drop policy if exists "mapping_profiles_select" on public.mapping_profiles;
create policy "mapping_profiles_select" on public.mapping_profiles
  for select using (public.is_org_member(organization_id));
drop policy if exists "mapping_profiles_insert" on public.mapping_profiles;
create policy "mapping_profiles_insert" on public.mapping_profiles
  for insert with check (public.is_org_member(organization_id));
drop policy if exists "mapping_profiles_update" on public.mapping_profiles;
create policy "mapping_profiles_update" on public.mapping_profiles
  for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
drop policy if exists "mapping_profiles_delete" on public.mapping_profiles;
create policy "mapping_profiles_delete" on public.mapping_profiles
  for delete using (public.is_org_member(organization_id));

-- reconciliations ------------------------------------------------------------
drop policy if exists "reconciliations_select" on public.reconciliations;
create policy "reconciliations_select" on public.reconciliations
  for select using (public.is_org_member(organization_id));
drop policy if exists "reconciliations_insert" on public.reconciliations;
create policy "reconciliations_insert" on public.reconciliations
  for insert with check (public.is_org_member(organization_id));
drop policy if exists "reconciliations_update" on public.reconciliations;
create policy "reconciliations_update" on public.reconciliations
  for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
drop policy if exists "reconciliations_delete" on public.reconciliations;
create policy "reconciliations_delete" on public.reconciliations
  for delete using (public.is_org_member(organization_id));

-- source_datasets ------------------------------------------------------------
drop policy if exists "datasets_select" on public.source_datasets;
create policy "datasets_select" on public.source_datasets
  for select using (public.is_org_member(organization_id));
drop policy if exists "datasets_insert" on public.source_datasets;
create policy "datasets_insert" on public.source_datasets
  for insert with check (public.is_org_member(organization_id));
drop policy if exists "datasets_update" on public.source_datasets;
create policy "datasets_update" on public.source_datasets
  for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
drop policy if exists "datasets_delete" on public.source_datasets;
create policy "datasets_delete" on public.source_datasets
  for delete using (public.is_org_member(organization_id));

-- source_transactions --------------------------------------------------------
drop policy if exists "transactions_select" on public.source_transactions;
create policy "transactions_select" on public.source_transactions
  for select using (public.is_org_member(organization_id));
drop policy if exists "transactions_insert" on public.source_transactions;
create policy "transactions_insert" on public.source_transactions
  for insert with check (public.is_org_member(organization_id));
drop policy if exists "transactions_delete" on public.source_transactions;
create policy "transactions_delete" on public.source_transactions
  for delete using (public.is_org_member(organization_id));

-- reconciliation_matches -----------------------------------------------------
drop policy if exists "matches_select" on public.reconciliation_matches;
create policy "matches_select" on public.reconciliation_matches
  for select using (public.is_org_member(organization_id));
drop policy if exists "matches_insert" on public.reconciliation_matches;
create policy "matches_insert" on public.reconciliation_matches
  for insert with check (public.is_org_member(organization_id));
drop policy if exists "matches_update" on public.reconciliation_matches;
create policy "matches_update" on public.reconciliation_matches
  for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
drop policy if exists "matches_delete" on public.reconciliation_matches;
create policy "matches_delete" on public.reconciliation_matches
  for delete using (public.is_org_member(organization_id));

-- exception_resolutions ------------------------------------------------------
drop policy if exists "resolutions_select" on public.exception_resolutions;
create policy "resolutions_select" on public.exception_resolutions
  for select using (public.is_org_member(organization_id));
drop policy if exists "resolutions_insert" on public.exception_resolutions;
create policy "resolutions_insert" on public.exception_resolutions
  for insert with check (public.is_org_member(organization_id));
drop policy if exists "resolutions_update" on public.exception_resolutions;
create policy "resolutions_update" on public.exception_resolutions
  for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
drop policy if exists "resolutions_delete" on public.exception_resolutions;
create policy "resolutions_delete" on public.exception_resolutions
  for delete using (public.is_org_member(organization_id));

-- audit_events (append-only: no update/delete policies for clients) ----------
drop policy if exists "audit_select_member" on public.audit_events;
create policy "audit_select_member" on public.audit_events
  for select using (organization_id is not null and public.is_org_member(organization_id));
drop policy if exists "audit_insert_member" on public.audit_events;
create policy "audit_insert_member" on public.audit_events
  for insert with check (organization_id is null or public.is_org_member(organization_id));

-- subscriptions --------------------------------------------------------------
drop policy if exists "subscriptions_select" on public.subscriptions;
create policy "subscriptions_select" on public.subscriptions
  for select using (public.is_org_member(organization_id));
drop policy if exists "subscriptions_insert_owner" on public.subscriptions;
drop policy if exists "subscriptions_update_owner" on public.subscriptions;
-- Only the service-role client may mutate subscription entitlements.
revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke all on public.billing_webhook_events from public, anon, authenticated;

create or replace function public.apply_paddle_subscription_event(
  p_event_id text, p_organization_id uuid, p_customer_id text,
  p_subscription_id text, p_status public.subscription_status,
  p_period_end timestamptz, p_trial_end timestamptz,
  p_cancel_at_period_end boolean, p_occurred_at timestamptz
)
returns text language plpgsql security definer set search_path = public as $$
declare existing public.subscriptions%rowtype;
begin
  if p_event_id is null or p_event_id = '' or
     p_customer_id is null or p_customer_id = '' or
     p_subscription_id is null or p_subscription_id = '' or
     p_occurred_at is null then
    raise exception 'Invalid billing event';
  end if;
  select * into existing from public.subscriptions
  where organization_id = p_organization_id for update;
  if not found then return 'ignored'; end if;
  if existing.status = 'founding' then return 'ignored'; end if;
  if existing.provider_subscription_id is not null and
     existing.provider_subscription_id <> p_subscription_id and
     existing.status <> 'canceled' then
    raise exception 'Subscription belongs to a different Paddle subscription';
  end if;
  if existing.provider_customer_id is not null and
     existing.provider_customer_id <> p_customer_id then
    raise exception 'Subscription belongs to a different Paddle customer';
  end if;
  insert into public.billing_webhook_events (event_id, organization_id, occurred_at)
  values (p_event_id, p_organization_id, p_occurred_at)
  on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;
  if existing.last_event_at is not null and existing.last_event_at > p_occurred_at then
    return 'stale';
  end if;
  update public.subscriptions set
    provider = 'paddle', provider_customer_id = p_customer_id,
    provider_subscription_id = p_subscription_id, plan_name = 'Standard',
    status = p_status, current_period_end = p_period_end,
    trial_ends_at = coalesce(p_trial_end, trial_ends_at),
    cancel_at_period_end = p_cancel_at_period_end,
    last_event_at = p_occurred_at,
    past_due_since = case when p_status = 'past_due' then case
      when existing.provider_subscription_id is distinct from p_subscription_id
        then p_occurred_at else coalesce(existing.past_due_since, p_occurred_at) end
      else null end
  where organization_id = p_organization_id;
  return 'applied';
end;
$$;
revoke all on function public.apply_paddle_subscription_event(
  text, uuid, text, text, public.subscription_status, timestamptz,
  timestamptz, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_paddle_subscription_event(
  text, uuid, text, text, public.subscription_status, timestamptz,
  timestamptz, boolean, timestamptz
) to service_role;

-- -----------------------------------------------------------------------------
-- Convenience view for dashboard counts (RLS-aware via underlying tables)
-- -----------------------------------------------------------------------------
create or replace view public.v_reconciliation_summary
with (security_invoker = true) as
select
  r.id,
  r.organization_id,
  r.supplier_id,
  r.status,
  r.currency,
  r.statement_total,
  r.ledger_total,
  r.total_difference,
  r.completed_at,
  r.updated_at,
  coalesce(
    (select count(*) from public.reconciliation_matches m
      where m.reconciliation_id = r.id
        and (
          m.match_type in (
            'amount_mismatch', 'missing_in_ledger', 'missing_on_statement',
            'duplicate_statement', 'duplicate_ledger'
          )
          or (m.match_type = 'probable_match' and not m.user_confirmed)
        )
    ), 0
  ) as exception_count,
  coalesce(
    (select count(*) from public.reconciliation_matches m
      left join public.exception_resolutions er on er.match_id = m.id
      where m.reconciliation_id = r.id
        and (
          (m.match_type in (
            'amount_mismatch', 'missing_in_ledger', 'missing_on_statement',
            'duplicate_statement', 'duplicate_ledger'
          ) and (er.id is null or er.status = 'needs_investigation'))
          or (m.match_type = 'probable_match' and not m.user_confirmed)
        )
    ), 0
  ) as unresolved_count
from public.reconciliations r;
