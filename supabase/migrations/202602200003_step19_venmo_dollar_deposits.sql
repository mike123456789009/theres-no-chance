-- Step 19: Venmo net-of-fee USD deposits + reconciliation queue
-- Adds fee-aware fields for funding intents and normalized payment receipt tables.

alter table public.funding_intents
  drop constraint if exists funding_intents_provider_check;

alter table public.funding_intents
  drop constraint if exists funding_intents_intent_check;

alter table public.funding_intents
  drop constraint if exists funding_intents_status_check;

alter table public.funding_intents
  add constraint funding_intents_provider_check
  check (provider in ('stripe', 'coinbase', 'venmo'));

alter table public.funding_intents
  add constraint funding_intents_intent_check
  check (intent in ('token_pack', 'subscription', 'usd_topup'));

alter table public.funding_intents
  add constraint funding_intents_status_check
  check (
    status in (
      'created',
      'redirected',
      'awaiting_payment',
      'pending_reconciliation',
      'review_required',
      'credited',
      'failed',
      'canceled'
    )
  );

alter table public.funding_intents
  add column if not exists requested_amount_usd numeric(18, 6) not null default 0 check (requested_amount_usd >= 0),
  add column if not exists estimated_fee_usd numeric(18, 6) not null default 0 check (estimated_fee_usd >= 0),
  add column if not exists estimated_net_credit_usd numeric(18, 6) not null default 0 check (estimated_net_credit_usd >= 0),
  add column if not exists invoice_code text,
  add column if not exists venmo_transaction_id text;

create unique index if not exists funding_intents_invoice_code_key
  on public.funding_intents (invoice_code)
  where invoice_code is not null;

create unique index if not exists funding_intents_venmo_transaction_id_key
  on public.funding_intents (venmo_transaction_id)
  where venmo_transaction_id is not null;

create table if not exists public.deposit_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  funding_intent_id uuid references public.funding_intents(id) on delete set null,
  provider text not null check (provider in ('venmo', 'coinbase')),
  provider_payment_id text not null,
  gross_amount_usd numeric(18, 6) not null check (gross_amount_usd >= 0),
  fee_amount_usd numeric(18, 6) not null default 0 check (fee_amount_usd >= 0),
  net_amount_usd numeric(18, 6) not null check (net_amount_usd >= 0),
  currency text not null default 'USD',
  payer_display_name text,
  payer_handle text,
  payment_note text,
  paid_at timestamptz,
  source text not null default 'api',
  raw_payload jsonb not null default '{}'::jsonb,
  ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id),
  unique (funding_intent_id)
);

create index if not exists deposit_receipts_user_created_idx
  on public.deposit_receipts (user_id, created_at desc);

create index if not exists deposit_receipts_provider_created_idx
  on public.deposit_receipts (provider, created_at desc);

create trigger deposit_receipts_set_updated_at
before update on public.deposit_receipts
for each row execute function public.set_updated_at();

alter table public.deposit_receipts enable row level security;

create policy deposit_receipts_select_own_or_admin
on public.deposit_receipts
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create table if not exists public.venmo_incoming_payments (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  venmo_transaction_id text unique,
  provider_payment_id text not null unique,
  gross_amount_usd numeric(18, 6) not null check (gross_amount_usd > 0),
  computed_fee_usd numeric(18, 6) not null default 0 check (computed_fee_usd >= 0),
  computed_net_usd numeric(18, 6) not null default 0 check (computed_net_usd >= 0),
  currency text not null default 'USD',
  paid_at timestamptz,
  payer_display_name text,
  payer_handle text,
  note text,
  extracted_invoice_code text,
  match_status text not null default 'pending' check (match_status in ('pending', 'review_required', 'credited', 'failed', 'ignored')),
  matched_funding_intent_id uuid references public.funding_intents(id) on delete set null,
  deposit_receipt_id uuid references public.deposit_receipts(id) on delete set null,
  ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venmo_incoming_payments_status_created_idx
  on public.venmo_incoming_payments (match_status, created_at desc);

create index if not exists venmo_incoming_payments_invoice_code_idx
  on public.venmo_incoming_payments (extracted_invoice_code);

create trigger venmo_incoming_payments_set_updated_at
before update on public.venmo_incoming_payments
for each row execute function public.set_updated_at();

alter table public.venmo_incoming_payments enable row level security;

create policy venmo_incoming_payments_admin_only
on public.venmo_incoming_payments
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));
