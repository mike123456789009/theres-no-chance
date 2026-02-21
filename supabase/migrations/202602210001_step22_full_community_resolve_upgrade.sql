-- Step 22: Full community resolve upgrade
-- - Community-only resolution defaults
-- - Tie/void/challenge lifecycle updates
-- - Optional evidence URL + text evidence support
-- - Resolver prize contribution pool support
-- - Dynamic rake schedule helpers

alter table public.markets
  add column if not exists challenge_window_ends_at timestamptz,
  add column if not exists adjudication_required boolean not null default false,
  add column if not exists adjudication_reason text,
  add column if not exists creator_rake_paid_amount numeric(20, 6) not null default 0,
  add column if not exists creator_rake_paid_at timestamptz,
  add column if not exists void_reason text;

alter table public.markets
  drop constraint if exists markets_adjudication_reason_check;

alter table public.markets
  add constraint markets_adjudication_reason_check
  check (adjudication_reason is null or adjudication_reason in ('challenge', 'tie'));

update public.markets
set
  resolution_mode = 'community',
  fee_bps = 50,
  listing_fee_amount = 0.50;

alter table public.market_disputes
  add column if not exists resolver_bond_id uuid references public.market_resolver_bonds(id) on delete set null;

create unique index if not exists market_disputes_unique_market_resolver_bond
  on public.market_disputes (market_id, resolver_bond_id)
  where resolver_bond_id is not null;

alter table public.market_evidence
  alter column evidence_url drop not null;

alter table public.market_evidence
  add column if not exists evidence_text text,
  add column if not exists submitted_outcome public.resolution_outcome;

alter table public.market_evidence
  drop constraint if exists market_evidence_payload_check;

alter table public.market_evidence
  add constraint market_evidence_payload_check
  check (
    nullif(trim(coalesce(evidence_url, '')), '') is not null
    or nullif(trim(coalesce(evidence_text, '')), '') is not null
  );

alter type public.ledger_entry_type add value if not exists 'resolver_prize_contribution_lock';
alter type public.ledger_entry_type add value if not exists 'resolver_prize_contribution_refund';
alter type public.ledger_entry_type add value if not exists 'resolver_prize_contribution_distribute';
alter type public.ledger_entry_type add value if not exists 'market_maker_rake_payout';
alter type public.ledger_entry_type add value if not exists 'platform_treasury_rake';

create table if not exists public.market_resolver_prize_contributions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  contributor_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(20, 6) not null check (amount > 0),
  status text not null default 'locked' check (status in ('locked', 'refunded', 'distributed')),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists market_resolver_prize_contributions_market_idx
  on public.market_resolver_prize_contributions (market_id, created_at desc);

alter table public.market_resolver_prize_contributions enable row level security;

drop policy if exists market_resolver_prize_contributions_select on public.market_resolver_prize_contributions;
create policy market_resolver_prize_contributions_select
on public.market_resolver_prize_contributions
for select
using (
  contributor_id = auth.uid()
  or public.is_platform_admin(auth.uid())
  or exists (
    select 1
    from public.markets m
    where m.id = market_id
      and public.can_user_read_market(
        auth.uid(),
        m.id,
        m.creator_id,
        m.visibility,
        m.access_rules
      )
  )
);

drop policy if exists market_resolver_prize_contributions_insert on public.market_resolver_prize_contributions;
create policy market_resolver_prize_contributions_insert
on public.market_resolver_prize_contributions
for insert
with check (contributor_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists market_resolver_prize_contributions_update_admin on public.market_resolver_prize_contributions;
create policy market_resolver_prize_contributions_update_admin
on public.market_resolver_prize_contributions
for update
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create or replace function public.resolve_market_avg_bet_cap(
  p_market_id uuid
)
returns numeric
language plpgsql
as $$
declare
  v_avg_notional numeric := 0;
  v_cap numeric := 1;
begin
  if p_market_id is null then
    return 1;
  end if;

  select coalesce(avg(notional), 0)
  into v_avg_notional
  from public.trade_fills
  where market_id = p_market_id;

  v_cap := greatest(1, round(v_avg_notional * 2, 6));
  return v_cap;
end;
$$;

create or replace function public.calculate_rake_schedule(
  p_p numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_p numeric := greatest(coalesce(p_p, 0), 1);
  v_log_p numeric;
  v_t numeric := 0;
  v_maker numeric;
  v_resolver numeric;
  v_total numeric;
  v_platform numeric;
begin
  v_log_p := ln(v_p);

  if v_p <= 1000 then
    v_maker := 0.0050;
    v_resolver := 0.0050;
    v_total := 0.0150;
  elsif v_p <= 1000000 then
    v_t := (v_log_p - ln(1000)) / (ln(1000000) - ln(1000));
    v_maker := 0.0050 + (0.0010 - 0.0050) * v_t;
    v_resolver := 0.0050 + (0.0010 - 0.0050) * v_t;
    v_total := 0.0150 + (0.0075 - 0.0150) * v_t;
  elsif v_p <= 1000000000 then
    v_t := (v_log_p - ln(1000000)) / (ln(1000000000) - ln(1000000));
    v_maker := 0.0010 + (0.00035 - 0.0010) * v_t;
    v_resolver := 0.0010 + (0.00035 - 0.0010) * v_t;
    v_total := 0.0075 + (0.0065 - 0.0075) * v_t;
  elsif v_p <= 1000000000000 then
    v_t := (v_log_p - ln(1000000000)) / (ln(1000000000000) - ln(1000000000));
    v_maker := 0.00035 + (0.00010 - 0.00035) * v_t;
    v_resolver := 0.00035 + (0.00010 - 0.00035) * v_t;
    v_total := 0.0065 + (0.0062 - 0.0065) * v_t;
  else
    v_maker := 0.00010;
    v_resolver := 0.00010;
    v_total := 0.0062;
  end if;

  v_platform := greatest(0, v_total - v_maker - v_resolver);

  return jsonb_build_object(
    'makerRate', round(v_maker, 8),
    'resolverRate', round(v_resolver, 8),
    'platformRate', round(v_platform, 8),
    'totalRate', round(v_total, 8)
  );
end;
$$;

create or replace function public.refresh_community_market_resolution_state(
  p_market_id uuid,
  p_resolution_window_hours integer default 24
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_now timestamptz := now();
  v_yes_total numeric := 0;
  v_no_total numeric := 0;
  v_provisional public.resolution_outcome;
  v_window_ends timestamptz;
begin
  if p_market_id is null then
    raise exception '[RESOLVE_VALIDATION] market id is required.';
  end if;

  if p_resolution_window_hours is null or p_resolution_window_hours <= 0 then
    p_resolution_window_hours := 24;
  end if;

  perform public.sync_market_close_state(p_market_id);

  select
    id,
    status,
    close_time,
    resolution_mode,
    provisional_outcome,
    resolution_window_ends_at,
    challenge_window_ends_at,
    resolved_at,
    resolution_outcome,
    finalized_at,
    adjudication_required,
    adjudication_reason
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[RESOLVE_NOT_FOUND] market not found.';
  end if;

  if v_market.resolution_mode <> 'community' then
    return jsonb_build_object(
      'marketId', v_market.id,
      'status', v_market.status,
      'changed', false
    );
  end if;

  select
    coalesce(sum(case when outcome = 'yes' then bond_amount else 0 end), 0),
    coalesce(sum(case when outcome = 'no' then bond_amount else 0 end), 0)
  into v_yes_total, v_no_total
  from public.market_resolver_bonds
  where market_id = p_market_id;

  if v_market.status = 'closed' then
    v_window_ends := coalesce(v_market.resolution_window_ends_at, coalesce(v_market.close_time, v_now) + make_interval(hours => p_resolution_window_hours));

    update public.markets
    set
      status = 'pending_resolution',
      resolution_window_ends_at = v_window_ends
    where id = p_market_id;

    select
      id,
      status,
      close_time,
      resolution_mode,
      provisional_outcome,
      resolution_window_ends_at,
      challenge_window_ends_at,
      resolved_at,
      resolution_outcome,
      finalized_at,
      adjudication_required,
      adjudication_reason
    into v_market
    from public.markets
    where id = p_market_id
    for update;
  end if;

  if v_market.status = 'pending_resolution'
    and v_market.resolution_window_ends_at is not null
    and v_now >= v_market.resolution_window_ends_at
  then
    if v_yes_total = 0 and v_no_total = 0 then
      update public.markets
      set
        status = 'resolved',
        resolved_at = coalesce(resolved_at, v_now),
        provisional_outcome = null,
        resolution_outcome = 'void',
        challenge_window_ends_at = null,
        adjudication_required = false,
        adjudication_reason = null,
        void_reason = 'no_resolver_votes'
      where id = p_market_id;
    elsif v_yes_total = v_no_total then
      update public.markets
      set
        status = 'resolved',
        resolved_at = coalesce(resolved_at, v_now),
        provisional_outcome = null,
        resolution_outcome = null,
        challenge_window_ends_at = null,
        adjudication_required = true,
        adjudication_reason = 'tie',
        void_reason = null
      where id = p_market_id;
    else
      v_provisional := case when v_yes_total > v_no_total then 'yes'::public.resolution_outcome else 'no'::public.resolution_outcome end;

      update public.markets
      set
        status = 'resolved',
        resolved_at = coalesce(resolved_at, v_now),
        provisional_outcome = v_provisional,
        resolution_outcome = v_provisional,
        challenge_window_ends_at = coalesce(challenge_window_ends_at, v_now + make_interval(hours => 24)),
        adjudication_required = false,
        adjudication_reason = null,
        void_reason = null
      where id = p_market_id;
    end if;

    select
      id,
      status,
      close_time,
      resolution_mode,
      provisional_outcome,
      resolution_window_ends_at,
      challenge_window_ends_at,
      resolved_at,
      resolution_outcome,
      finalized_at,
      adjudication_required,
      adjudication_reason
    into v_market
    from public.markets
    where id = p_market_id
    for update;
  end if;

  return jsonb_build_object(
    'marketId', v_market.id,
    'status', v_market.status,
    'provisionalOutcome', v_market.provisional_outcome,
    'resolutionOutcome', v_market.resolution_outcome,
    'resolutionWindowEndsAt', v_market.resolution_window_ends_at,
    'challengeWindowEndsAt', v_market.challenge_window_ends_at,
    'adjudicationRequired', v_market.adjudication_required,
    'adjudicationReason', v_market.adjudication_reason,
    'yesBondTotal', v_yes_total,
    'noBondTotal', v_no_total,
    'changed', true
  );
end;
$$;

create or replace function public.submit_market_resolver_bond(
  p_market_id uuid,
  p_user_id uuid,
  p_outcome public.resolution_outcome,
  p_bond_amount numeric default 1,
  p_resolution_window_hours integer default 24
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_wallet record;
  v_existing_bond record;
  v_bond_amount numeric := round(coalesce(p_bond_amount, 1), 6);
  v_bond_cap numeric := 1;
  v_yes_total numeric := 0;
  v_no_total numeric := 0;
  v_lock_key text;
  v_wallet_available numeric := 0;
begin
  if p_market_id is null then
    raise exception '[RESOLVE_VALIDATION] market id is required.';
  end if;

  if p_user_id is null then
    raise exception '[RESOLVE_FORBIDDEN] user id is required.';
  end if;

  if p_outcome is null or p_outcome not in ('yes', 'no') then
    raise exception '[RESOLVE_VALIDATION] resolver bond outcome must be yes or no.';
  end if;

  if v_bond_amount < 1 then
    raise exception '[RESOLVE_VALIDATION] resolver bond amount must be at least 1.00.';
  end if;

  perform public.refresh_community_market_resolution_state(p_market_id, p_resolution_window_hours);

  select
    id,
    status,
    resolution_mode,
    finalized_at,
    resolution_window_ends_at
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[RESOLVE_NOT_FOUND] market not found.';
  end if;

  if v_market.finalized_at is not null or v_market.status = 'finalized' then
    raise exception '[RESOLVE_CONFLICT] market is already finalized.';
  end if;

  if v_market.resolution_mode <> 'community' then
    raise exception '[RESOLVE_CONFLICT] market does not use community resolution.';
  end if;

  if v_market.status not in ('closed', 'pending_resolution') then
    raise exception '[RESOLVE_CONFLICT] resolver bonds are only accepted after close and before vote lock.';
  end if;

  if v_market.resolution_window_ends_at is not null and now() > v_market.resolution_window_ends_at then
    raise exception '[RESOLVE_CONFLICT] resolution vote window has closed.';
  end if;

  v_bond_cap := public.resolve_market_avg_bet_cap(p_market_id);
  if v_bond_amount > v_bond_cap then
    raise exception '[RESOLVE_VALIDATION] resolver bond exceeds cap (2x average bet).';
  end if;

  select id, outcome, bond_amount, created_at
  into v_existing_bond
  from public.market_resolver_bonds
  where market_id = p_market_id
    and user_id = p_user_id
  for update;

  if found then
    select
      coalesce(sum(case when outcome = 'yes' then bond_amount else 0 end), 0),
      coalesce(sum(case when outcome = 'no' then bond_amount else 0 end), 0)
    into v_yes_total, v_no_total
    from public.market_resolver_bonds
    where market_id = p_market_id;

    return jsonb_build_object(
      'reused', true,
      'marketId', p_market_id,
      'bondId', v_existing_bond.id,
      'status', v_market.status,
      'outcome', v_existing_bond.outcome,
      'bondAmount', v_existing_bond.bond_amount,
      'resolutionWindowEndsAt', v_market.resolution_window_ends_at,
      'yesBondTotal', v_yes_total,
      'noBondTotal', v_no_total
    );
  end if;

  select id, available_balance, reserved_balance
  into v_wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.wallet_accounts (
      user_id,
      currency,
      available_balance,
      reserved_balance
    )
    values (
      p_user_id,
      'USD',
      0,
      0
    )
    returning id, available_balance, reserved_balance
    into v_wallet;
  end if;

  if coalesce(v_wallet.available_balance, 0) < v_bond_amount then
    raise exception '[RESOLVE_FUNDS] insufficient wallet balance for resolver bond.';
  end if;

  v_lock_key := format('resolver-bond-lock:%s:%s', p_market_id::text, p_user_id::text);

  update public.wallet_accounts
  set available_balance = coalesce(available_balance, 0) - v_bond_amount
  where id = v_wallet.id
  returning available_balance
  into v_wallet_available;

  insert into public.ledger_entries (
    user_id,
    wallet_account_id,
    entry_type,
    amount,
    currency,
    idempotency_key,
    reference_table,
    reference_id,
    metadata
  )
  values (
    p_user_id,
    v_wallet.id,
    'resolver_bond_lock'::public.ledger_entry_type,
    -v_bond_amount,
    'USD',
    v_lock_key,
    'markets',
    p_market_id,
    jsonb_build_object(
      'marketId', p_market_id,
      'outcome', p_outcome,
      'bondAmount', v_bond_amount,
      'bondCap', v_bond_cap
    )
  );

  insert into public.market_resolver_bonds (
    market_id,
    user_id,
    outcome,
    bond_amount
  )
  values (
    p_market_id,
    p_user_id,
    p_outcome,
    v_bond_amount
  )
  returning id, outcome, bond_amount, created_at
  into v_existing_bond;

  perform public.refresh_community_market_resolution_state(p_market_id, p_resolution_window_hours);

  select
    coalesce(sum(case when outcome = 'yes' then bond_amount else 0 end), 0),
    coalesce(sum(case when outcome = 'no' then bond_amount else 0 end), 0)
  into v_yes_total, v_no_total
  from public.market_resolver_bonds
  where market_id = p_market_id;

  select id, status, resolution_window_ends_at
  into v_market
  from public.markets
  where id = p_market_id;

  return jsonb_build_object(
    'reused', false,
    'marketId', p_market_id,
    'bondId', v_existing_bond.id,
    'status', v_market.status,
    'outcome', v_existing_bond.outcome,
    'bondAmount', v_existing_bond.bond_amount,
    'walletAvailableBalance', v_wallet_available,
    'resolutionWindowEndsAt', v_market.resolution_window_ends_at,
    'yesBondTotal', v_yes_total,
    'noBondTotal', v_no_total
  );
end;
$$;

create or replace function public.submit_market_dispute_challenge(
  p_market_id uuid,
  p_user_id uuid,
  p_reason text,
  p_proposed_outcome public.resolution_outcome default null,
  p_dispute_window_hours integer default 24
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_wallet record;
  v_dispute record;
  v_resolver_bond record;
  v_reason text := trim(coalesce(p_reason, ''));
  v_now timestamptz := now();
  v_bond_amount numeric := 0;
  v_lock_key text;
  v_wallet_available numeric := 0;
begin
  if p_market_id is null then
    raise exception '[CHALLENGE_VALIDATION] market id is required.';
  end if;

  if p_user_id is null then
    raise exception '[CHALLENGE_FORBIDDEN] user id is required.';
  end if;

  if length(v_reason) < 10 then
    raise exception '[CHALLENGE_VALIDATION] reason must be at least 10 characters.';
  end if;

  if length(v_reason) > 1000 then
    raise exception '[CHALLENGE_VALIDATION] reason must be 1000 characters or less.';
  end if;

  select
    id,
    status,
    resolution_mode,
    resolved_at,
    finalized_at,
    provisional_outcome,
    challenge_window_ends_at
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[CHALLENGE_NOT_FOUND] market not found.';
  end if;

  if v_market.status <> 'resolved' then
    raise exception '[CHALLENGE_CONFLICT] market must have provisional resolution before challenge.';
  end if;

  if v_market.finalized_at is not null then
    raise exception '[CHALLENGE_CONFLICT] market is already finalized.';
  end if;

  if v_market.resolution_mode <> 'community' then
    raise exception '[CHALLENGE_CONFLICT] market does not use community resolution.';
  end if;

  if v_market.provisional_outcome not in ('yes', 'no') then
    raise exception '[CHALLENGE_CONFLICT] provisional outcome is unavailable for challenge.';
  end if;

  if v_market.challenge_window_ends_at is null or v_now > v_market.challenge_window_ends_at then
    raise exception '[CHALLENGE_CONFLICT] challenge window has closed for this market.';
  end if;

  select id, outcome, bond_amount
  into v_resolver_bond
  from public.market_resolver_bonds
  where market_id = p_market_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception '[CHALLENGE_CONFLICT] only existing resolvers can challenge.';
  end if;

  if v_resolver_bond.outcome = v_market.provisional_outcome then
    raise exception '[CHALLENGE_CONFLICT] only out-voted resolvers can challenge.';
  end if;

  select id, status, expires_at, created_at, challenge_bond_amount, proposed_outcome
  into v_dispute
  from public.market_disputes
  where market_id = p_market_id
    and resolver_bond_id = v_resolver_bond.id
  for update;

  if found then
    return jsonb_build_object(
      'reused', true,
      'marketId', p_market_id,
      'disputeId', v_dispute.id,
      'status', v_dispute.status,
      'expiresAt', v_dispute.expires_at,
      'createdAt', v_dispute.created_at,
      'challengeBondAmount', v_dispute.challenge_bond_amount,
      'proposedOutcome', v_dispute.proposed_outcome
    );
  end if;

  v_bond_amount := round(coalesce(v_resolver_bond.bond_amount, 0), 6);

  if v_bond_amount <= 0 then
    raise exception '[CHALLENGE_VALIDATION] invalid resolver stake for challenge.';
  end if;

  select id, available_balance, reserved_balance
  into v_wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.wallet_accounts (
      user_id,
      currency,
      available_balance,
      reserved_balance
    )
    values (
      p_user_id,
      'USD',
      0,
      0
    )
    returning id, available_balance, reserved_balance
    into v_wallet;
  end if;

  if coalesce(v_wallet.available_balance, 0) < v_bond_amount then
    raise exception '[CHALLENGE_FUNDS] insufficient wallet balance for challenge bond.';
  end if;

  update public.wallet_accounts
  set available_balance = coalesce(available_balance, 0) - v_bond_amount
  where id = v_wallet.id
  returning available_balance
  into v_wallet_available;

  v_lock_key := format('challenge-bond-lock:%s:%s', p_market_id::text, v_resolver_bond.id::text);

  insert into public.ledger_entries (
    user_id,
    wallet_account_id,
    entry_type,
    amount,
    currency,
    idempotency_key,
    reference_table,
    reference_id,
    metadata
  )
  values (
    p_user_id,
    v_wallet.id,
    'challenge_bond_lock'::public.ledger_entry_type,
    -v_bond_amount,
    'USD',
    v_lock_key,
    'markets',
    p_market_id,
    jsonb_build_object(
      'marketId', p_market_id,
      'resolverBondId', v_resolver_bond.id,
      'proposedOutcome', v_resolver_bond.outcome,
      'bondAmount', v_bond_amount,
      'rule', 'exact_double_down'
    )
  );

  insert into public.market_disputes (
    market_id,
    created_by,
    status,
    reason,
    expires_at,
    challenge_bond_amount,
    proposed_outcome,
    resolver_bond_id
  )
  values (
    p_market_id,
    p_user_id,
    'open'::public.dispute_status,
    v_reason,
    v_market.challenge_window_ends_at,
    v_bond_amount,
    v_resolver_bond.outcome,
    v_resolver_bond.id
  )
  returning id, status, expires_at, created_at, challenge_bond_amount, proposed_outcome
  into v_dispute;

  update public.markets
  set
    adjudication_required = true,
    adjudication_reason = 'challenge'
  where id = p_market_id;

  return jsonb_build_object(
    'reused', false,
    'marketId', p_market_id,
    'disputeId', v_dispute.id,
    'status', v_dispute.status,
    'expiresAt', v_dispute.expires_at,
    'createdAt', v_dispute.created_at,
    'challengeBondAmount', v_dispute.challenge_bond_amount,
    'proposedOutcome', v_dispute.proposed_outcome,
    'walletAvailableBalance', v_wallet_available
  );
end;
$$;

create or replace function public.submit_market_resolver_prize_contribution(
  p_market_id uuid,
  p_user_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_wallet record;
  v_amount numeric := round(coalesce(p_amount, 0), 6);
  v_wallet_available numeric := 0;
  v_row record;
  v_lock_key text;
begin
  if p_market_id is null then
    raise exception '[PRIZE_VALIDATION] market id is required.';
  end if;

  if p_user_id is null then
    raise exception '[PRIZE_FORBIDDEN] user id is required.';
  end if;

  if v_amount < 1 then
    raise exception '[PRIZE_VALIDATION] contribution amount must be at least 1.00.';
  end if;

  select id, status, resolution_mode, finalized_at
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[PRIZE_NOT_FOUND] market not found.';
  end if;

  if v_market.finalized_at is not null or v_market.status = 'finalized' then
    raise exception '[PRIZE_CONFLICT] market is already finalized.';
  end if;

  if v_market.resolution_mode <> 'community' then
    raise exception '[PRIZE_CONFLICT] market is not a community resolution market.';
  end if;

  select id, available_balance, reserved_balance
  into v_wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.wallet_accounts (
      user_id,
      currency,
      available_balance,
      reserved_balance
    )
    values (
      p_user_id,
      'USD',
      0,
      0
    )
    returning id, available_balance, reserved_balance
    into v_wallet;
  end if;

  if coalesce(v_wallet.available_balance, 0) < v_amount then
    raise exception '[PRIZE_FUNDS] insufficient wallet balance for contribution.';
  end if;

  update public.wallet_accounts
  set available_balance = coalesce(available_balance, 0) - v_amount
  where id = v_wallet.id
  returning available_balance
  into v_wallet_available;

  insert into public.market_resolver_prize_contributions (
    market_id,
    contributor_id,
    amount,
    status
  )
  values (
    p_market_id,
    p_user_id,
    v_amount,
    'locked'
  )
  returning id, market_id, contributor_id, amount, status, settled_at, created_at
  into v_row;

  v_lock_key := format('resolver-prize-lock:%s:%s', p_market_id::text, v_row.id::text);

  insert into public.ledger_entries (
    user_id,
    wallet_account_id,
    entry_type,
    amount,
    currency,
    idempotency_key,
    reference_table,
    reference_id,
    metadata
  )
  values (
    p_user_id,
    v_wallet.id,
    'resolver_prize_contribution_lock'::public.ledger_entry_type,
    -v_amount,
    'USD',
    v_lock_key,
    'market_resolver_prize_contributions',
    v_row.id,
    jsonb_build_object(
      'marketId', p_market_id,
      'contributionId', v_row.id,
      'amount', v_amount
    )
  );

  return jsonb_build_object(
    'reused', false,
    'contributionId', v_row.id,
    'marketId', v_row.market_id,
    'amount', v_row.amount,
    'status', v_row.status,
    'walletAvailableBalance', v_wallet_available
  );
end;
$$;

create or replace function public.admin_finalize_market_v2(
  p_market_id uuid,
  p_admin_user_id uuid,
  p_outcome public.resolution_outcome default null,
  p_dispute_window_hours integer default 24
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_now timestamptz := now();
  v_result jsonb;
  v_final_outcome public.resolution_outcome;
  v_schedule jsonb;
  v_settlement record;
  v_contribution record;
  v_total_contrib numeric := 0;
  v_weight_total numeric := 0;
  v_weight numeric := 0;
  v_share numeric := 0;
  v_reward_key text;
  v_refund_key text;
  v_maker_rate numeric := 0;
  v_maker_amount numeric := 0;
  v_maker_key text;
begin
  if p_market_id is null then
    raise exception '[FINALIZE_VALIDATION] market id is required.';
  end if;

  if p_admin_user_id is null then
    raise exception '[FINALIZE_FORBIDDEN] admin user id is required.';
  end if;

  select
    id,
    status,
    resolution_mode,
    resolution_outcome,
    provisional_outcome,
    challenge_window_ends_at,
    adjudication_required,
    creator_id,
    finalized_at
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[FINALIZE_NOT_FOUND] market not found.';
  end if;

  if v_market.status = 'finalized' or v_market.finalized_at is not null then
    return jsonb_build_object(
      'reused', true,
      'marketId', v_market.id,
      'status', 'finalized',
      'finalizedAt', coalesce(v_market.finalized_at, v_now)
    );
  end if;

  if v_market.status <> 'resolved' then
    raise exception '[FINALIZE_CONFLICT] market must be resolved before finalization.';
  end if;

  if v_market.resolution_mode <> 'community' then
    return public.admin_finalize_market(p_market_id, p_admin_user_id, p_dispute_window_hours);
  end if;

  if v_market.adjudication_required then
    if p_outcome not in ('yes', 'no') then
      raise exception '[FINALIZE_CONFLICT] challenged or tied markets require explicit final outcome.';
    end if;
    v_final_outcome := p_outcome;
  else
    if v_market.challenge_window_ends_at is not null and v_now < v_market.challenge_window_ends_at then
      raise exception '[FINALIZE_CONFLICT] challenge window still open.';
    end if;

    if p_outcome in ('yes', 'no', 'void') then
      v_final_outcome := p_outcome;
    else
      v_final_outcome := v_market.resolution_outcome;
    end if;
  end if;

  if v_final_outcome is null then
    raise exception '[FINALIZE_CONFLICT] final outcome is missing.';
  end if;

  update public.markets
  set
    resolution_outcome = v_final_outcome,
    adjudication_required = false,
    adjudication_reason = null
  where id = p_market_id;

  if v_market.adjudication_required then
    update public.market_disputes
    set
      status = case when proposed_outcome = v_final_outcome then 'upheld'::public.dispute_status else 'rejected'::public.dispute_status end,
      adjudicated_by = p_admin_user_id,
      adjudication_notes = 'Resolved by final adjudication outcome.',
      adjudicated_at = v_now
    where market_id = p_market_id
      and status in ('open', 'under_review');
  end if;

  if v_final_outcome = 'void' then
    for v_contribution in
      select id, contributor_id, amount
      from public.market_resolver_prize_contributions
      where market_id = p_market_id
        and status = 'locked'
      for update
    loop
      v_refund_key := format('resolver-prize-refund:%s', v_contribution.id::text);
      perform public.apply_wallet_credit(
        v_contribution.contributor_id,
        v_contribution.amount,
        'resolver_prize_contribution_refund'::public.ledger_entry_type,
        v_refund_key,
        'market_resolver_prize_contributions',
        v_contribution.id,
        jsonb_build_object('marketId', p_market_id, 'reason', 'void_outcome')
      );

      update public.market_resolver_prize_contributions
      set status = 'refunded', settled_at = v_now
      where id = v_contribution.id;
    end loop;

    update public.markets
    set
      status = 'finalized',
      finalized_at = v_now
    where id = p_market_id;

    return jsonb_build_object(
      'reused', false,
      'marketId', p_market_id,
      'status', 'finalized',
      'finalOutcome', 'void',
      'finalizedAt', v_now
    );
  end if;

  v_result := public.admin_finalize_market(p_market_id, p_admin_user_id, p_dispute_window_hours);

  select settlement_pot_p
  into v_settlement
  from public.market_resolution_settlements
  where market_id = p_market_id;

  if found then
    v_schedule := public.calculate_rake_schedule(coalesce(v_settlement.settlement_pot_p, 0));
    v_maker_rate := coalesce((v_schedule ->> 'makerRate')::numeric, 0);
    v_maker_amount := round(coalesce(v_settlement.settlement_pot_p, 0) * v_maker_rate, 6);

    if v_maker_amount > 0 then
      v_maker_key := format('maker-rake:%s', p_market_id::text);
      perform public.apply_wallet_credit(
        v_market.creator_id,
        v_maker_amount,
        'market_maker_rake_payout'::public.ledger_entry_type,
        v_maker_key,
        'markets',
        p_market_id,
        jsonb_build_object('marketId', p_market_id, 'makerRate', v_maker_rate)
      );

      update public.markets
      set
        creator_rake_paid_amount = v_maker_amount,
        creator_rake_paid_at = v_now
      where id = p_market_id;
    end if;
  end if;

  select coalesce(sum(amount), 0)
  into v_total_contrib
  from public.market_resolver_prize_contributions
  where market_id = p_market_id
    and status = 'locked';

  if v_total_contrib > 0 then
    select coalesce(sum(weight), 0)
    into v_weight_total
    from (
      select
        b.id,
        coalesce(b.bond_amount, 0)
          + coalesce((
              select sum(d.challenge_bond_amount)
              from public.market_disputes d
              where d.market_id = p_market_id
                and d.resolver_bond_id = b.id
                and d.status = 'upheld'
            ), 0) as weight
      from public.market_resolver_bonds b
      where b.market_id = p_market_id
        and b.is_correct = true
    ) q;

    if v_weight_total > 0 then
      for v_contribution in
        select
          b.id as bond_id,
          b.user_id,
          coalesce(b.bond_amount, 0)
            + coalesce((
                select sum(d.challenge_bond_amount)
                from public.market_disputes d
                where d.market_id = p_market_id
                  and d.resolver_bond_id = b.id
                  and d.status = 'upheld'
              ), 0) as weight
        from public.market_resolver_bonds b
        where b.market_id = p_market_id
          and b.is_correct = true
      loop
        v_weight := coalesce(v_contribution.weight, 0);
        if v_weight <= 0 then
          continue;
        end if;

        v_share := round((v_weight / v_weight_total) * v_total_contrib, 6);
        if v_share <= 0 then
          continue;
        end if;

        v_reward_key := format('resolver-prize-distribute:%s:%s', p_market_id::text, v_contribution.bond_id::text);
        perform public.apply_wallet_credit(
          v_contribution.user_id,
          v_share,
          'resolver_prize_contribution_distribute'::public.ledger_entry_type,
          v_reward_key,
          'markets',
          p_market_id,
          jsonb_build_object(
            'marketId', p_market_id,
            'bondId', v_contribution.bond_id,
            'weight', v_weight,
            'weightTotal', v_weight_total,
            'pool', v_total_contrib
          )
        );
      end loop;
    end if;

    update public.market_resolver_prize_contributions
    set status = 'distributed', settled_at = v_now
    where market_id = p_market_id
      and status = 'locked';
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'finalOutcome', v_final_outcome,
    'resolverContributionPoolDistributed', v_total_contrib,
    'makerRakePaid', v_maker_amount
  );
end;
$$;

create or replace function public.sync_due_community_finalizations(
  p_actor_user_id uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_market record;
  v_count integer := 0;
  v_actor uuid;
begin
  for v_market in
    select id, creator_id
    from public.markets
    where resolution_mode = 'community'
      and status = 'resolved'
      and finalized_at is null
      and adjudication_required = false
      and resolution_outcome in ('yes', 'no', 'void')
      and (challenge_window_ends_at is null or challenge_window_ends_at <= now())
  loop
    v_actor := coalesce(p_actor_user_id, v_market.creator_id);
    if v_actor is null then
      continue;
    end if;

    perform public.admin_finalize_market_v2(v_market.id, v_actor, null, 24);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.resolve_market_avg_bet_cap(uuid) to service_role;
grant execute on function public.calculate_rake_schedule(numeric) to service_role;
grant execute on function public.submit_market_resolver_prize_contribution(uuid, uuid, numeric) to service_role;
grant execute on function public.admin_finalize_market_v2(uuid, uuid, public.resolution_outcome, integer) to service_role;
grant execute on function public.sync_due_community_finalizations(uuid) to service_role;
