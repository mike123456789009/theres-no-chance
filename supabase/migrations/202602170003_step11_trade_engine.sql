create or replace function public.lmsr_cost(
  p_yes_shares numeric,
  p_no_shares numeric,
  p_liquidity numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_scaled_yes numeric;
  v_scaled_no numeric;
  v_max_scaled numeric;
begin
  if p_liquidity is null or p_liquidity <= 0 then
    raise exception '[TRADE_VALIDATION] liquidity parameter must be greater than zero.';
  end if;

  v_scaled_yes := p_yes_shares / p_liquidity;
  v_scaled_no := p_no_shares / p_liquidity;
  v_max_scaled := greatest(v_scaled_yes, v_scaled_no);

  return p_liquidity * (v_max_scaled + ln(exp(v_scaled_yes - v_max_scaled) + exp(v_scaled_no - v_max_scaled)));
end;
$$;

create or replace function public.lmsr_price_yes(
  p_yes_shares numeric,
  p_no_shares numeric,
  p_liquidity numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_scaled_yes numeric;
  v_scaled_no numeric;
  v_max_scaled numeric;
  v_yes_exp numeric;
  v_no_exp numeric;
begin
  if p_liquidity is null or p_liquidity <= 0 then
    raise exception '[TRADE_VALIDATION] liquidity parameter must be greater than zero.';
  end if;

  v_scaled_yes := p_yes_shares / p_liquidity;
  v_scaled_no := p_no_shares / p_liquidity;
  v_max_scaled := greatest(v_scaled_yes, v_scaled_no);

  v_yes_exp := exp(v_scaled_yes - v_max_scaled);
  v_no_exp := exp(v_scaled_no - v_max_scaled);

  return v_yes_exp / nullif(v_yes_exp + v_no_exp, 0);
end;
$$;

create or replace function public.compute_binary_lmsr_trade(
  p_yes_shares numeric,
  p_no_shares numeric,
  p_liquidity numeric,
  p_side text,
  p_action text,
  p_shares numeric,
  p_fee_bps integer,
  p_max_slippage_bps integer
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_side text := lower(trim(p_side));
  v_action text := lower(trim(p_action));
  v_delta numeric;
  v_yes_shares_after numeric;
  v_no_shares_after numeric;
  v_price_before_yes numeric;
  v_price_after_yes numeric;
  v_cost_before numeric;
  v_cost_after numeric;
  v_cost_delta numeric;
  v_notional numeric;
  v_fee_amount numeric;
  v_net_cash_change numeric;
  v_price_before_side numeric;
  v_price_after_side numeric;
  v_slippage_bps numeric;
  v_average_price numeric;
begin
  if v_side not in ('yes', 'no') then
    raise exception '[TRADE_VALIDATION] side must be yes or no.';
  end if;

  if v_action not in ('buy', 'sell') then
    raise exception '[TRADE_VALIDATION] action must be buy or sell.';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception '[TRADE_VALIDATION] shares must be greater than zero.';
  end if;

  if p_fee_bps is null or p_fee_bps < 0 or p_fee_bps > 10000 then
    raise exception '[TRADE_VALIDATION] fee basis points must be between 0 and 10000.';
  end if;

  if p_max_slippage_bps is null or p_max_slippage_bps < 0 or p_max_slippage_bps > 10000 then
    raise exception '[TRADE_VALIDATION] max slippage basis points must be between 0 and 10000.';
  end if;

  v_delta := case when v_action = 'buy' then p_shares else -p_shares end;
  v_yes_shares_after := p_yes_shares;
  v_no_shares_after := p_no_shares;

  if v_side = 'yes' then
    v_yes_shares_after := p_yes_shares + v_delta;
  else
    v_no_shares_after := p_no_shares + v_delta;
  end if;

  if v_yes_shares_after < 0 or v_no_shares_after < 0 then
    raise exception '[TRADE_CONFLICT] trade would move AMM shares below zero.';
  end if;

  v_price_before_yes := public.lmsr_price_yes(p_yes_shares, p_no_shares, p_liquidity);
  v_price_after_yes := public.lmsr_price_yes(v_yes_shares_after, v_no_shares_after, p_liquidity);

  v_cost_before := public.lmsr_cost(p_yes_shares, p_no_shares, p_liquidity);
  v_cost_after := public.lmsr_cost(v_yes_shares_after, v_no_shares_after, p_liquidity);
  v_cost_delta := v_cost_after - v_cost_before;

  if v_action = 'buy' then
    v_notional := v_cost_delta;
  else
    v_notional := -v_cost_delta;
  end if;

  if v_notional <= 0 then
    raise exception '[TRADE_CONFLICT] trade notional must be greater than zero.';
  end if;

  v_notional := round(v_notional, 6);
  v_fee_amount := round((v_notional * p_fee_bps::numeric) / 10000, 6);
  v_average_price := round(v_notional / p_shares, 8);

  if v_action = 'buy' then
    v_net_cash_change := -(v_notional + v_fee_amount);
  else
    v_net_cash_change := v_notional - v_fee_amount;
  end if;

  v_price_before_side := case when v_side = 'yes' then v_price_before_yes else (1 - v_price_before_yes) end;
  v_price_after_side := case when v_side = 'yes' then v_price_after_yes else (1 - v_price_after_yes) end;

  if v_price_before_side <= 0 then
    v_slippage_bps := 0;
  else
    v_slippage_bps := round(abs(v_price_after_side - v_price_before_side) / v_price_before_side * 10000, 4);
  end if;

  if v_slippage_bps > p_max_slippage_bps then
    raise exception '[TRADE_CONFLICT] slippage exceeds max slippage setting.';
  end if;

  return jsonb_build_object(
    'side', v_side,
    'action', v_action,
    'shares', p_shares,
    'yesSharesAfter', v_yes_shares_after,
    'noSharesAfter', v_no_shares_after,
    'priceBeforeYes', v_price_before_yes,
    'priceAfterYes', v_price_after_yes,
    'priceBeforeSide', v_price_before_side,
    'priceAfterSide', v_price_after_side,
    'averagePrice', v_average_price,
    'notional', v_notional,
    'feeAmount', v_fee_amount,
    'netCashChange', v_net_cash_change,
    'slippageBps', v_slippage_bps
  );
end;
$$;

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
  select id, status, fee_bps
  into v_market
  from public.markets
  where id = p_market_id;

  if not found then
    raise exception '[TRADE_NOT_FOUND] market not found.';
  end if;

  if v_market.status <> 'open' then
    raise exception '[TRADE_CONFLICT] market must be open for trading.';
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

    select yes_shares, no_shares, average_entry_price_yes, average_entry_price_no, realized_pnl
    into v_position
    from public.positions
    where market_id = p_market_id
      and user_id = p_user_id;

    v_effective_fee_bps := case
      when v_trade_fill.notional > 0 then round(v_trade_fill.fee_amount / v_trade_fill.notional * 10000, 4)
      else 0
    end;

    v_price_before_yes := coalesce(v_trade_fill.price_before_yes, 0.5);
    v_price_after_yes := coalesce(v_trade_fill.price_after_yes, v_price_before_yes);
    v_price_before_side := case when v_trade_fill.side = 'yes' then v_price_before_yes else (1 - v_price_before_yes) end;
    v_price_after_side := case when v_trade_fill.side = 'yes' then v_price_after_yes else (1 - v_price_after_yes) end;
    v_slippage_bps := case
      when v_price_before_side <= 0 then 0
      else round(abs(v_price_after_side - v_price_before_side) / v_price_before_side * 10000, 4)
    end;

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

  select id, status, fee_bps
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
