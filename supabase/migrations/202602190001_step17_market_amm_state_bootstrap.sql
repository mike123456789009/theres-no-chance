create or replace function public.bootstrap_market_amm_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.market_amm_state (
    market_id,
    liquidity_parameter,
    yes_shares,
    no_shares,
    last_price_yes,
    last_price_no
  )
  values (
    new.id,
    100,
    0,
    0,
    0.5,
    0.5
  )
  on conflict (market_id) do nothing;

  return new;
end;
$$;

insert into public.market_amm_state (
  market_id,
  liquidity_parameter,
  yes_shares,
  no_shares,
  last_price_yes,
  last_price_no
)
select
  markets.id,
  100,
  0,
  0,
  0.5,
  0.5
from public.markets
left join public.market_amm_state
  on market_amm_state.market_id = markets.id
where market_amm_state.market_id is null
on conflict (market_id) do nothing;

drop trigger if exists markets_bootstrap_amm_state on public.markets;
create trigger markets_bootstrap_amm_state
after insert on public.markets
for each row execute function public.bootstrap_market_amm_state();
