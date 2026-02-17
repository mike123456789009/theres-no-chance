create or replace function public.apply_wallet_credit(
  p_user_id uuid,
  p_amount numeric,
  p_entry_type public.ledger_entry_type,
  p_idempotency_key text,
  p_reference_table text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_wallet record;
  v_existing_ledger record;
  v_ledger_id uuid;
  v_wallet_available numeric;
begin
  if p_user_id is null then
    raise exception '[PAYMENT_VALIDATION] user id is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception '[PAYMENT_VALIDATION] credit amount must be greater than zero.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception '[PAYMENT_VALIDATION] idempotency key must be at least 8 characters.';
  end if;

  if length(trim(p_idempotency_key)) > 120 then
    raise exception '[PAYMENT_VALIDATION] idempotency key must be 120 characters or less.';
  end if;

  select id, wallet_account_id
  into v_existing_ledger
  from public.ledger_entries
  where idempotency_key = trim(p_idempotency_key)
  limit 1;

  if found then
    select id, available_balance
    into v_wallet
    from public.wallet_accounts
    where id = v_existing_ledger.wallet_account_id;

    return jsonb_build_object(
      'reused', true,
      'ledgerEntryId', v_existing_ledger.id,
      'walletAccountId', v_wallet.id,
      'walletAvailableBalance', coalesce(v_wallet.available_balance, 0)
    );
  end if;

  select id, available_balance
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
    returning id, available_balance
    into v_wallet;
  end if;

  update public.wallet_accounts
  set
    available_balance = coalesce(available_balance, 0) + p_amount
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
    p_entry_type,
    p_amount,
    'USD',
    trim(p_idempotency_key),
    p_reference_table,
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id
  into v_ledger_id;

  return jsonb_build_object(
    'reused', false,
    'ledgerEntryId', v_ledger_id,
    'walletAccountId', v_wallet.id,
    'walletAvailableBalance', v_wallet_available
  );
end;
$$;

grant execute on function public.apply_wallet_credit(uuid, numeric, public.ledger_entry_type, text, text, uuid, jsonb) to service_role;
