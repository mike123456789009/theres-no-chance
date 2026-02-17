create extension if not exists pgcrypto with schema extensions;

create type public.market_status as enum (
  'draft',
  'review',
  'open',
  'trading_halted',
  'closed',
  'pending_resolution',
  'resolved',
  'finalized'
);

create type public.market_visibility as enum (
  'public',
  'unlisted',
  'private'
);

create type public.resolution_outcome as enum (
  'yes',
  'no',
  'void'
);

create type public.user_role as enum (
  'user',
  'creator',
  'moderator',
  'institution_admin',
  'platform_admin'
);

create type public.kyc_status as enum (
  'not_started',
  'pending',
  'verified',
  'rejected'
);

create type public.ledger_entry_type as enum (
  'deposit',
  'subscription_grant',
  'pack_purchase',
  'trade_debit',
  'trade_credit',
  'fee',
  'settlement_payout',
  'withdrawal_request',
  'withdrawal_complete',
  'withdrawal_failed',
  'refund',
  'chargeback'
);

create type public.dispute_status as enum (
  'open',
  'under_review',
  'upheld',
  'rejected',
  'expired'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  city_region text,
  interests text[] not null default '{}',
  notification_prefs jsonb not null default '{}'::jsonb,
  privacy_prefs jsonb not null default '{}'::jsonb,
  kyc_status public.kyc_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null default 'user',
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, organization_id)
);

create unique index user_roles_unique_global_role
  on public.user_roles (user_id, role)
  where organization_id is null;

create table public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null unique,
  allow_subdomains boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_role text not null default 'member',
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  description text not null,
  resolves_yes_if text not null,
  resolves_no_if text not null,
  close_time timestamptz not null,
  expected_resolution_time timestamptz,
  evidence_rules text,
  dispute_rules text,
  fee_bps integer not null default 200 check (fee_bps >= 0 and fee_bps <= 10000),
  status public.market_status not null default 'draft',
  visibility public.market_visibility not null default 'public',
  access_rules jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  risk_flags text[] not null default '{}',
  creator_id uuid not null references auth.users(id) on delete restrict,
  reviewer_id uuid references auth.users(id) on delete set null,
  resolver_id uuid references auth.users(id) on delete set null,
  resolution_outcome public.resolution_outcome,
  resolution_notes text,
  resolved_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_sources (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  source_label text not null,
  source_url text not null,
  source_type text not null default 'official',
  created_at timestamptz not null default now(),
  unique (market_id, source_url)
);

create table public.market_evidence (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  evidence_url text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.market_disputes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  status public.dispute_status not null default 'open',
  reason text not null,
  expires_at timestamptz not null,
  adjudicated_by uuid references auth.users(id) on delete set null,
  adjudication_notes text,
  adjudicated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.market_amm_state (
  market_id uuid primary key references public.markets(id) on delete cascade,
  liquidity_parameter numeric(20, 8) not null default 100,
  yes_shares numeric(36, 18) not null default 0,
  no_shares numeric(36, 18) not null default 0,
  last_price_yes numeric(12, 8) not null default 0.5,
  last_price_no numeric(12, 8) not null default 0.5,
  updated_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  yes_shares numeric(36, 18) not null default 0,
  no_shares numeric(36, 18) not null default 0,
  average_entry_price_yes numeric(12, 8),
  average_entry_price_no numeric(12, 8),
  realized_pnl numeric(18, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, user_id)
);

create table public.trade_fills (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null check (side in ('yes', 'no')),
  action text not null check (action in ('buy', 'sell')),
  shares numeric(36, 18) not null check (shares > 0),
  price numeric(12, 8) not null check (price >= 0 and price <= 1),
  notional numeric(18, 6) not null,
  fee_amount numeric(18, 6) not null default 0,
  price_before_yes numeric(12, 8),
  price_after_yes numeric(12, 8),
  created_at timestamptz not null default now()
);

create table public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  currency text not null default 'USD',
  available_balance numeric(18, 6) not null default 0,
  reserved_balance numeric(18, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_account_id uuid references public.wallet_accounts(id) on delete set null,
  entry_type public.ledger_entry_type not null,
  amount numeric(18, 6) not null,
  currency text not null default 'USD',
  idempotency_key text not null unique,
  reference_table text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique,
  display_name text not null,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  monthly_token_grant integer not null check (monthly_token_grant >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.token_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  amount_tokens integer not null check (amount_tokens > 0),
  ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.token_pack_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_key text not null,
  amount_paid_cents integer not null check (amount_paid_cents >= 0),
  tokens_granted integer not null check (tokens_granted >= 0),
  stripe_session_id text unique,
  coinbase_charge_id text unique,
  created_at timestamptz not null default now()
);

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(18, 6) not null check (amount > 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  failure_reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'coinbase')),
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed')),
  processed_at timestamptz,
  error_message text,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index markets_status_visibility_idx on public.markets (status, visibility);
create index markets_close_time_idx on public.markets (close_time);
create index markets_creator_idx on public.markets (creator_id);
create index positions_user_idx on public.positions (user_id);
create index trade_fills_market_created_idx on public.trade_fills (market_id, created_at desc);
create index trade_fills_user_created_idx on public.trade_fills (user_id, created_at desc);
create index ledger_entries_user_created_idx on public.ledger_entries (user_id, created_at desc);
create index organization_memberships_user_idx on public.organization_memberships (user_id);
create index webhook_events_processing_idx on public.webhook_events (processing_status, received_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger markets_set_updated_at
before update on public.markets
for each row execute function public.set_updated_at();

create trigger positions_set_updated_at
before update on public.positions
for each row execute function public.set_updated_at();

create trigger wallet_accounts_set_updated_at
before update on public.wallet_accounts
for each row execute function public.set_updated_at();

create trigger user_subscriptions_set_updated_at
before update on public.user_subscriptions
for each row execute function public.set_updated_at();

create or replace function public.is_platform_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = check_user
      and ur.role = 'platform_admin'
      and ur.organization_id is null
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_domains enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.markets enable row level security;
alter table public.market_sources enable row level security;
alter table public.market_evidence enable row level security;
alter table public.market_disputes enable row level security;
alter table public.market_amm_state enable row level security;
alter table public.positions enable row level security;
alter table public.trade_fills enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.token_grants enable row level security;
alter table public.token_pack_purchases enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.webhook_events enable row level security;
alter table public.admin_action_log enable row level security;

create policy profiles_select_own_or_admin
on public.profiles
for select
using (auth.uid() = id or public.is_platform_admin(auth.uid()));

create policy profiles_insert_own_or_admin
on public.profiles
for insert
with check (auth.uid() = id or public.is_platform_admin(auth.uid()));

create policy profiles_update_own_or_admin
on public.profiles
for update
using (auth.uid() = id or public.is_platform_admin(auth.uid()))
with check (auth.uid() = id or public.is_platform_admin(auth.uid()));

create policy user_roles_select_own_or_admin
on public.user_roles
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy user_roles_manage_admin
on public.user_roles
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy organizations_select_members_or_admin
on public.organizations
for select
using (
  public.is_platform_admin(auth.uid())
  or exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = id
      and om.user_id = auth.uid()
  )
);

create policy organizations_manage_admin
on public.organizations
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy organization_domains_select_members_or_admin
on public.organization_domains
for select
using (
  public.is_platform_admin(auth.uid())
  or exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organization_id
      and om.user_id = auth.uid()
  )
);

create policy organization_domains_manage_admin
on public.organization_domains
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy organization_memberships_select_own_or_admin
on public.organization_memberships
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy organization_memberships_manage_admin
on public.organization_memberships
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy markets_select_visible_creator_or_admin
on public.markets
for select
using (
  visibility in ('public', 'unlisted')
  or creator_id = auth.uid()
  or public.is_platform_admin(auth.uid())
);

create policy markets_insert_authenticated
on public.markets
for insert
with check (auth.role() = 'authenticated');

create policy markets_update_creator_or_admin
on public.markets
for update
using (creator_id = auth.uid() or public.is_platform_admin(auth.uid()))
with check (creator_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy markets_delete_creator_or_admin
on public.markets
for delete
using (creator_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy market_sources_select
on public.market_sources
for select
using (
  exists (
    select 1
    from public.markets m
    where m.id = market_id
      and (
        m.visibility in ('public', 'unlisted')
        or m.creator_id = auth.uid()
        or public.is_platform_admin(auth.uid())
      )
  )
);

create policy market_sources_manage_creator_or_admin
on public.market_sources
for all
using (
  exists (
    select 1
    from public.markets m
    where m.id = market_id
      and (m.creator_id = auth.uid() or public.is_platform_admin(auth.uid()))
  )
)
with check (
  exists (
    select 1
    from public.markets m
    where m.id = market_id
      and (m.creator_id = auth.uid() or public.is_platform_admin(auth.uid()))
  )
);

create policy market_evidence_select
on public.market_evidence
for select
using (
  exists (
    select 1
    from public.markets m
    where m.id = market_id
      and (
        m.visibility in ('public', 'unlisted')
        or m.creator_id = auth.uid()
        or public.is_platform_admin(auth.uid())
      )
  )
);

create policy market_evidence_manage_submitter_or_admin
on public.market_evidence
for all
using (submitted_by = auth.uid() or public.is_platform_admin(auth.uid()))
with check (submitted_by = auth.uid() or public.is_platform_admin(auth.uid()));

create policy market_disputes_select
on public.market_disputes
for select
using (
  exists (
    select 1
    from public.markets m
    where m.id = market_id
      and (
        m.visibility in ('public', 'unlisted')
        or m.creator_id = auth.uid()
        or public.is_platform_admin(auth.uid())
      )
  )
);

create policy market_disputes_insert_authenticated
on public.market_disputes
for insert
with check (auth.role() = 'authenticated');

create policy market_disputes_update_admin
on public.market_disputes
for update
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy market_amm_state_select
on public.market_amm_state
for select
using (
  exists (
    select 1
    from public.markets m
    where m.id = market_id
      and (
        m.visibility in ('public', 'unlisted')
        or m.creator_id = auth.uid()
        or public.is_platform_admin(auth.uid())
      )
  )
);

create policy market_amm_state_manage_admin
on public.market_amm_state
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy positions_select_own_or_admin
on public.positions
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy positions_manage_own_or_admin
on public.positions
for all
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy trade_fills_select_own_or_admin
on public.trade_fills
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy trade_fills_insert_own_or_admin
on public.trade_fills
for insert
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy wallet_accounts_select_own_or_admin
on public.wallet_accounts
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy wallet_accounts_manage_own_or_admin
on public.wallet_accounts
for all
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy ledger_entries_select_own_or_admin
on public.ledger_entries
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy ledger_entries_insert_own_or_admin
on public.ledger_entries
for insert
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy subscription_plans_select_all
on public.subscription_plans
for select
using (true);

create policy subscription_plans_manage_admin
on public.subscription_plans
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy user_subscriptions_select_own_or_admin
on public.user_subscriptions
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy user_subscriptions_manage_own_or_admin
on public.user_subscriptions
for all
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy token_grants_select_own_or_admin
on public.token_grants
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy token_grants_insert_own_or_admin
on public.token_grants
for insert
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy token_pack_purchases_select_own_or_admin
on public.token_pack_purchases
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy token_pack_purchases_insert_own_or_admin
on public.token_pack_purchases
for insert
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy withdrawal_requests_select_own_or_admin
on public.withdrawal_requests
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy withdrawal_requests_insert_own_or_admin
on public.withdrawal_requests
for insert
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy withdrawal_requests_update_admin
on public.withdrawal_requests
for update
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy webhook_events_admin_only
on public.webhook_events
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy admin_action_log_admin_only
on public.admin_action_log
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));
