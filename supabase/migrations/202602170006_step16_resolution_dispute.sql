-- Step 16: Resolution/dispute pipeline
-- - Admin resolve + finalize RPCs
-- - Dispute insert hardening (RLS + unique per user/market)
-- - Trading guardrails: prevent quote/execute after close_time

-- Harden dispute insert policy to prevent spoofing created_by and restrict disputes to resolved markets.
drop policy if exists market_disputes_insert_authenticated on public.market_disputes;

create policy market_disputes_insert_authenticated
on public.market_disputes
for insert
with check (
  auth.role() = 'authenticated'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.markets m
    where m.id = market_id
      and m.status = 'resolved'
      and m.finalized_at is null
      and m.resolved_at is not null
  )
);

create unique index if not exists market_disputes_unique_market_creator
  on public.market_disputes (market_id, created_by);

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

  select
    id,
    status,
    close_time,
    resolution_outcome,
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

  if v_market.status = 'resolved' and v_market.resolution_outcome = p_outcome then
    return jsonb_build_object(
      'reused', true,
      'marketId', v_market.id,
      'status', v_market.status,
      'outcome', v_market.resolution_outcome,
      'resolvedAt', v_market.resolved_at
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
  returning id, status, resolution_outcome, resolved_at
  into v_market;

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
      'notes', v_notes
    )
  );

  return jsonb_build_object(
    'reused', false,
    'marketId', v_market.id,
    'status', v_market.status,
    'outcome', v_market.resolution_outcome,
    'resolvedAt', v_market.resolved_at
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

  select
    id,
    status,
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
      'finalizedAt', coalesce(v_market.finalized_at, v_now)
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

  -- Expire any open disputes past their expires_at so they no longer block finalization.
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
      and d.status in ('open', 'under_review', 'upheld')
      and d.expires_at > v_now
  ) then
    raise exception '[FINALIZE_CONFLICT] unresolved disputes still open.';
  end if;

  -- Settlement payout: credit winners with 1 per winning share held at finalization.
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
      'finalizedAt', v_market.finalized_at
    )
  );

  return jsonb_build_object(
    'reused', false,
    'marketId', v_market.id,
    'status', v_market.status,
    'finalizedAt', v_market.finalized_at
  );
end;
$$;

grant execute on function public.admin_resolve_market(uuid, uuid, public.resolution_outcome, text) to service_role;
grant execute on function public.admin_finalize_market(uuid, uuid, integer) to service_role;

-- Trading guardrails: ensure quotes and executions reject after close_time.
create or replace function public.quote_market_trade(
  p_market_id uuid,
  p_side text,
  p_action text,
  p_shares numeric,
  p_max_slippage_bps integer default 500
)
returns jsonb
language plpgsql
as $$
declare
  v_market record;
  v_amm record;
  v_quote jsonb;
begin
  select id, status, fee_bps, close_time
  into v_market
  from public.markets
  where id = p_market_id;

  if not found then
    raise exception '[TRADE_NOT_FOUND] market not found.';
  end if;

  if v_market.status <> 'open' then
    raise exception '[TRADE_CONFLICT] market must be open for trading.';
  end if;

  if v_market.close_time is not null and v_market.close_time <= now() then
    raise exception '[TRADE_CONFLICT] market is closed for trading.';
  end if;

  select market_id, liquidity_parameter, yes_shares, no_shares
  into v_amm
  from public.market_amm_state
  where market_id = p_market_id;

  if not found then
    raise exception '[TRADE_CONFLICT] market AMM state not found.';
  end if;

  v_quote := public.compute_binary_lmsr_trade(
    v_amm.yes_shares,
    v_amm.no_shares,
    v_amm.liquidity_parameter,
    p_side,
    p_action,
    p_shares,
    v_market.fee_bps,
    p_max_slippage_bps
  );

  return v_quote || jsonb_build_object(
    'marketId', p_market_id,
    'feeBps', v_market.fee_bps
  );
end;
$$;

create or replace function public.execute_market_trade(
  p_market_id uuid,
  p_user_id uuid,
  p_side text,
  p_action text,
  p_shares numeric,
  p_idempotency_key text,
  p_max_slippage_bps integer default 500
)
returns jsonb
language plpgsql
as $$
declare
  v_side text := lower(trim(p_side));
  v_action text := lower(trim(p_action));
  v_market record;
  v_amm record;
  v_wallet record;
  v_position record;
  v_trade_fill record;
  v_existing_ledger record;
  v_quote jsonb;
  v_trade_idempotency_key text;
  v_fee_idempotency_key text;
  v_yes_shares_after numeric;
  v_no_shares_after numeric;
  v_price_before_yes numeric;
  v_price_after_yes numeric;
  v_price_before_side numeric;
  v_price_after_side numeric;
  v_average_price numeric;
  v_notional numeric;
  v_fee_amount numeric;
  v_net_cash_change numeric;
  v_slippage_bps numeric;
  v_trade_entry_type public.ledger_entry_type;
  v_new_wallet_available numeric;
  v_new_position_yes numeric;
  v_new_position_no numeric;
  v_new_avg_yes numeric;
  v_new_avg_no numeric;
  v_new_realized_pnl numeric;
  v_realized_delta numeric := 0;
  v_cost_basis numeric := 0;
  v_effective_fee_bps numeric;
begin
  if p_user_id is null then
    raise exception '[TRADE_FORBIDDEN] authenticated user is required.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception '[TRADE_VALIDATION] idempotency key must be at least 8 characters.';
  end if;

  if length(trim(p_idempotency_key)) > 120 then
    raise exception '[TRADE_VALIDATION] idempotency key must be 120 characters or less.';
  end if;

  if trim(p_idempotency_key) !~ '^[A-Za-z0-9:_-]+$' then
    raise exception '[TRADE_VALIDATION] idempotency key contains unsupported characters.';
  end if;

  v_trade_idempotency_key := format('trade:%s:%s', p_user_id::text, trim(p_idempotency_key));
  v_fee_idempotency_key := format('fee:%s:%s', p_user_id::text, trim(p_idempotency_key));

  select id, reference_id
  into v_existing_ledger
  from public.ledger_entries
  where idempotency_key = v_trade_idempotency_key
  limit 1;

  if found then
    select id, market_id, user_id, side, action, shares, price, notional, fee_amount, price_before_yes, price_after_yes, created_at
    into v_trade_fill
    from public.trade_fills
    where id = v_existing_ledger.reference_id;

    if not found then
      raise exception '[TRADE_CONFLICT] idempotency key is already in use.';
    end if;

    if v_trade_fill.market_id <> p_market_id or v_trade_fill.user_id <> p_user_id then
      raise exception '[TRADE_FORBIDDEN] idempotency key belongs to a different trade scope.';
    end if;

    select available_balance
    into v_new_wallet_available
    from public.wallet_accounts
    where user_id = p_user_id;

    if not found then
      v_new_wallet_available := 0;
    end if;

    select id, yes_shares, no_shares, realized_pnl
    into v_position
    from public.positions
    where market_id = p_market_id
      and user_id = p_user_id;

    if not found then
      v_position.yes_shares := 0;
      v_position.no_shares := 0;
      v_position.realized_pnl := 0;
    end if;

    select fee_bps
    into v_effective_fee_bps
    from public.markets
    where id = p_market_id;

    if not found then
      v_effective_fee_bps := 0;
    end if;

    v_price_before_yes := v_trade_fill.price_before_yes;
    v_price_after_yes := v_trade_fill.price_after_yes;
    v_price_before_side := case when v_trade_fill.side = 'yes' then v_trade_fill.price_before_yes else 1 - v_trade_fill.price_before_yes end;
    v_price_after_side := case when v_trade_fill.side = 'yes' then v_trade_fill.price_after_yes else 1 - v_trade_fill.price_after_yes end;
    v_slippage_bps := 0;

    return jsonb_build_object(
      'reused', true,
      'tradeFillId', v_trade_fill.id,
      'marketId', p_market_id,
      'userId', p_user_id,
      'side', v_trade_fill.side,
      'action', v_trade_fill.action,
      'shares', v_trade_fill.shares,
      'feeBps', v_effective_fee_bps,
      'priceBeforeYes', v_price_before_yes,
      'priceAfterYes', v_price_after_yes,
      'priceBeforeSide', v_price_before_side,
      'priceAfterSide', v_price_after_side,
      'averagePrice', v_trade_fill.price,
      'notional', v_trade_fill.notional,
      'feeAmount', v_trade_fill.fee_amount,
      'netCashChange', case when v_trade_fill.action = 'buy' then -(v_trade_fill.notional + v_trade_fill.fee_amount) else (v_trade_fill.notional - v_trade_fill.fee_amount) end,
      'slippageBps', v_slippage_bps,
      'walletAvailableBalance', v_new_wallet_available,
      'positionYesShares', coalesce(v_position.yes_shares, 0),
      'positionNoShares', coalesce(v_position.no_shares, 0),
      'positionRealizedPnl', coalesce(v_position.realized_pnl, 0),
      'executedAt', v_trade_fill.created_at
    );
  end if;

  select id, status, fee_bps, close_time
  into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '[TRADE_NOT_FOUND] market not found.';
  end if;

  if v_market.status <> 'open' then
    raise exception '[TRADE_CONFLICT] market must be open for trading.';
  end if;

  if v_market.close_time is not null and v_market.close_time <= now() then
    raise exception '[TRADE_CONFLICT] market is closed for trading.';
  end if;

  select market_id, liquidity_parameter, yes_shares, no_shares
  into v_amm
  from public.market_amm_state
  where market_id = p_market_id
  for update;

  if not found then
    raise exception '[TRADE_CONFLICT] market AMM state not found.';
  end if;

  v_quote := public.compute_binary_lmsr_trade(
    v_amm.yes_shares,
    v_amm.no_shares,
    v_amm.liquidity_parameter,
    v_side,
    v_action,
    p_shares,
    v_market.fee_bps,
    p_max_slippage_bps
  );

  v_yes_shares_after := (v_quote ->> 'yesSharesAfter')::numeric;
  v_no_shares_after := (v_quote ->> 'noSharesAfter')::numeric;
  v_price_before_yes := (v_quote ->> 'priceBeforeYes')::numeric;
  v_price_after_yes := (v_quote ->> 'priceAfterYes')::numeric;
  v_price_before_side := (v_quote ->> 'priceBeforeSide')::numeric;
  v_price_after_side := (v_quote ->> 'priceAfterSide')::numeric;
  v_average_price := (v_quote ->> 'averagePrice')::numeric;
  v_notional := (v_quote ->> 'notional')::numeric;
  v_fee_amount := (v_quote ->> 'feeAmount')::numeric;
  v_net_cash_change := (v_quote ->> 'netCashChange')::numeric;
  v_slippage_bps := (v_quote ->> 'slippageBps')::numeric;

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

  if coalesce(v_wallet.available_balance, 0) + v_net_cash_change < 0 then
    raise exception '[TRADE_FUNDS] insufficient available wallet balance.';
  end if;

  select id, yes_shares, no_shares, average_entry_price_yes, average_entry_price_no, realized_pnl
  into v_position
  from public.positions
  where market_id = p_market_id
    and user_id = p_user_id
  for update;

  if not found then
    insert into public.positions (
      market_id,
      user_id,
      yes_shares,
      no_shares,
      realized_pnl
    )
    values (
      p_market_id,
      p_user_id,
      0,
      0,
      0
    )
    returning id, yes_shares, no_shares, average_entry_price_yes, average_entry_price_no, realized_pnl
    into v_position;
  end if;

  v_new_position_yes := coalesce(v_position.yes_shares, 0);
  v_new_position_no := coalesce(v_position.no_shares, 0);
  v_new_avg_yes := v_position.average_entry_price_yes;
  v_new_avg_no := v_position.average_entry_price_no;
  v_new_realized_pnl := coalesce(v_position.realized_pnl, 0);

  if v_side = 'yes' then
    if v_action = 'buy' then
      v_new_position_yes := v_new_position_yes + p_shares;
      v_new_avg_yes := case
        when v_new_position_yes > 0 then round(((coalesce(v_position.average_entry_price_yes, 0) * coalesce(v_position.yes_shares, 0)) + (v_average_price * p_shares)) / v_new_position_yes, 8)
        else null
      end;
    else
      if v_new_position_yes < p_shares then
        raise exception '[TRADE_POSITION] insufficient YES shares to sell.';
      end if;

      v_cost_basis := coalesce(v_position.average_entry_price_yes, 0) * p_shares;
      v_realized_delta := (v_notional - v_fee_amount) - v_cost_basis;
      v_new_realized_pnl := v_new_realized_pnl + round(v_realized_delta, 6);
      v_new_position_yes := v_new_position_yes - p_shares;

      if v_new_position_yes = 0 then
        v_new_avg_yes := null;
      end if;
    end if;
  else
    if v_action = 'buy' then
      v_new_position_no := v_new_position_no + p_shares;
      v_new_avg_no := case
        when v_new_position_no > 0 then round(((coalesce(v_position.average_entry_price_no, 0) * coalesce(v_position.no_shares, 0)) + (v_average_price * p_shares)) / v_new_position_no, 8)
        else null
      end;
    else
      if v_new_position_no < p_shares then
        raise exception '[TRADE_POSITION] insufficient NO shares to sell.';
      end if;

      v_cost_basis := coalesce(v_position.average_entry_price_no, 0) * p_shares;
      v_realized_delta := (v_notional - v_fee_amount) - v_cost_basis;
      v_new_realized_pnl := v_new_realized_pnl + round(v_realized_delta, 6);
      v_new_position_no := v_new_position_no - p_shares;

      if v_new_position_no = 0 then
        v_new_avg_no := null;
      end if;
    end if;
  end if;

  update public.market_amm_state
  set
    yes_shares = v_yes_shares_after,
    no_shares = v_no_shares_after,
    last_price_yes = v_price_after_yes,
    last_price_no = 1 - v_price_after_yes,
    updated_at = now()
  where market_id = p_market_id;

  update public.positions
  set
    yes_shares = v_new_position_yes,
    no_shares = v_new_position_no,
    average_entry_price_yes = v_new_avg_yes,
    average_entry_price_no = v_new_avg_no,
    realized_pnl = v_new_realized_pnl
  where id = v_position.id;

  insert into public.trade_fills (
    market_id,
    user_id,
    side,
    action,
    shares,
    price,
    notional,
    fee_amount,
    price_before_yes,
    price_after_yes
  )
  values (
    p_market_id,
    p_user_id,
    v_side,
    v_action,
    p_shares,
    v_average_price,
    v_notional,
    v_fee_amount,
    v_price_before_yes,
    v_price_after_yes
  )
  returning id, market_id, user_id, side, action, shares, price, notional, fee_amount, price_before_yes, price_after_yes, created_at
  into v_trade_fill;

  update public.wallet_accounts
  set
    available_balance = coalesce(available_balance, 0) + v_net_cash_change
  where id = v_wallet.id
  returning available_balance
  into v_new_wallet_available;

  v_trade_entry_type := case
    when v_action = 'buy' then 'trade_debit'::public.ledger_entry_type
    else 'trade_credit'::public.ledger_entry_type
  end;

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
    v_trade_entry_type,
    case when v_action = 'buy' then -v_notional else v_notional end,
    'USD',
    v_trade_idempotency_key,
    'trade_fills',
    v_trade_fill.id,
    jsonb_build_object(
      'marketId', p_market_id,
      'side', v_side,
      'action', v_action,
      'shares', p_shares,
      'averagePrice', v_average_price
    )
  );

  if v_fee_amount > 0 then
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
      'fee',
      -v_fee_amount,
      'USD',
      v_fee_idempotency_key,
      'trade_fills',
      v_trade_fill.id,
      jsonb_build_object(
        'marketId', p_market_id,
        'side', v_side,
        'action', v_action,
        'shares', p_shares
      )
    );
  end if;

  return jsonb_build_object(
    'reused', false,
    'tradeFillId', v_trade_fill.id,
    'marketId', p_market_id,
    'userId', p_user_id,
    'side', v_side,
    'action', v_action,
    'shares', p_shares,
    'feeBps', v_market.fee_bps,
    'priceBeforeYes', v_price_before_yes,
    'priceAfterYes', v_price_after_yes,
    'priceBeforeSide', v_price_before_side,
    'priceAfterSide', v_price_after_side,
    'averagePrice', v_average_price,
    'notional', v_notional,
    'feeAmount', v_fee_amount,
    'netCashChange', v_net_cash_change,
    'slippageBps', v_slippage_bps,
    'walletAvailableBalance', v_new_wallet_available,
    'positionYesShares', v_new_position_yes,
    'positionNoShares', v_new_position_no,
    'positionRealizedPnl', v_new_realized_pnl,
    'executedAt', v_trade_fill.created_at
  );
end;
$$;

grant execute on function public.quote_market_trade(uuid, text, text, numeric, integer) to service_role;
grant execute on function public.execute_market_trade(uuid, uuid, text, text, numeric, text, integer) to service_role;

