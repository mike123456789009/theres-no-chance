-- Retire closed community markets that received no trades or resolver bonds.
-- The function moves candidates into resolved/void, then delegates finalization
-- to admin_finalize_market_v2 so settlement and audit records stay canonical.

create or replace function public.retire_no_action_closed_markets(
  p_actor_user_id uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_market record;
  v_actor uuid;
  v_count integer := 0;
  v_now timestamptz := now();
begin
  v_actor := public.resolve_platform_treasury_user_id(p_actor_user_id);

  if v_actor is null then
    return 0;
  end if;

  for v_market in
    select m.id
    from public.markets m
    where m.status = 'closed'
      and m.close_time <= v_now
      and m.finalized_at is null
      and not exists (
        select 1
        from public.trade_fills tf
        where tf.market_id = m.id
      )
      and not exists (
        select 1
        from public.market_resolver_bonds rb
        where rb.market_id = m.id
      )
    for update skip locked
  loop
    update public.markets
    set
      status = 'resolved',
      resolution_outcome = 'void',
      resolution_notes = coalesce(resolution_notes, 'Automatically retired because the market closed without trades or resolver bonds.'),
      resolved_at = coalesce(resolved_at, v_now),
      provisional_outcome = null,
      provisional_resolved_at = coalesce(provisional_resolved_at, v_now),
      resolution_window_ends_at = coalesce(resolution_window_ends_at, v_now),
      challenge_window_ends_at = v_now,
      adjudication_required = false,
      adjudication_reason = null,
      void_reason = 'no_activity_at_close',
      updated_at = v_now
    where id = v_market.id
      and status = 'closed'
      and finalized_at is null
      and not exists (
        select 1
        from public.trade_fills tf
        where tf.market_id = public.markets.id
      )
      and not exists (
        select 1
        from public.market_resolver_bonds rb
        where rb.market_id = public.markets.id
      );

    if found then
      perform public.admin_finalize_market_v2(v_market.id, v_actor, 'void', 24);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.retire_no_action_closed_markets(uuid) to service_role;
