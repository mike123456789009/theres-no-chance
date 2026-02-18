-- Step 7: Wallet funding intents
-- Correlates user-initiated deposits (Stripe/Coinbase) with webhook credits so /wallet can show pending/credited state.

create table public.funding_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'coinbase')),
  intent text not null check (intent in ('token_pack', 'subscription')),
  key text not null,
  tokens_granted integer not null default 0 check (tokens_granted >= 0),
  status text not null default 'created' check (status in ('created', 'redirected', 'credited', 'failed', 'canceled')),
  stripe_session_id text unique,
  coinbase_charge_id text unique,
  ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index funding_intents_user_created_idx on public.funding_intents (user_id, created_at desc);

alter table public.funding_intents enable row level security;

create policy funding_intents_select_own_or_admin
on public.funding_intents
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create trigger funding_intents_set_updated_at
before update on public.funding_intents
for each row execute function public.set_updated_at();

