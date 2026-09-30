-- Apply once before setting BILLING_PROVIDER=paddle. Safe to re-run.
alter table public.subscriptions
  add column if not exists provider_subscription_id text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists last_event_at timestamptz,
  add column if not exists past_due_since timestamptz;

create unique index if not exists subscriptions_provider_subscription_unique
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;
create unique index if not exists subscriptions_paddle_customer_unique
  on public.subscriptions (provider_customer_id)
  where provider = 'paddle' and provider_customer_id is not null;

create table if not exists public.billing_webhook_events (
  event_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  occurred_at timestamptz not null,
  processed_at timestamptz not null default now()
);
create index if not exists billing_webhook_events_org_idx
  on public.billing_webhook_events (organization_id, processed_at desc);
alter table public.billing_webhook_events enable row level security;

-- A browser-authenticated owner must NEVER be able to mark a plan as paid.
drop policy if exists "subscriptions_insert_owner" on public.subscriptions;
drop policy if exists "subscriptions_update_owner" on public.subscriptions;
revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke all on public.billing_webhook_events from public, anon, authenticated;

-- An atomic, replay-safe state transition for VERIFIED Paddle webhook events.
-- Only the service-role client may call this function. It runs with a fixed
-- search_path and locks the subscription before checking event ordering.
create or replace function public.apply_paddle_subscription_event(
  p_event_id text,
  p_organization_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status public.subscription_status,
  p_period_end timestamptz,
  p_trial_end timestamptz,
  p_cancel_at_period_end boolean,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.subscriptions%rowtype;
begin
  if p_event_id is null or p_event_id = '' or
     p_customer_id is null or p_customer_id = '' or
     p_subscription_id is null or p_subscription_id = '' or
     p_occurred_at is null then
    raise exception 'Invalid billing event';
  end if;

  select * into existing from public.subscriptions
  where organization_id = p_organization_id for update;

  -- A deleted workspace must never be recreated by a late webhook.
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
    provider = 'paddle',
    provider_customer_id = p_customer_id,
    provider_subscription_id = p_subscription_id,
    plan_name = 'Standard',
    status = p_status,
    current_period_end = p_period_end,
    trial_ends_at = coalesce(p_trial_end, trial_ends_at),
    cancel_at_period_end = p_cancel_at_period_end,
    last_event_at = p_occurred_at,
    past_due_since = case
      when p_status = 'past_due' then case
        when existing.provider_subscription_id is distinct from p_subscription_id
          then p_occurred_at else coalesce(existing.past_due_since, p_occurred_at) end
      else null
    end
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
