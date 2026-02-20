-- Step 19: Community resolve + successful challenge bonus
-- - Dual resolution mode (admin/community)
-- - Resolver/challenge bond accounting and payouts
-- - Market listing fee debit at submit time

alter table public.markets
  add column resolution_mode text not null default 'admin',
  add column challenge_bonus_rate numeric(6, 5) not null default 0.10,
  add column challenge_bond_amount numeric(20, 6) not null default 1.00,
  add column listing_fee_amount numeric(20, 6) not null default 0.50,
  add column provisional_outcome public.resolution_outcome,
  add column provisional_resolved_at timestamptz,
  add column resolution_window_ends_at timestamptz,
  add column final_outcome_changed_by_challenge boolean not null default false;

alter table public.markets
  add constraint markets_resolution_mode_check
  check (resolution_mode in ('admin', 'community'));

alter table public.markets
  add constraint markets_challenge_bonus_rate_check
  check (challenge_bonus_rate >= 0 and challenge_bonus_rate <= 1);

alter table public.markets
  add constraint markets_challenge_bond_amount_check
  check (challenge_bond_amount >= 0);

alter table public.markets
  add constraint markets_listing_fee_amount_check
  check (listing_fee_amount >= 0);

alter table public.market_disputes
  add column challenge_bond_amount numeric(20, 6) not null default 1.00,
  add column proposed_outcome public.resolution_outcome,
  add column is_successful boolean not null default false,
  add column success_group_id uuid,
  add column payout_bonus_amount numeric(20, 6) not null default 0,
  add column settled_at timestamptz;

alter table public.market_disputes
  add constraint market_disputes_challenge_bond_amount_check
  check (challenge_bond_amount >= 0);

create table public.market_resolver_bonds (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome public.resolution_outcome not null,
  bond_amount numeric(20, 6) not null check (bond_amount > 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  is_correct boolean,
  payout_amount numeric(20, 6) not null default 0,
  unique (market_id, user_id),
  check (outcome in ('yes', 'no'))
);

create index market_resolver_bonds_market_idx on public.market_resolver_bonds (market_id);
create index market_resolver_bonds_market_outcome_idx on public.market_resolver_bonds (market_id, outcome);

create table public.market_resolution_settlements (
  market_id uuid primary key references public.markets(id) on delete cascade,
  settlement_pot_p numeric(20, 6) not null default 0,
  resolution_fee_component numeric(20, 6) not null default 0,
  listing_fee_component numeric(20, 6) not null default 0,
  slashed_resolver_component numeric(20, 6) not null default 0,
  slashed_challenger_component numeric(20, 6) not null default 0,
  resolver_pool_r numeric(20, 6) not null default 0,
  challenge_bonus_b numeric(20, 6) not null default 0,
  resolver_pool_r_prime numeric(20, 6) not null default 0,
  correct_resolver_bond_total_sc numeric(20, 6) not null default 0,
  wrong_resolver_bond_total_sw numeric(20, 6) not null default 0,
  successful_challenger_bond_total numeric(20, 6) not null default 0,
  finalized_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter type public.ledger_entry_type add value if not exists 'market_listing_fee';
alter type public.ledger_entry_type add value if not exists 'resolver_bond_lock';
alter type public.ledger_entry_type add value if not exists 'resolver_bond_return';
alter type public.ledger_entry_type add value if not exists 'resolver_bond_slash';
alter type public.ledger_entry_type add value if not exists 'resolver_reward';
alter type public.ledger_entry_type add value if not exists 'challenge_bond_lock';
alter type public.ledger_entry_type add value if not exists 'challenge_bond_return';
alter type public.ledger_entry_type add value if not exists 'challenge_bond_slash';
alter type public.ledger_entry_type add value if not exists 'challenge_success_bonus';
alter type public.ledger_entry_type add value if not exists 'resolution_fee_carveout';
alter type public.ledger_entry_type add value if not exists 'resolution_pool_treasury_carry';

alter table public.market_resolver_bonds enable row level security;
alter table public.market_resolution_settlements enable row level security;

create policy market_resolver_bonds_select_own_or_admin
on public.market_resolver_bonds
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy market_resolver_bonds_insert_own_or_admin
on public.market_resolver_bonds
for insert
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy market_resolver_bonds_update_admin
on public.market_resolver_bonds
for update
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy market_resolution_settlements_admin_only
on public.market_resolution_settlements
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create or replace function public.sync_market_close_state(
  p_market_id uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_updated integer := 0;
begin
  if p_market_id is null then
    update public.markets
    set status = 'closed'
    where status = 'open'
      and close_time is not null
      and close_time <= now();

    get diagnostics v_updated = row_count;
    return v_updated;
  end if;

  update public.markets
  set status = 'closed'
  where id = p_market_id
    and status = 'open'
    and close_time is not null
    and close_time <= now();

  get diagnostics v_updated = row_count;
  return v_updated;
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
    resolution_mode,
    provisional_outcome,
    resolution_window_ends_at,
    resolved_at,
    resolution_outcome,
    finalized_at
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
      'provisionalOutcome', v_market.provisional_outcome,
      'resolutionWindowEndsAt', v_market.resolution_window_ends_at,
      'resolvedAt', v_market.resolved_at,
      'finalizedAt', v_market.finalized_at,
      'changed', false
    );
  end if;

  select
    coalesce(sum(case when outcome = 'yes' then bond_amount else 0 end), 0),
    coalesce(sum(case when outcome = 'no' then bond_amount else 0 end), 0)
  into v_yes_total, v_no_total
  from public.market_resolver_bonds
  where market_id = p_market_id;

  if v_yes_total > v_no_total then
    v_provisional := 'yes';
  elsif v_no_total > v_yes_total then
    v_provisional := 'no';
  else
    v_provisional := null;
  end if;

  if v_market.status = 'closed' and (v_yes_total > 0 or v_no_total > 0) then
    v_window_ends := coalesce(v_market.resolution_window_ends_at, v_now + make_interval(hours => p_resolution_window_hours));

    update public.markets
    set
      status = 'pending_resolution',
      resolution_window_ends_at = v_window_ends,
      provisional_outcome = v_provisional
    where id = p_market_id;

    select
      id,
      status,
      resolution_mode,
      provisional_outcome,
      resolution_window_ends_at,
      resolved_at,
      resolution_outcome,
      finalized_at
    into v_market
    from public.markets
    where id = p_market_id
    for update;
  elsif v_provisional is distinct from v_market.provisional_outcome then
    update public.markets
    set provisional_outcome = v_provisional
    where id = p_market_id;

    v_market.provisional_outcome := v_provisional;
  end if;

  if v_market.status = 'pending_resolution'
    and v_market.resolution_window_ends_at is not null
    and v_now >= v_market.resolution_window_ends_at
    and v_market.provisional_outcome in ('yes', 'no')
  then
    update public.markets
    set
      status = 'resolved',
      resolution_outcome = v_market.provisional_outcome,
      resolved_at = coalesce(resolved_at, v_now),
      provisional_resolved_at = coalesce(provisional_resolved_at, v_now)
    where id = p_market_id;

    select
      id,
      status,
      resolution_mode,
      provisional_outcome,
      resolution_window_ends_at,
      resolved_at,
      resolution_outcome,
      finalized_at
    into v_market
    from public.markets
    where id = p_market_id
    for update;
  end if;

  return jsonb_build_object(
    'marketId', v_market.id,
    'status', v_market.status,
    'provisionalOutcome', v_market.provisional_outcome,
    'resolutionWindowEndsAt', v_market.resolution_window_ends_at,
    'resolvedAt', v_market.resolved_at,
    'finalizedAt', v_market.finalized_at,
    'yesBondTotal', v_yes_total,
    'noBondTotal', v_no_total,
    'changed', true
  );
end;
$$;

create or replace function public.sync_due_community_resolutions(
  p_resolution_window_hours integer default 24
)
returns integer
language plpgsql
as $$
declare
  v_market record;
  v_processed integer := 0;
begin
  if p_resolution_window_hours is null or p_resolution_window_hours <= 0 then
    p_resolution_window_hours := 24;
  end if;

  perform public.sync_market_close_state(null);

  for v_market in
    select id
    from public.markets
    where resolution_mode = 'community'
      and status in ('closed', 'pending_resolution')
  loop
    perform public.refresh_community_market_resolution_state(v_market.id, p_resolution_window_hours);
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

create or replace function public.apply_market_listing_fee(
  p_market_id uuid,
  p_user_id uuid,
  p_amount numeric default 0.50
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_wallet record;
  v_existing_ledger record;
  v_fee numeric := round(coalesce(p_amount, 0.50), 6);
  v_wallet_available numeric := 0;
  v_key text;
begin
  if p_market_id is null then
    raise exception '[LISTING_VALIDATION] market id is required.';
  end if;

  if p_user_id is null then
    raise exception '[LISTING_FORBIDDEN] user id is required.';
  end if;

  if v_fee < 0 then
    raise exception '[LISTING_VALIDATION] listing fee cannot be negative.';
  end if;

  v_key := format('market-listing-fee:%s', p_market_id::text);

  select id, wallet_account_id
  into v_existing_ledger
  from public.ledger_entries
  where idempotency_key = v_key
  limit 1;

  if found then
    select id, available_balance
    into v_wallet
    from public.wallet_accounts
    where id = v_existing_ledger.wallet_account_id;

    return jsonb_build_object(
      'reused', true,
      'marketId', p_market_id,
      'walletAccountId', v_wallet.id,
      'walletAvailableBalance', coalesce(v_wallet.available_balance, 0),
      'amount', v_fee
    );
  end if;

  select id, creator_id
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[LISTING_NOT_FOUND] market not found.';
  end if;

  if v_market.creator_id <> p_user_id then
    raise exception '[LISTING_FORBIDDEN] only the creator can be charged listing fees for this market.';
  end if;

  if v_fee = 0 then
    return jsonb_build_object(
      'reused', false,
      'marketId', p_market_id,
      'amount', v_fee,
      'walletAvailableBalance', null
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

  if coalesce(v_wallet.available_balance, 0) < v_fee then
    raise exception '[LISTING_FUNDS] insufficient wallet balance for market listing fee.';
  end if;

  update public.wallet_accounts
  set available_balance = coalesce(available_balance, 0) - v_fee
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
    'market_listing_fee'::public.ledger_entry_type,
    -v_fee,
    'USD',
    v_key,
    'markets',
    p_market_id,
    jsonb_build_object(
      'marketId', p_market_id,
      'feeAmount', v_fee,
      'stage', 'submit_review'
    )
  );

  return jsonb_build_object(
    'reused', false,
    'marketId', p_market_id,
    'walletAccountId', v_wallet.id,
    'walletAvailableBalance', v_wallet_available,
    'amount', v_fee
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

  if v_bond_amount <= 0 then
    raise exception '[RESOLVE_VALIDATION] resolver bond amount must be greater than zero.';
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
    finalized_at,
    provisional_outcome,
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

  if v_market.status = 'resolved' then
    raise exception '[RESOLVE_CONFLICT] market is already resolved.';
  end if;

  if v_market.status not in ('closed', 'pending_resolution') then
    raise exception '[RESOLVE_CONFLICT] resolver bonds are only accepted after close and before resolution lock.';
  end if;

  select id, outcome, bond_amount, created_at
  into v_existing_bond
  from public.market_resolver_bonds
  where market_id = p_market_id
    and user_id = p_user_id
  for update;

  if found then
    perform public.refresh_community_market_resolution_state(p_market_id, p_resolution_window_hours);

    select
      coalesce(sum(case when outcome = 'yes' then bond_amount else 0 end), 0),
      coalesce(sum(case when outcome = 'no' then bond_amount else 0 end), 0)
    into v_yes_total, v_no_total
    from public.market_resolver_bonds
    where market_id = p_market_id;

    select
      id,
      status,
      provisional_outcome,
      resolution_window_ends_at
    into v_market
    from public.markets
    where id = p_market_id;

    return jsonb_build_object(
      'reused', true,
      'marketId', p_market_id,
      'bondId', v_existing_bond.id,
      'status', v_market.status,
      'outcome', v_existing_bond.outcome,
      'bondAmount', v_existing_bond.bond_amount,
      'provisionalOutcome', v_market.provisional_outcome,
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
      'bondAmount', v_bond_amount
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

  select
    id,
    status,
    provisional_outcome,
    resolution_window_ends_at
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
    'provisionalOutcome', v_market.provisional_outcome,
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
  p_dispute_window_hours integer default 48
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_wallet record;
  v_dispute record;
  v_reason text := trim(coalesce(p_reason, ''));
  v_now timestamptz := now();
  v_expires_at timestamptz;
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

  if p_dispute_window_hours is null or p_dispute_window_hours <= 0 then
    p_dispute_window_hours := 48;
  end if;

  select
    id,
    status,
    resolution_mode,
    resolved_at,
    finalized_at,
    challenge_bond_amount
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[CHALLENGE_NOT_FOUND] market not found.';
  end if;

  if v_market.status <> 'resolved' then
    raise exception '[CHALLENGE_CONFLICT] market must be resolved before challenges can be submitted.';
  end if;

  if v_market.finalized_at is not null then
    raise exception '[CHALLENGE_CONFLICT] market is already finalized.';
  end if;

  if v_market.resolved_at is null then
    raise exception '[CHALLENGE_CONFLICT] resolved timestamp is missing for this market.';
  end if;

  v_expires_at := v_market.resolved_at + make_interval(hours => p_dispute_window_hours);

  if v_now > v_expires_at then
    raise exception '[CHALLENGE_CONFLICT] dispute window has closed for this market.';
  end if;

  select id, status, expires_at, created_at, challenge_bond_amount, proposed_outcome
  into v_dispute
  from public.market_disputes
  where market_id = p_market_id
    and created_by = p_user_id
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

  if v_market.resolution_mode = 'community' then
    if p_proposed_outcome is null or p_proposed_outcome not in ('yes', 'no') then
      raise exception '[CHALLENGE_VALIDATION] proposed outcome must be yes or no for community resolution markets.';
    end if;

    v_bond_amount := round(coalesce(v_market.challenge_bond_amount, 1), 6);

    if v_bond_amount <= 0 then
      raise exception '[CHALLENGE_VALIDATION] challenge bond amount must be positive for community resolution markets.';
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

    v_lock_key := format('challenge-bond-lock:%s:%s', p_market_id::text, p_user_id::text);

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
        'proposedOutcome', p_proposed_outcome,
        'bondAmount', v_bond_amount
      )
    );
  else
    v_bond_amount := 0;
    p_proposed_outcome := null;
  end if;

  insert into public.market_disputes (
    market_id,
    created_by,
    status,
    reason,
    expires_at,
    challenge_bond_amount,
    proposed_outcome
  )
  values (
    p_market_id,
    p_user_id,
    'open'::public.dispute_status,
    v_reason,
    v_expires_at,
    v_bond_amount,
    p_proposed_outcome
  )
  returning id, status, expires_at, created_at, challenge_bond_amount, proposed_outcome
  into v_dispute;

  return jsonb_build_object(
    'reused', false,
    'marketId', p_market_id,
    'disputeId', v_dispute.id,
    'status', v_dispute.status,
    'expiresAt', v_dispute.expires_at,
    'createdAt', v_dispute.created_at,
    'challengeBondAmount', v_dispute.challenge_bond_amount,
    'proposedOutcome', v_dispute.proposed_outcome,
    'walletAvailableBalance', case when v_market.resolution_mode = 'community' then v_wallet_available else null end
  );
end;
$$;

create or replace function public.admin_adjudicate_market_challenge(
  p_market_id uuid,
  p_dispute_id uuid,
  p_admin_user_id uuid,
  p_status public.dispute_status,
  p_notes text default null,
  p_success_group_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_dispute record;
  v_now timestamptz := now();
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if p_market_id is null then
    raise exception '[CHALLENGE_VALIDATION] market id is required.';
  end if;

  if p_dispute_id is null then
    raise exception '[CHALLENGE_VALIDATION] dispute id is required.';
  end if;

  if p_admin_user_id is null then
    raise exception '[CHALLENGE_FORBIDDEN] admin user id is required.';
  end if;

  if p_status not in ('upheld', 'rejected', 'under_review') then
    raise exception '[CHALLENGE_VALIDATION] status must be upheld, rejected, or under_review.';
  end if;

  select id, status, finalized_at
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[CHALLENGE_NOT_FOUND] market not found.';
  end if;

  if v_market.finalized_at is not null then
    raise exception '[CHALLENGE_CONFLICT] market is already finalized.';
  end if;

  select id, status, challenge_bond_amount, proposed_outcome, created_by, success_group_id
  into v_dispute
  from public.market_disputes
  where id = p_dispute_id
    and market_id = p_market_id
  for update;

  if not found then
    raise exception '[CHALLENGE_NOT_FOUND] dispute not found for this market.';
  end if;

  if v_dispute.status = p_status then
    return jsonb_build_object(
      'reused', true,
      'marketId', p_market_id,
      'disputeId', p_dispute_id,
      'status', v_dispute.status,
      'proposedOutcome', v_dispute.proposed_outcome
    );
  end if;

  update public.market_disputes
  set
    status = p_status,
    adjudicated_by = p_admin_user_id,
    adjudication_notes = v_notes,
    adjudicated_at = v_now,
    success_group_id = case
      when p_status = 'upheld' then coalesce(success_group_id, p_success_group_id, gen_random_uuid())
      else null
    end
  where id = p_dispute_id
  returning id, status, proposed_outcome, challenge_bond_amount, success_group_id, adjudicated_at
  into v_dispute;

  insert into public.admin_action_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_admin_user_id,
    'market_challenge_adjudicate',
    'market_dispute',
    p_dispute_id,
    jsonb_build_object(
      'marketId', p_market_id,
      'status', p_status,
      'notes', v_notes,
      'proposedOutcome', v_dispute.proposed_outcome
    )
  );

  return jsonb_build_object(
    'reused', false,
    'marketId', p_market_id,
    'disputeId', v_dispute.id,
    'status', v_dispute.status,
    'proposedOutcome', v_dispute.proposed_outcome,
    'challengeBondAmount', v_dispute.challenge_bond_amount,
    'successGroupId', v_dispute.success_group_id,
    'adjudicatedAt', v_dispute.adjudicated_at
  );
end;
$$;

create or replace function public.admin_resolve_market(
  p_market_id uuid,
  p_resolver_id uuid,
  p_outcome public.resolution_outcome,
  p_notes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_now timestamptz := now();
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if p_market_id is null then
    raise exception '[RESOLVE_VALIDATION] market id is required.';
  end if;

  if p_resolver_id is null then
    raise exception '[RESOLVE_FORBIDDEN] resolver id is required.';
  end if;

  if p_outcome is null then
    raise exception '[RESOLVE_VALIDATION] outcome is required.';
  end if;

  perform public.sync_market_close_state(p_market_id);

  select
    id,
    status,
    close_time,
    resolution_outcome,
    provisional_outcome,
    resolution_mode,
    resolved_at,
    finalized_at
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

  if v_market.status in ('draft', 'review') then
    raise exception '[RESOLVE_CONFLICT] market must be approved before resolution.';
  end if;

  if v_market.close_time is not null and v_market.close_time > v_now then
    raise exception '[RESOLVE_CONFLICT] market cannot be resolved before close time.';
  end if;

  if v_market.resolution_mode = 'community' then
    if p_outcome = 'void' then
      raise exception '[RESOLVE_VALIDATION] void outcome is not supported for community resolution markets.';
    end if;

    perform public.refresh_community_market_resolution_state(p_market_id, 24);

    select
      id,
      status,
      close_time,
      resolution_outcome,
      provisional_outcome,
      resolution_mode,
      resolved_at,
      finalized_at
    into v_market
    from public.markets
    where id = p_market_id
    for update;

    if v_market.status = 'resolved' and v_market.resolution_outcome = p_outcome then
      return jsonb_build_object(
        'reused', true,
        'marketId', v_market.id,
        'status', v_market.status,
        'outcome', v_market.resolution_outcome,
        'resolvedAt', v_market.resolved_at,
        'resolutionMode', v_market.resolution_mode,
        'provisionalOutcome', v_market.provisional_outcome
      );
    end if;

    if v_market.status not in ('closed', 'pending_resolution', 'resolved', 'trading_halted') then
      raise exception '[RESOLVE_CONFLICT] market is not ready for resolution.';
    end if;

    update public.markets
    set
      status = 'resolved',
      resolver_id = p_resolver_id,
      provisional_outcome = coalesce(v_market.provisional_outcome, p_outcome),
      resolution_outcome = p_outcome,
      resolution_notes = v_notes,
      resolved_at = v_now,
      provisional_resolved_at = coalesce(provisional_resolved_at, v_now)
    where id = p_market_id
    returning id, status, resolution_outcome, resolved_at, resolution_mode, provisional_outcome
    into v_market;
  else
    if v_market.status = 'resolved' and v_market.resolution_outcome = p_outcome then
      return jsonb_build_object(
        'reused', true,
        'marketId', v_market.id,
        'status', v_market.status,
        'outcome', v_market.resolution_outcome,
        'resolvedAt', v_market.resolved_at,
        'resolutionMode', v_market.resolution_mode,
        'provisionalOutcome', v_market.provisional_outcome
      );
    end if;

    update public.markets
    set
      status = 'resolved',
      resolver_id = p_resolver_id,
      resolution_outcome = p_outcome,
      resolution_notes = v_notes,
      resolved_at = v_now
    where id = p_market_id
    returning id, status, resolution_outcome, resolved_at, resolution_mode, provisional_outcome
    into v_market;
  end if;

  insert into public.admin_action_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_resolver_id,
    'market_resolve',
    'market',
    p_market_id,
    jsonb_build_object(
      'outcome', p_outcome,
      'notes', v_notes,
      'resolutionMode', v_market.resolution_mode,
      'provisionalOutcome', v_market.provisional_outcome
    )
  );

  return jsonb_build_object(
    'reused', false,
    'marketId', v_market.id,
    'status', v_market.status,
    'outcome', v_market.resolution_outcome,
    'resolvedAt', v_market.resolved_at,
    'resolutionMode', v_market.resolution_mode,
    'provisionalOutcome', v_market.provisional_outcome
  );
end;
$$;

create or replace function public.admin_finalize_community_market(
  p_market_id uuid,
  p_admin_user_id uuid,
  p_dispute_window_hours integer default 48
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_now timestamptz := now();
  v_window_ends timestamptz;
  v_position record;
  v_resolver_bond record;
  v_dispute record;
  v_final_outcome public.resolution_outcome;
  v_final_changed_by_challenge boolean := false;
  v_upheld_yes_total numeric := 0;
  v_upheld_no_total numeric := 0;
  v_settlement_p numeric := 0;
  v_resolution_fee_component numeric := 0;
  v_listing_fee_component numeric := 0;
  v_slashed_resolver_component numeric := 0;
  v_slashed_challenger_component numeric := 0;
  v_resolver_pool_r numeric := 0;
  v_challenge_bonus_b numeric := 0;
  v_resolver_pool_r_prime numeric := 0;
  v_correct_resolver_bond_total_sc numeric := 0;
  v_wrong_resolver_bond_total_sw numeric := 0;
  v_successful_challenger_bond_total numeric := 0;
  v_base_payout numeric := 0;
  v_payout numeric := 0;
  v_payout_ratio numeric := 1;
  v_cost numeric := 0;
  v_delta_pnl numeric := 0;
  v_settlement_key text;
  v_resolver_return_key text;
  v_resolver_reward_key text;
  v_resolver_slash_key text;
  v_challenge_return_key text;
  v_challenge_bonus_key text;
  v_challenge_slash_key text;
  v_treasury_key text;
  v_resolver_reward_share numeric := 0;
  v_challenge_bonus_share numeric := 0;
  v_success_group_id uuid;
begin
  if p_market_id is null then
    raise exception '[FINALIZE_VALIDATION] market id is required.';
  end if;

  if p_admin_user_id is null then
    raise exception '[FINALIZE_FORBIDDEN] admin user id is required.';
  end if;

  if p_dispute_window_hours is null or p_dispute_window_hours <= 0 then
    p_dispute_window_hours := 48;
  end if;

  select
    id,
    status,
    resolution_mode,
    resolved_at,
    finalized_at,
    resolution_outcome,
    provisional_outcome,
    challenge_bonus_rate,
    listing_fee_amount
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
      'finalizedAt', coalesce(v_market.finalized_at, v_now),
      'resolutionMode', v_market.resolution_mode
    );
  end if;

  if v_market.resolution_mode <> 'community' then
    raise exception '[FINALIZE_CONFLICT] market is not configured for community finalization.';
  end if;

  if v_market.status <> 'resolved' then
    raise exception '[FINALIZE_CONFLICT] market must be resolved before finalization.';
  end if;

  if v_market.resolved_at is null then
    raise exception '[FINALIZE_CONFLICT] resolved_at timestamp missing.';
  end if;

  v_window_ends := v_market.resolved_at + make_interval(hours => p_dispute_window_hours);
  if v_now < v_window_ends then
    raise exception '[FINALIZE_CONFLICT] dispute window still open.';
  end if;

  update public.market_disputes
  set
    status = 'expired',
    adjudicated_by = p_admin_user_id,
    adjudication_notes = 'expired by finalize',
    adjudicated_at = v_now
  where market_id = p_market_id
    and status = 'open'
    and expires_at <= v_now;

  if exists (
    select 1
    from public.market_disputes d
    where d.market_id = p_market_id
      and d.status in ('open', 'under_review')
      and d.expires_at > v_now
  ) then
    raise exception '[FINALIZE_CONFLICT] unresolved disputes still open.';
  end if;

  select
    coalesce(sum(case when status = 'upheld' and proposed_outcome = 'yes' then challenge_bond_amount else 0 end), 0),
    coalesce(sum(case when status = 'upheld' and proposed_outcome = 'no' then challenge_bond_amount else 0 end), 0)
  into v_upheld_yes_total, v_upheld_no_total
  from public.market_disputes
  where market_id = p_market_id;

  if v_upheld_yes_total > v_upheld_no_total then
    v_final_outcome := 'yes';
  elsif v_upheld_no_total > v_upheld_yes_total then
    v_final_outcome := 'no';
  else
    v_final_outcome := case
      when v_market.resolution_outcome in ('yes', 'no') then v_market.resolution_outcome
      when v_market.provisional_outcome in ('yes', 'no') then v_market.provisional_outcome
      else null
    end;
  end if;

  if v_final_outcome not in ('yes', 'no') then
    raise exception '[FINALIZE_CONFLICT] final outcome missing for community settlement.';
  end if;

  v_final_changed_by_challenge := (
    v_market.provisional_outcome in ('yes', 'no')
    and v_market.provisional_outcome <> v_final_outcome
  );

  if v_final_outcome = 'yes' then
    select coalesce(sum(coalesce(yes_shares, 0)), 0)
    into v_settlement_p
    from public.positions
    where market_id = p_market_id;
  else
    select coalesce(sum(coalesce(no_shares, 0)), 0)
    into v_settlement_p
    from public.positions
    where market_id = p_market_id;
  end if;

  v_resolution_fee_component := round(v_settlement_p * 0.005, 6);
  v_listing_fee_component := round(coalesce(v_market.listing_fee_amount, 0.50), 6);

  if v_settlement_p > 0 then
    v_payout_ratio := greatest(0, (v_settlement_p - v_resolution_fee_component) / v_settlement_p);
  else
    v_payout_ratio := 1;
  end if;

  for v_position in
    select
      id,
      user_id,
      yes_shares,
      no_shares,
      average_entry_price_yes,
      average_entry_price_no,
      realized_pnl
    from public.positions
    where market_id = p_market_id
      and (coalesce(yes_shares, 0) > 0 or coalesce(no_shares, 0) > 0)
    for update
  loop
    v_base_payout := case
      when v_final_outcome = 'yes' then coalesce(v_position.yes_shares, 0)
      when v_final_outcome = 'no' then coalesce(v_position.no_shares, 0)
      else 0
    end;

    v_payout := round(v_base_payout * v_payout_ratio, 6);

    v_cost := (coalesce(v_position.average_entry_price_yes, 0) * coalesce(v_position.yes_shares, 0))
      + (coalesce(v_position.average_entry_price_no, 0) * coalesce(v_position.no_shares, 0));

    v_delta_pnl := round(v_payout - v_cost, 6);

    v_settlement_key := format('settlement:%s:%s', p_market_id::text, v_position.user_id::text);

    if v_payout > 0 then
      perform public.apply_wallet_credit(
        v_position.user_id,
        v_payout,
        'settlement_payout'::public.ledger_entry_type,
        v_settlement_key,
        'markets',
        p_market_id,
        jsonb_build_object(
          'marketId', p_market_id,
          'outcome', v_final_outcome,
          'payout', v_payout,
          'payoutRatio', v_payout_ratio,
          'basePayout', v_base_payout,
          'yesShares', coalesce(v_position.yes_shares, 0),
          'noShares', coalesce(v_position.no_shares, 0)
        )
      );
    end if;

    update public.positions
    set
      yes_shares = 0,
      no_shares = 0,
      average_entry_price_yes = null,
      average_entry_price_no = null,
      realized_pnl = coalesce(realized_pnl, 0) + v_delta_pnl
    where id = v_position.id;
  end loop;

  select
    coalesce(sum(case when outcome = v_final_outcome then bond_amount else 0 end), 0),
    coalesce(sum(case when outcome <> v_final_outcome then bond_amount else 0 end), 0)
  into v_correct_resolver_bond_total_sc, v_wrong_resolver_bond_total_sw
  from public.market_resolver_bonds
  where market_id = p_market_id;

  v_slashed_resolver_component := round(v_wrong_resolver_bond_total_sw, 6);

  select coalesce(sum(challenge_bond_amount), 0)
  into v_slashed_challenger_component
  from public.market_disputes
  where market_id = p_market_id
    and status = 'rejected';

  if v_final_changed_by_challenge then
    select coalesce(sum(challenge_bond_amount), 0)
    into v_successful_challenger_bond_total
    from public.market_disputes
    where market_id = p_market_id
      and status = 'upheld'
      and proposed_outcome = v_final_outcome;
  else
    v_successful_challenger_bond_total := 0;
  end if;

  v_resolver_pool_r := round(v_resolution_fee_component + v_listing_fee_component + v_slashed_resolver_component + v_slashed_challenger_component, 6);

  if v_successful_challenger_bond_total > 0 then
    v_challenge_bonus_b := round(coalesce(v_market.challenge_bonus_rate, 0.10) * v_resolver_pool_r, 6);
  else
    v_challenge_bonus_b := 0;
  end if;

  v_resolver_pool_r_prime := round(v_resolver_pool_r - v_challenge_bonus_b, 6);

  if v_successful_challenger_bond_total > 0 and v_success_group_id is null then
    v_success_group_id := gen_random_uuid();
  end if;

  for v_dispute in
    select
      id,
      created_by,
      status,
      proposed_outcome,
      challenge_bond_amount,
      settled_at,
      success_group_id
    from public.market_disputes
    where market_id = p_market_id
      and status in ('upheld', 'rejected')
    for update
  loop
    if v_dispute.settled_at is not null then
      continue;
    end if;

    if v_dispute.status = 'rejected' then
      v_challenge_slash_key := format('challenge-slash:%s', v_dispute.id::text);

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
        v_dispute.created_by,
        null,
        'challenge_bond_slash'::public.ledger_entry_type,
        0,
        'USD',
        v_challenge_slash_key,
        'market_disputes',
        v_dispute.id,
        jsonb_build_object(
          'marketId', p_market_id,
          'disputeId', v_dispute.id,
          'bondAmount', coalesce(v_dispute.challenge_bond_amount, 0)
        )
      )
      on conflict (idempotency_key) do nothing;

      update public.market_disputes
      set
        settled_at = v_now,
        is_successful = false,
        payout_bonus_amount = 0,
        success_group_id = null
      where id = v_dispute.id;

      continue;
    end if;

    v_challenge_bonus_share := 0;
    if v_final_changed_by_challenge
      and v_successful_challenger_bond_total > 0
      and v_dispute.proposed_outcome = v_final_outcome
    then
      v_challenge_bonus_share := round((coalesce(v_dispute.challenge_bond_amount, 0) / v_successful_challenger_bond_total) * v_challenge_bonus_b, 6);
    end if;

    v_challenge_return_key := format('challenge-return:%s', v_dispute.id::text);
    if coalesce(v_dispute.challenge_bond_amount, 0) > 0 then
      perform public.apply_wallet_credit(
        v_dispute.created_by,
        v_dispute.challenge_bond_amount,
        'challenge_bond_return'::public.ledger_entry_type,
        v_challenge_return_key,
        'market_disputes',
        v_dispute.id,
        jsonb_build_object(
          'marketId', p_market_id,
          'disputeId', v_dispute.id,
          'bondAmount', v_dispute.challenge_bond_amount
        )
      );
    end if;

    if v_challenge_bonus_share > 0 then
      v_challenge_bonus_key := format('challenge-bonus:%s', v_dispute.id::text);
      perform public.apply_wallet_credit(
        v_dispute.created_by,
        v_challenge_bonus_share,
        'challenge_success_bonus'::public.ledger_entry_type,
        v_challenge_bonus_key,
        'market_disputes',
        v_dispute.id,
        jsonb_build_object(
          'marketId', p_market_id,
          'disputeId', v_dispute.id,
          'bonusAmount', v_challenge_bonus_share,
          'poolBonus', v_challenge_bonus_b
        )
      );
    end if;

    update public.market_disputes
    set
      settled_at = v_now,
      is_successful = v_challenge_bonus_share > 0,
      payout_bonus_amount = v_challenge_bonus_share,
      success_group_id = case
        when v_challenge_bonus_share > 0 then coalesce(v_dispute.success_group_id, v_success_group_id)
        else null
      end
    where id = v_dispute.id;
  end loop;

  for v_resolver_bond in
    select
      id,
      user_id,
      outcome,
      bond_amount,
      settled_at
    from public.market_resolver_bonds
    where market_id = p_market_id
    for update
  loop
    if v_resolver_bond.settled_at is not null then
      continue;
    end if;

    if v_resolver_bond.outcome = v_final_outcome then
      if v_correct_resolver_bond_total_sc > 0 then
        v_resolver_reward_share := round((v_resolver_bond.bond_amount / v_correct_resolver_bond_total_sc) * v_resolver_pool_r_prime, 6);
      else
        v_resolver_reward_share := 0;
      end if;

      v_resolver_return_key := format('resolver-return:%s', v_resolver_bond.id::text);
      perform public.apply_wallet_credit(
        v_resolver_bond.user_id,
        v_resolver_bond.bond_amount,
        'resolver_bond_return'::public.ledger_entry_type,
        v_resolver_return_key,
        'market_resolver_bonds',
        v_resolver_bond.id,
        jsonb_build_object(
          'marketId', p_market_id,
          'bondId', v_resolver_bond.id,
          'bondAmount', v_resolver_bond.bond_amount
        )
      );

      if v_resolver_reward_share > 0 then
        v_resolver_reward_key := format('resolver-reward:%s', v_resolver_bond.id::text);
        perform public.apply_wallet_credit(
          v_resolver_bond.user_id,
          v_resolver_reward_share,
          'resolver_reward'::public.ledger_entry_type,
          v_resolver_reward_key,
          'market_resolver_bonds',
          v_resolver_bond.id,
          jsonb_build_object(
            'marketId', p_market_id,
            'bondId', v_resolver_bond.id,
            'rewardShare', v_resolver_reward_share,
            'resolverPoolPrime', v_resolver_pool_r_prime
          )
        );
      end if;

      update public.market_resolver_bonds
      set
        settled_at = v_now,
        is_correct = true,
        payout_amount = round(v_resolver_bond.bond_amount + v_resolver_reward_share, 6)
      where id = v_resolver_bond.id;
    else
      v_resolver_slash_key := format('resolver-slash:%s', v_resolver_bond.id::text);
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
        v_resolver_bond.user_id,
        null,
        'resolver_bond_slash'::public.ledger_entry_type,
        0,
        'USD',
        v_resolver_slash_key,
        'market_resolver_bonds',
        v_resolver_bond.id,
        jsonb_build_object(
          'marketId', p_market_id,
          'bondId', v_resolver_bond.id,
          'bondAmount', v_resolver_bond.bond_amount
        )
      )
      on conflict (idempotency_key) do nothing;

      update public.market_resolver_bonds
      set
        settled_at = v_now,
        is_correct = false,
        payout_amount = 0
      where id = v_resolver_bond.id;
    end if;
  end loop;

  if v_correct_resolver_bond_total_sc <= 0 and v_resolver_pool_r_prime > 0 then
    v_treasury_key := format('resolution-treasury:%s', p_market_id::text);
    perform public.apply_wallet_credit(
      p_admin_user_id,
      v_resolver_pool_r_prime,
      'resolution_pool_treasury_carry'::public.ledger_entry_type,
      v_treasury_key,
      'markets',
      p_market_id,
      jsonb_build_object(
        'marketId', p_market_id,
        'resolverPoolPrime', v_resolver_pool_r_prime,
        'reason', 'no_correct_resolvers'
      )
    );
  end if;

  insert into public.market_resolution_settlements (
    market_id,
    settlement_pot_p,
    resolution_fee_component,
    listing_fee_component,
    slashed_resolver_component,
    slashed_challenger_component,
    resolver_pool_r,
    challenge_bonus_b,
    resolver_pool_r_prime,
    correct_resolver_bond_total_sc,
    wrong_resolver_bond_total_sw,
    successful_challenger_bond_total,
    finalized_at,
    metadata
  )
  values (
    p_market_id,
    v_settlement_p,
    v_resolution_fee_component,
    v_listing_fee_component,
    v_slashed_resolver_component,
    v_slashed_challenger_component,
    v_resolver_pool_r,
    v_challenge_bonus_b,
    v_resolver_pool_r_prime,
    v_correct_resolver_bond_total_sc,
    v_wrong_resolver_bond_total_sw,
    v_successful_challenger_bond_total,
    v_now,
    jsonb_build_object(
      'finalOutcome', v_final_outcome,
      'provisionalOutcome', v_market.provisional_outcome,
      'finalOutcomeChangedByChallenge', v_final_changed_by_challenge,
      'payoutRatio', v_payout_ratio,
      'challengeBonusRate', v_market.challenge_bonus_rate,
      'upheldYesBondTotal', v_upheld_yes_total,
      'upheldNoBondTotal', v_upheld_no_total
    )
  )
  on conflict (market_id) do update
  set
    settlement_pot_p = excluded.settlement_pot_p,
    resolution_fee_component = excluded.resolution_fee_component,
    listing_fee_component = excluded.listing_fee_component,
    slashed_resolver_component = excluded.slashed_resolver_component,
    slashed_challenger_component = excluded.slashed_challenger_component,
    resolver_pool_r = excluded.resolver_pool_r,
    challenge_bonus_b = excluded.challenge_bonus_b,
    resolver_pool_r_prime = excluded.resolver_pool_r_prime,
    correct_resolver_bond_total_sc = excluded.correct_resolver_bond_total_sc,
    wrong_resolver_bond_total_sw = excluded.wrong_resolver_bond_total_sw,
    successful_challenger_bond_total = excluded.successful_challenger_bond_total,
    finalized_at = excluded.finalized_at,
    metadata = excluded.metadata;

  update public.markets
  set
    status = 'finalized',
    resolution_outcome = v_final_outcome,
    finalized_at = v_now,
    final_outcome_changed_by_challenge = v_final_changed_by_challenge
  where id = p_market_id
  returning id, status, finalized_at, resolution_outcome, provisional_outcome
  into v_market;

  insert into public.admin_action_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_admin_user_id,
    'market_finalize',
    'market',
    p_market_id,
    jsonb_build_object(
      'resolutionMode', 'community',
      'finalizedAt', v_market.finalized_at,
      'finalOutcome', v_final_outcome,
      'finalOutcomeChangedByChallenge', v_final_changed_by_challenge,
      'settlementPotP', v_settlement_p,
      'resolverPoolR', v_resolver_pool_r,
      'challengeBonusB', v_challenge_bonus_b,
      'resolverPoolRPrime', v_resolver_pool_r_prime,
      'correctResolverBondTotal', v_correct_resolver_bond_total_sc,
      'wrongResolverBondTotal', v_wrong_resolver_bond_total_sw,
      'successfulChallengerBondTotal', v_successful_challenger_bond_total
    )
  );

  return jsonb_build_object(
    'reused', false,
    'marketId', v_market.id,
    'status', v_market.status,
    'finalizedAt', v_market.finalized_at,
    'resolutionMode', 'community',
    'finalOutcome', v_final_outcome,
    'provisionalOutcome', v_market.provisional_outcome,
    'finalOutcomeChangedByChallenge', v_final_changed_by_challenge,
    'settlement', jsonb_build_object(
      'P', v_settlement_p,
      'resolutionFeeComponent', v_resolution_fee_component,
      'listingFeeComponent', v_listing_fee_component,
      'slashedResolverComponent', v_slashed_resolver_component,
      'slashedChallengerComponent', v_slashed_challenger_component,
      'R', v_resolver_pool_r,
      'B', v_challenge_bonus_b,
      'RPrime', v_resolver_pool_r_prime,
      'SC', v_correct_resolver_bond_total_sc,
      'SW', v_wrong_resolver_bond_total_sw,
      'successfulChallengerBondTotal', v_successful_challenger_bond_total
    )
  );
end;
$$;

create or replace function public.admin_finalize_market(
  p_market_id uuid,
  p_admin_user_id uuid,
  p_dispute_window_hours integer default 48
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_now timestamptz := now();
  v_window_ends timestamptz;
  v_position record;
  v_wallet record;
  v_payout numeric := 0;
  v_cost numeric := 0;
  v_delta_pnl numeric := 0;
  v_settlement_key text;
  v_existing_ledger record;
  v_new_wallet_available numeric;
begin
  if p_market_id is null then
    raise exception '[FINALIZE_VALIDATION] market id is required.';
  end if;

  if p_admin_user_id is null then
    raise exception '[FINALIZE_FORBIDDEN] admin user id is required.';
  end if;

  if p_dispute_window_hours is null or p_dispute_window_hours <= 0 then
    p_dispute_window_hours := 48;
  end if;

  perform public.sync_market_close_state(p_market_id);
  perform public.refresh_community_market_resolution_state(p_market_id, 24);

  select
    id,
    status,
    resolution_mode,
    resolved_at,
    finalized_at,
    resolution_outcome
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
      'finalizedAt', coalesce(v_market.finalized_at, v_now),
      'resolutionMode', v_market.resolution_mode
    );
  end if;

  if v_market.status <> 'resolved' then
    raise exception '[FINALIZE_CONFLICT] market must be resolved before finalization.';
  end if;

  if v_market.resolved_at is null then
    raise exception '[FINALIZE_CONFLICT] resolved_at timestamp missing.';
  end if;

  if v_market.resolution_outcome is null then
    raise exception '[FINALIZE_CONFLICT] resolution outcome missing.';
  end if;

  v_window_ends := v_market.resolved_at + make_interval(hours => p_dispute_window_hours);
  if v_now < v_window_ends then
    raise exception '[FINALIZE_CONFLICT] dispute window still open.';
  end if;

  update public.market_disputes
  set
    status = 'expired',
    adjudicated_by = p_admin_user_id,
    adjudication_notes = 'expired by finalize',
    adjudicated_at = v_now
  where market_id = p_market_id
    and status = 'open'
    and expires_at <= v_now;

  if exists (
    select 1
    from public.market_disputes d
    where d.market_id = p_market_id
      and d.status in ('open', 'under_review')
      and d.expires_at > v_now
  ) then
    raise exception '[FINALIZE_CONFLICT] unresolved disputes still open.';
  end if;

  if v_market.resolution_mode = 'community' then
    return public.admin_finalize_community_market(
      p_market_id,
      p_admin_user_id,
      p_dispute_window_hours
    );
  end if;

  if v_market.resolution_outcome = 'void' then
    raise exception '[FINALIZE_CONFLICT] void settlement is not supported yet.';
  end if;

  for v_position in
    select
      id,
      user_id,
      yes_shares,
      no_shares,
      average_entry_price_yes,
      average_entry_price_no,
      realized_pnl
    from public.positions
    where market_id = p_market_id
      and (coalesce(yes_shares, 0) > 0 or coalesce(no_shares, 0) > 0)
    for update
  loop
    v_payout := case
      when v_market.resolution_outcome = 'yes' then coalesce(v_position.yes_shares, 0)
      when v_market.resolution_outcome = 'no' then coalesce(v_position.no_shares, 0)
      else 0
    end;

    v_cost := (coalesce(v_position.average_entry_price_yes, 0) * coalesce(v_position.yes_shares, 0))
      + (coalesce(v_position.average_entry_price_no, 0) * coalesce(v_position.no_shares, 0));

    v_delta_pnl := round(v_payout - v_cost, 6);

    select id, available_balance, reserved_balance
    into v_wallet
    from public.wallet_accounts
    where user_id = v_position.user_id
    for update;

    if not found then
      insert into public.wallet_accounts (
        user_id,
        currency,
        available_balance,
        reserved_balance
      )
      values (
        v_position.user_id,
        'USD',
        0,
        0
      )
      returning id, available_balance, reserved_balance
      into v_wallet;
    end if;

    v_settlement_key := format('settlement:%s:%s', p_market_id::text, v_position.user_id::text);

    select id
    into v_existing_ledger
    from public.ledger_entries
    where idempotency_key = v_settlement_key
    limit 1;

    if not found then
      if v_payout > 0 then
        update public.wallet_accounts
        set available_balance = coalesce(available_balance, 0) + v_payout
        where id = v_wallet.id
        returning available_balance
        into v_new_wallet_available;
      else
        v_new_wallet_available := coalesce(v_wallet.available_balance, 0);
      end if;

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
        v_position.user_id,
        v_wallet.id,
        'settlement_payout'::public.ledger_entry_type,
        v_payout,
        'USD',
        v_settlement_key,
        'markets',
        p_market_id,
        jsonb_build_object(
          'marketId', p_market_id,
          'outcome', v_market.resolution_outcome,
          'payout', v_payout,
          'yesShares', coalesce(v_position.yes_shares, 0),
          'noShares', coalesce(v_position.no_shares, 0)
        )
      );
    end if;

    update public.positions
    set
      yes_shares = 0,
      no_shares = 0,
      average_entry_price_yes = null,
      average_entry_price_no = null,
      realized_pnl = coalesce(realized_pnl, 0) + v_delta_pnl
    where id = v_position.id;
  end loop;

  update public.markets
  set
    status = 'finalized',
    finalized_at = v_now
  where id = p_market_id
  returning id, status, finalized_at
  into v_market;

  insert into public.admin_action_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_admin_user_id,
    'market_finalize',
    'market',
    p_market_id,
    jsonb_build_object(
      'finalizedAt', v_market.finalized_at,
      'resolutionMode', 'admin'
    )
  );

  return jsonb_build_object(
    'reused', false,
    'marketId', v_market.id,
    'status', v_market.status,
    'finalizedAt', v_market.finalized_at,
    'resolutionMode', 'admin'
  );
end;
$$;

grant execute on function public.sync_market_close_state(uuid) to service_role;
grant execute on function public.refresh_community_market_resolution_state(uuid, integer) to service_role;
grant execute on function public.sync_due_community_resolutions(integer) to service_role;
grant execute on function public.apply_market_listing_fee(uuid, uuid, numeric) to service_role;
grant execute on function public.submit_market_resolver_bond(uuid, uuid, public.resolution_outcome, numeric, integer) to service_role;
grant execute on function public.submit_market_dispute_challenge(uuid, uuid, text, public.resolution_outcome, integer) to service_role;
grant execute on function public.admin_adjudicate_market_challenge(uuid, uuid, uuid, public.dispute_status, text, uuid) to service_role;
grant execute on function public.admin_finalize_community_market(uuid, uuid, integer) to service_role;
grant execute on function public.admin_resolve_market(uuid, uuid, public.resolution_outcome, text) to service_role;
grant execute on function public.admin_finalize_market(uuid, uuid, integer) to service_role;
