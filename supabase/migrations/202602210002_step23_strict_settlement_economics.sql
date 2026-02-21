-- Step 23: Strict community settlement economics alignment
-- - Full v2 settlement rewrite (no legacy payout delegation)
-- - Exact dynamic rake + listing-fee routing
-- - Wrong challenger 50/50 split to resolver pool + treasury
-- - Effective-weight resolver payouts (bond + successful challenge additional stake)
-- - Treasury actor resolution for auto-finalization

alter table public.market_resolution_settlements
  add column if not exists maker_rate numeric(12, 8) not null default 0,
  add column if not exists resolver_rate numeric(12, 8) not null default 0,
  add column if not exists platform_rate numeric(12, 8) not null default 0,
  add column if not exists total_rate numeric(12, 8) not null default 0,
  add column if not exists total_rake_amount numeric(20, 6) not null default 0,
  add column if not exists maker_rake_amount numeric(20, 6) not null default 0,
  add column if not exists resolver_generated_amount numeric(20, 6) not null default 0,
  add column if not exists platform_rake_amount numeric(20, 6) not null default 0,
  add column if not exists resolver_rake_to_resolvers numeric(20, 6) not null default 0,
  add column if not exists treasury_listing_component numeric(20, 6) not null default 0,
  add column if not exists wrong_challenge_to_resolvers numeric(20, 6) not null default 0,
  add column if not exists wrong_challenge_to_treasury numeric(20, 6) not null default 0,
  add column if not exists resolver_contribution_component numeric(20, 6) not null default 0,
  add column if not exists resolver_pool_distributed_amount numeric(20, 6) not null default 0,
  add column if not exists resolver_pool_residue_amount numeric(20, 6) not null default 0,
  add column if not exists treasury_total_amount numeric(20, 6) not null default 0;

create or replace function public.resolve_platform_treasury_user_id(
  p_fallback_user_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  if p_fallback_user_id is not null then
    return p_fallback_user_id;
  end if;

  select ur.user_id
  into v_user_id
  from public.user_roles ur
  where ur.role = 'platform_admin'
    and ur.organization_id is null
  order by ur.created_at asc
  limit 1;

  return v_user_id;
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
  v_final_outcome public.resolution_outcome;
  v_final_changed_by_challenge boolean := false;
  v_position record;
  v_resolver_bond record;
  v_dispute record;
  v_contribution record;
  v_result jsonb;
  v_schedule jsonb;
  v_treasury_user_id uuid;

  v_settlement_p numeric := 0;
  v_payout_ratio numeric := 1;
  v_base_payout numeric := 0;
  v_payout numeric := 0;
  v_cost numeric := 0;
  v_delta_pnl numeric := 0;

  v_maker_rate numeric := 0;
  v_resolver_rate numeric := 0;
  v_platform_rate numeric := 0;
  v_total_rate numeric := 0;

  v_total_rake_amount numeric := 0;
  v_maker_rake_amount numeric := 0;
  v_resolver_generated_amount numeric := 0;
  v_platform_rake_amount numeric := 0;

  v_listing_fee_amount numeric := 0.50;
  v_resolver_rake_to_resolvers numeric := 0;
  v_treasury_listing_component numeric := 0;

  v_wrong_resolver_bond_total_sw numeric := 0;
  v_correct_resolver_bond_total_sc numeric := 0;
  v_successful_challenger_bond_total numeric := 0;
  v_wrong_challenge_total numeric := 0;
  v_wrong_challenge_to_resolvers numeric := 0;
  v_wrong_challenge_to_treasury numeric := 0;

  v_resolver_contribution_component numeric := 0;
  v_resolver_pool_total numeric := 0;
  v_effective_weight_total numeric := 0;
  v_effective_weight numeric := 0;
  v_resolver_reward_share numeric := 0;
  v_resolver_pool_distributed numeric := 0;
  v_resolver_pool_residue numeric := 0;

  v_treasury_total numeric := 0;

  v_settlement_key text;
  v_resolver_return_key text;
  v_resolver_reward_key text;
  v_resolver_slash_key text;
  v_challenge_return_key text;
  v_challenge_slash_key text;
  v_treasury_key text;
  v_maker_key text;
  v_refund_key text;
  v_challenge_success boolean := false;
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
    adjudication_reason,
    creator_id,
    listing_fee_amount,
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

  v_treasury_user_id := public.resolve_platform_treasury_user_id(p_admin_user_id);
  if v_treasury_user_id is null then
    raise exception '[FINALIZE_CONFLICT] unable to resolve treasury payout user.';
  end if;

  if v_market.adjudication_required then
    if p_outcome not in ('yes', 'no') then
      raise exception '[FINALIZE_CONFLICT] challenged or tied markets require explicit final YES/NO outcome.';
    end if;
    v_final_outcome := p_outcome;

    update public.market_disputes
    set
      status = case when proposed_outcome = v_final_outcome then 'upheld'::public.dispute_status else 'rejected'::public.dispute_status end,
      adjudicated_by = p_admin_user_id,
      adjudication_notes = coalesce(adjudication_notes, 'Resolved by final adjudication outcome.'),
      adjudicated_at = coalesce(adjudicated_at, v_now)
    where market_id = p_market_id;
  else
    if v_market.challenge_window_ends_at is not null and v_now < v_market.challenge_window_ends_at then
      raise exception '[FINALIZE_CONFLICT] challenge window still open.';
    end if;

    if exists (
      select 1
      from public.market_disputes d
      where d.market_id = p_market_id
        and d.status in ('open', 'under_review')
    ) then
      raise exception '[FINALIZE_CONFLICT] market has unresolved challenges and requires adjudication.';
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

  v_final_changed_by_challenge := (
    v_market.provisional_outcome in ('yes', 'no')
    and v_market.provisional_outcome <> v_final_outcome
  );

  if v_final_outcome = 'void' then
    for v_contribution in
      select id, contributor_id, amount
      from public.market_resolver_prize_contributions
      where market_id = p_market_id
        and status = 'locked'
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

    for v_resolver_bond in
      select id, user_id, bond_amount
      from public.market_resolver_bonds
      where market_id = p_market_id
        and settled_at is null
    loop
      v_resolver_return_key := format('resolver-void-refund:%s', v_resolver_bond.id::text);
      perform public.apply_wallet_credit(
        v_resolver_bond.user_id,
        v_resolver_bond.bond_amount,
        'resolver_bond_return'::public.ledger_entry_type,
        v_resolver_return_key,
        'market_resolver_bonds',
        v_resolver_bond.id,
        jsonb_build_object('marketId', p_market_id, 'reason', 'void_outcome')
      );

      update public.market_resolver_bonds
      set
        settled_at = v_now,
        is_correct = null,
        payout_amount = v_resolver_bond.bond_amount
      where id = v_resolver_bond.id;
    end loop;

    for v_dispute in
      select id, created_by, challenge_bond_amount
      from public.market_disputes
      where market_id = p_market_id
        and settled_at is null
    loop
      if coalesce(v_dispute.challenge_bond_amount, 0) > 0 then
        v_challenge_return_key := format('challenge-void-refund:%s', v_dispute.id::text);
        perform public.apply_wallet_credit(
          v_dispute.created_by,
          v_dispute.challenge_bond_amount,
          'challenge_bond_return'::public.ledger_entry_type,
          v_challenge_return_key,
          'market_disputes',
          v_dispute.id,
          jsonb_build_object('marketId', p_market_id, 'reason', 'void_outcome')
        );
      end if;

      update public.market_disputes
      set
        settled_at = v_now,
        is_successful = false,
        payout_bonus_amount = 0,
        success_group_id = null,
        status = case when status in ('open', 'under_review') then 'expired'::public.dispute_status else status end
      where id = v_dispute.id;
    end loop;

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
      maker_rate,
      resolver_rate,
      platform_rate,
      total_rate,
      total_rake_amount,
      maker_rake_amount,
      resolver_generated_amount,
      platform_rake_amount,
      resolver_rake_to_resolvers,
      treasury_listing_component,
      wrong_challenge_to_resolvers,
      wrong_challenge_to_treasury,
      resolver_contribution_component,
      resolver_pool_distributed_amount,
      resolver_pool_residue_amount,
      treasury_total_amount,
      finalized_at,
      metadata
    )
    values (
      p_market_id,
      0,
      0,
      coalesce(v_market.listing_fee_amount, 0.50),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      v_now,
      jsonb_build_object(
        'finalOutcome', 'void',
        'reason', coalesce(v_market.adjudication_reason, 'void')
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
      maker_rate = excluded.maker_rate,
      resolver_rate = excluded.resolver_rate,
      platform_rate = excluded.platform_rate,
      total_rate = excluded.total_rate,
      total_rake_amount = excluded.total_rake_amount,
      maker_rake_amount = excluded.maker_rake_amount,
      resolver_generated_amount = excluded.resolver_generated_amount,
      platform_rake_amount = excluded.platform_rake_amount,
      resolver_rake_to_resolvers = excluded.resolver_rake_to_resolvers,
      treasury_listing_component = excluded.treasury_listing_component,
      wrong_challenge_to_resolvers = excluded.wrong_challenge_to_resolvers,
      wrong_challenge_to_treasury = excluded.wrong_challenge_to_treasury,
      resolver_contribution_component = excluded.resolver_contribution_component,
      resolver_pool_distributed_amount = excluded.resolver_pool_distributed_amount,
      resolver_pool_residue_amount = excluded.resolver_pool_residue_amount,
      treasury_total_amount = excluded.treasury_total_amount,
      finalized_at = excluded.finalized_at,
      metadata = excluded.metadata;

    update public.markets
    set
      status = 'finalized',
      resolution_outcome = 'void',
      adjudication_required = false,
      adjudication_reason = null,
      final_outcome_changed_by_challenge = false,
      finalized_at = v_now,
      creator_rake_paid_amount = 0,
      creator_rake_paid_at = null
    where id = p_market_id;

    return jsonb_build_object(
      'reused', false,
      'marketId', p_market_id,
      'status', 'finalized',
      'finalOutcome', 'void',
      'finalizedAt', v_now
    );
  end if;

  if v_final_outcome = 'yes' then
    select round(coalesce(sum(coalesce(yes_shares, 0)), 0), 6)
    into v_settlement_p
    from public.positions
    where market_id = p_market_id;
  else
    select round(coalesce(sum(coalesce(no_shares, 0)), 0), 6)
    into v_settlement_p
    from public.positions
    where market_id = p_market_id;
  end if;

  v_schedule := public.calculate_rake_schedule(coalesce(v_settlement_p, 0));
  v_maker_rate := coalesce((v_schedule ->> 'makerRate')::numeric, 0);
  v_resolver_rate := coalesce((v_schedule ->> 'resolverRate')::numeric, 0);
  v_platform_rate := coalesce((v_schedule ->> 'platformRate')::numeric, 0);
  v_total_rate := coalesce((v_schedule ->> 'totalRate')::numeric, 0);

  v_total_rake_amount := round(v_settlement_p * v_total_rate, 6);
  v_maker_rake_amount := round(v_settlement_p * v_maker_rate, 6);
  v_resolver_generated_amount := round(v_settlement_p * v_resolver_rate, 6);
  v_platform_rake_amount := round(v_settlement_p * v_platform_rate, 6);

  if v_settlement_p > 0 then
    v_payout_ratio := greatest(0, (v_settlement_p - v_total_rake_amount) / v_settlement_p);
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
          'totalRakeRate', v_total_rate,
          'totalRakeAmount', v_total_rake_amount
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
    round(coalesce(sum(case when outcome = v_final_outcome then bond_amount else 0 end), 0), 6),
    round(coalesce(sum(case when outcome <> v_final_outcome then bond_amount else 0 end), 0), 6)
  into v_correct_resolver_bond_total_sc, v_wrong_resolver_bond_total_sw
  from public.market_resolver_bonds
  where market_id = p_market_id;

  select
    round(coalesce(sum(case when status = 'upheld' and proposed_outcome = v_final_outcome then challenge_bond_amount else 0 end), 0), 6),
    round(
      coalesce(
        sum(
          case
            when status in ('rejected', 'expired') then challenge_bond_amount
            when status = 'upheld' and coalesce(proposed_outcome, 'void'::public.resolution_outcome) <> v_final_outcome then challenge_bond_amount
            else 0
          end
        ),
        0
      ),
      6
    )
  into v_successful_challenger_bond_total, v_wrong_challenge_total
  from public.market_disputes
  where market_id = p_market_id;

  v_wrong_challenge_to_resolvers := round(v_wrong_challenge_total * 0.5, 6);
  v_wrong_challenge_to_treasury := round(v_wrong_challenge_total - v_wrong_challenge_to_resolvers, 6);

  v_listing_fee_amount := round(coalesce(v_market.listing_fee_amount, 0.50), 6);

  if v_resolver_generated_amount < v_listing_fee_amount then
    v_resolver_rake_to_resolvers := v_listing_fee_amount;
    v_treasury_listing_component := v_resolver_generated_amount;
  else
    v_resolver_rake_to_resolvers := v_resolver_generated_amount;
    v_treasury_listing_component := v_listing_fee_amount;
  end if;

  select round(coalesce(sum(amount), 0), 6)
  into v_resolver_contribution_component
  from public.market_resolver_prize_contributions
  where market_id = p_market_id
    and status = 'locked';

  v_resolver_pool_total := round(
    v_wrong_resolver_bond_total_sw
    + v_wrong_challenge_to_resolvers
    + v_resolver_rake_to_resolvers
    + v_resolver_contribution_component,
    6
  );

  v_treasury_total := round(
    v_platform_rake_amount
    + v_treasury_listing_component
    + v_wrong_challenge_to_treasury,
    6
  );

  for v_dispute in
    select
      id,
      created_by,
      status,
      proposed_outcome,
      challenge_bond_amount,
      settled_at
    from public.market_disputes
    where market_id = p_market_id
  loop
    if v_dispute.settled_at is not null then
      continue;
    end if;

    v_challenge_success := (
      v_dispute.status = 'upheld'
      and v_dispute.proposed_outcome = v_final_outcome
    );

    if v_challenge_success and coalesce(v_dispute.challenge_bond_amount, 0) > 0 then
      v_challenge_return_key := format('challenge-return:%s', v_dispute.id::text);
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
          'bondAmount', v_dispute.challenge_bond_amount,
          'finalOutcome', v_final_outcome
        )
      );
    elsif coalesce(v_dispute.challenge_bond_amount, 0) > 0 then
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
          'bondAmount', coalesce(v_dispute.challenge_bond_amount, 0),
          'finalOutcome', v_final_outcome
        )
      )
      on conflict (idempotency_key) do nothing;
    end if;

    update public.market_disputes
    set
      settled_at = v_now,
      is_successful = v_challenge_success,
      payout_bonus_amount = 0,
      success_group_id = null
    where id = v_dispute.id;
  end loop;

  select round(
    coalesce(
      sum(
        b.bond_amount + coalesce((
          select sum(d.challenge_bond_amount)
          from public.market_disputes d
          where d.market_id = p_market_id
            and d.resolver_bond_id = b.id
            and d.status = 'upheld'
            and d.proposed_outcome = v_final_outcome
        ), 0)
      ),
      0
    ),
    6
  )
  into v_effective_weight_total
  from public.market_resolver_bonds b
  where b.market_id = p_market_id
    and b.outcome = v_final_outcome;

  for v_resolver_bond in
    select
      b.id,
      b.user_id,
      b.outcome,
      b.bond_amount,
      b.settled_at,
      coalesce((
        select sum(d.challenge_bond_amount)
        from public.market_disputes d
        where d.market_id = p_market_id
          and d.resolver_bond_id = b.id
          and d.status = 'upheld'
          and d.proposed_outcome = v_final_outcome
      ), 0) as successful_challenge_additional,
      row_number() over(order by b.created_at, b.id) as row_num,
      count(*) over() as total_rows
    from public.market_resolver_bonds b
    where b.market_id = p_market_id
      and b.outcome = v_final_outcome
  loop
    if v_resolver_bond.settled_at is not null then
      continue;
    end if;

    v_effective_weight := round(
      coalesce(v_resolver_bond.bond_amount, 0)
      + coalesce(v_resolver_bond.successful_challenge_additional, 0),
      6
    );

    if v_effective_weight_total > 0 and v_resolver_pool_total > 0 then
      if v_resolver_bond.row_num = v_resolver_bond.total_rows then
        v_resolver_reward_share := round(greatest(0, v_resolver_pool_total - v_resolver_pool_distributed), 6);
      else
        v_resolver_reward_share := round((v_effective_weight / v_effective_weight_total) * v_resolver_pool_total, 6);
        if v_resolver_reward_share < 0 then
          v_resolver_reward_share := 0;
        end if;
        if v_resolver_pool_distributed + v_resolver_reward_share > v_resolver_pool_total then
          v_resolver_reward_share := round(greatest(0, v_resolver_pool_total - v_resolver_pool_distributed), 6);
        end if;
      end if;
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
        'bondAmount', v_resolver_bond.bond_amount,
        'finalOutcome', v_final_outcome
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
          'effectiveWeight', v_effective_weight,
          'effectiveWeightTotal', v_effective_weight_total,
          'resolverPoolTotal', v_resolver_pool_total
        )
      );
    end if;

    v_resolver_pool_distributed := round(v_resolver_pool_distributed + v_resolver_reward_share, 6);

    update public.market_resolver_bonds
    set
      settled_at = v_now,
      is_correct = true,
      payout_amount = round(v_resolver_bond.bond_amount + v_resolver_reward_share, 6)
    where id = v_resolver_bond.id;
  end loop;

  for v_resolver_bond in
    select id, user_id, bond_amount, settled_at
    from public.market_resolver_bonds
    where market_id = p_market_id
      and outcome <> v_final_outcome
  loop
    if v_resolver_bond.settled_at is not null then
      continue;
    end if;

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
        'bondAmount', v_resolver_bond.bond_amount,
        'finalOutcome', v_final_outcome
      )
    )
    on conflict (idempotency_key) do nothing;

    update public.market_resolver_bonds
    set
      settled_at = v_now,
      is_correct = false,
      payout_amount = 0
    where id = v_resolver_bond.id;
  end loop;

  update public.market_resolver_prize_contributions
  set
    status = 'distributed',
    settled_at = v_now
  where market_id = p_market_id
    and status = 'locked';

  v_resolver_pool_residue := round(greatest(0, v_resolver_pool_total - v_resolver_pool_distributed), 6);
  v_treasury_total := round(v_treasury_total + v_resolver_pool_residue, 6);

  if v_maker_rake_amount > 0 then
    v_maker_key := format('maker-rake:%s', p_market_id::text);
    perform public.apply_wallet_credit(
      v_market.creator_id,
      v_maker_rake_amount,
      'market_maker_rake_payout'::public.ledger_entry_type,
      v_maker_key,
      'markets',
      p_market_id,
      jsonb_build_object('marketId', p_market_id, 'makerRate', v_maker_rate, 'settlementPot', v_settlement_p)
    );
  end if;

  if v_treasury_total > 0 then
    v_treasury_key := format('platform-treasury:%s', p_market_id::text);
    perform public.apply_wallet_credit(
      v_treasury_user_id,
      v_treasury_total,
      'platform_treasury_rake'::public.ledger_entry_type,
      v_treasury_key,
      'markets',
      p_market_id,
      jsonb_build_object(
        'marketId', p_market_id,
        'settlementPot', v_settlement_p,
        'platformRakeAmount', v_platform_rake_amount,
        'listingTreasuryComponent', v_treasury_listing_component,
        'wrongChallengeToTreasury', v_wrong_challenge_to_treasury,
        'resolverPoolResidue', v_resolver_pool_residue
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
    maker_rate,
    resolver_rate,
    platform_rate,
    total_rate,
    total_rake_amount,
    maker_rake_amount,
    resolver_generated_amount,
    platform_rake_amount,
    resolver_rake_to_resolvers,
    treasury_listing_component,
    wrong_challenge_to_resolvers,
    wrong_challenge_to_treasury,
    resolver_contribution_component,
    resolver_pool_distributed_amount,
    resolver_pool_residue_amount,
    treasury_total_amount,
    finalized_at,
    metadata
  )
  values (
    p_market_id,
    v_settlement_p,
    v_total_rake_amount,
    v_listing_fee_amount,
    v_wrong_resolver_bond_total_sw,
    v_wrong_challenge_total,
    v_resolver_pool_total,
    0,
    v_resolver_pool_total,
    v_correct_resolver_bond_total_sc,
    v_wrong_resolver_bond_total_sw,
    v_successful_challenger_bond_total,
    v_maker_rate,
    v_resolver_rate,
    v_platform_rate,
    v_total_rate,
    v_total_rake_amount,
    v_maker_rake_amount,
    v_resolver_generated_amount,
    v_platform_rake_amount,
    v_resolver_rake_to_resolvers,
    v_treasury_listing_component,
    v_wrong_challenge_to_resolvers,
    v_wrong_challenge_to_treasury,
    v_resolver_contribution_component,
    v_resolver_pool_distributed,
    v_resolver_pool_residue,
    v_treasury_total,
    v_now,
    jsonb_build_object(
      'finalOutcome', v_final_outcome,
      'provisionalOutcome', v_market.provisional_outcome,
      'finalOutcomeChangedByChallenge', v_final_changed_by_challenge,
      'payoutRatio', v_payout_ratio,
      'listingFeeRule', case when v_resolver_generated_amount < v_listing_fee_amount then 'resolver_floor_from_listing' else 'resolver_generated_exceeds_listing' end,
      'treasuryUserId', v_treasury_user_id,
      'effectiveWeightRule', 'bond_plus_successful_challenge_additional'
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
    maker_rate = excluded.maker_rate,
    resolver_rate = excluded.resolver_rate,
    platform_rate = excluded.platform_rate,
    total_rate = excluded.total_rate,
    total_rake_amount = excluded.total_rake_amount,
    maker_rake_amount = excluded.maker_rake_amount,
    resolver_generated_amount = excluded.resolver_generated_amount,
    platform_rake_amount = excluded.platform_rake_amount,
    resolver_rake_to_resolvers = excluded.resolver_rake_to_resolvers,
    treasury_listing_component = excluded.treasury_listing_component,
    wrong_challenge_to_resolvers = excluded.wrong_challenge_to_resolvers,
    wrong_challenge_to_treasury = excluded.wrong_challenge_to_treasury,
    resolver_contribution_component = excluded.resolver_contribution_component,
    resolver_pool_distributed_amount = excluded.resolver_pool_distributed_amount,
    resolver_pool_residue_amount = excluded.resolver_pool_residue_amount,
    treasury_total_amount = excluded.treasury_total_amount,
    finalized_at = excluded.finalized_at,
    metadata = excluded.metadata;

  update public.markets
  set
    status = 'finalized',
    resolution_outcome = v_final_outcome,
    adjudication_required = false,
    adjudication_reason = null,
    finalized_at = v_now,
    final_outcome_changed_by_challenge = v_final_changed_by_challenge,
    creator_rake_paid_amount = v_maker_rake_amount,
    creator_rake_paid_at = case when v_maker_rake_amount > 0 then v_now else null end
  where id = p_market_id;

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
      'finalOutcome', v_final_outcome,
      'finalizedAt', v_now,
      'finalOutcomeChangedByChallenge', v_final_changed_by_challenge,
      'settlementPotP', v_settlement_p,
      'makerRate', v_maker_rate,
      'resolverRate', v_resolver_rate,
      'platformRate', v_platform_rate,
      'totalRate', v_total_rate,
      'makerRakeAmount', v_maker_rake_amount,
      'resolverPoolTotal', v_resolver_pool_total,
      'treasuryTotal', v_treasury_total
    )
  );

  v_result := jsonb_build_object(
    'reused', false,
    'marketId', p_market_id,
    'status', 'finalized',
    'finalOutcome', v_final_outcome,
    'finalizedAt', v_now,
    'finalOutcomeChangedByChallenge', v_final_changed_by_challenge,
    'schedule', jsonb_build_object(
      'makerRate', v_maker_rate,
      'resolverRate', v_resolver_rate,
      'platformRate', v_platform_rate,
      'totalRate', v_total_rate
    ),
    'amounts', jsonb_build_object(
      'P', v_settlement_p,
      'totalRakeAmount', v_total_rake_amount,
      'makerRakeAmount', v_maker_rake_amount,
      'resolverGeneratedAmount', v_resolver_generated_amount,
      'platformRakeAmount', v_platform_rake_amount,
      'resolverRakeToResolvers', v_resolver_rake_to_resolvers,
      'listingTreasuryComponent', v_treasury_listing_component,
      'wrongChallengeToResolvers', v_wrong_challenge_to_resolvers,
      'wrongChallengeToTreasury', v_wrong_challenge_to_treasury,
      'resolverContributionComponent', v_resolver_contribution_component,
      'resolverPoolDistributed', v_resolver_pool_distributed,
      'resolverPoolResidue', v_resolver_pool_residue,
      'treasuryTotal', v_treasury_total
    )
  );

  return v_result;
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
  v_actor := public.resolve_platform_treasury_user_id(p_actor_user_id);

  if v_actor is null then
    return 0;
  end if;

  for v_market in
    select id
    from public.markets
    where resolution_mode = 'community'
      and status = 'resolved'
      and finalized_at is null
      and adjudication_required = false
      and resolution_outcome in ('yes', 'no', 'void')
      and (challenge_window_ends_at is null or challenge_window_ends_at <= now())
  loop
    perform public.admin_finalize_market_v2(v_market.id, v_actor, null, 24);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.resolve_platform_treasury_user_id(uuid) to service_role;
grant execute on function public.admin_finalize_market_v2(uuid, uuid, public.resolution_outcome, integer) to service_role;
grant execute on function public.sync_due_community_finalizations(uuid) to service_role;
