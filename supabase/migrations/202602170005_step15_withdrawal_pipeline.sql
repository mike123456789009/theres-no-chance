create or replace function public.request_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_currency text default 'USD',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_wallet record;
  v_existing record;
  v_request record;
  v_available numeric;
  v_reserved numeric;
  v_currency text := upper(trim(coalesce(p_currency, 'USD')));
begin
  if p_user_id is null then
    raise exception '[WITHDRAW_VALIDATION] user id is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception '[WITHDRAW_VALIDATION] withdrawal amount must be greater than zero.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception '[WITHDRAW_VALIDATION] idempotency key must be at least 8 characters.';
  end if;

  if length(trim(p_idempotency_key)) > 120 then
    raise exception '[WITHDRAW_VALIDATION] idempotency key must be 120 characters or less.';
  end if;

  if v_currency <> 'USD' then
    raise exception '[WITHDRAW_VALIDATION] only USD withdrawals are currently supported.';
  end if;

  select
    l.reference_id as withdrawal_request_id,
    l.wallet_account_id
  into v_existing
  from public.ledger_entries l
  where l.user_id = p_user_id
    and l.entry_type = 'withdrawal_request'::public.ledger_entry_type
    and l.idempotency_key = trim(p_idempotency_key)
  limit 1;

  if found then
    select id, amount, currency, status, requested_at
    into v_request
    from public.withdrawal_requests
    where id = v_existing.withdrawal_request_id;

    select id, available_balance, reserved_balance
    into v_wallet
    from public.wallet_accounts
    where id = v_existing.wallet_account_id;

    return jsonb_build_object(
      'reused', true,
      'withdrawalRequestId', v_request.id,
      'status', coalesce(v_request.status, 'pending'),
      'amount', coalesce(v_request.amount, p_amount),
      'currency', coalesce(v_request.currency, v_currency),
      'availableBalance', coalesce(v_wallet.available_balance, 0),
      'reservedBalance', coalesce(v_wallet.reserved_balance, 0),
      'requestedAt', coalesce(v_request.requested_at, now())
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

  if coalesce(v_wallet.available_balance, 0) < p_amount then
    raise exception '[WITHDRAW_FUNDS] insufficient available wallet balance for withdrawal.';
  end if;

  insert into public.withdrawal_requests (
    user_id,
    amount,
    currency,
    status,
    requested_at
  )
  values (
    p_user_id,
    p_amount,
    v_currency,
    'pending',
    now()
  )
  returning id, amount, currency, status, requested_at
  into v_request;

  update public.wallet_accounts
  set
    available_balance = coalesce(available_balance, 0) - p_amount,
    reserved_balance = coalesce(reserved_balance, 0) + p_amount
  where id = v_wallet.id
  returning available_balance, reserved_balance
  into v_available, v_reserved;

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
    'withdrawal_request'::public.ledger_entry_type,
    -p_amount,
    v_currency,
    trim(p_idempotency_key),
    'withdrawal_requests',
    v_request.id,
    jsonb_build_object(
      'withdrawalRequestId', v_request.id,
      'stage', 'requested',
      'amount', p_amount
    ) || coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object(
    'reused', false,
    'withdrawalRequestId', v_request.id,
    'status', v_request.status,
    'amount', v_request.amount,
    'currency', v_request.currency,
    'availableBalance', coalesce(v_available, 0),
    'reservedBalance', coalesce(v_reserved, 0),
    'requestedAt', v_request.requested_at
  );
end;
$$;

create or replace function public.process_withdrawal_request(
  p_withdrawal_request_id uuid,
  p_status text,
  p_failure_reason text default null,
  p_actor_user_id uuid default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_request record;
  v_wallet record;
  v_existing record;
  v_decision text := lower(trim(coalesce(p_status, '')));
  v_failure_reason text := nullif(trim(coalesce(p_failure_reason, '')), '');
  v_available numeric;
  v_reserved numeric;
begin
  if p_withdrawal_request_id is null then
    raise exception '[WITHDRAW_VALIDATION] withdrawal request id is required.';
  end if;

  if v_decision not in ('completed', 'failed') then
    raise exception '[WITHDRAW_VALIDATION] status must be completed or failed.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception '[WITHDRAW_VALIDATION] idempotency key must be at least 8 characters.';
  end if;

  if length(trim(p_idempotency_key)) > 120 then
    raise exception '[WITHDRAW_VALIDATION] idempotency key must be 120 characters or less.';
  end if;

  select
    l.reference_id as withdrawal_request_id,
    l.wallet_account_id
  into v_existing
  from public.ledger_entries l
  where l.idempotency_key = trim(p_idempotency_key)
    and l.entry_type in ('withdrawal_complete'::public.ledger_entry_type, 'withdrawal_failed'::public.ledger_entry_type)
  limit 1;

  if found then
    select id, user_id, amount, currency, status, processed_at, failure_reason
    into v_request
    from public.withdrawal_requests
    where id = v_existing.withdrawal_request_id;

    select id, available_balance, reserved_balance
    into v_wallet
    from public.wallet_accounts
    where id = v_existing.wallet_account_id;

    return jsonb_build_object(
      'reused', true,
      'withdrawalRequestId', v_request.id,
      'status', v_request.status,
      'amount', v_request.amount,
      'currency', v_request.currency,
      'availableBalance', coalesce(v_wallet.available_balance, 0),
      'reservedBalance', coalesce(v_wallet.reserved_balance, 0),
      'processedAt', coalesce(v_request.processed_at, now()),
      'failureReason', coalesce(v_request.failure_reason, '')
    );
  end if;

  select id, user_id, amount, currency, status, processed_at, failure_reason
  into v_request
  from public.withdrawal_requests
  where id = p_withdrawal_request_id
  for update;

  if not found then
    raise exception '[WITHDRAW_NOT_FOUND] withdrawal request was not found.';
  end if;

  select id, available_balance, reserved_balance
  into v_wallet
  from public.wallet_accounts
  where user_id = v_request.user_id
  for update;

  if not found then
    raise exception '[WITHDRAW_CONFLICT] wallet account for withdrawal user does not exist.';
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object(
      'reused', true,
      'withdrawalRequestId', v_request.id,
      'status', v_request.status,
      'amount', v_request.amount,
      'currency', v_request.currency,
      'availableBalance', coalesce(v_wallet.available_balance, 0),
      'reservedBalance', coalesce(v_wallet.reserved_balance, 0),
      'processedAt', coalesce(v_request.processed_at, now()),
      'failureReason', coalesce(v_request.failure_reason, '')
    );
  end if;

  if coalesce(v_wallet.reserved_balance, 0) < v_request.amount then
    raise exception '[WITHDRAW_CONFLICT] wallet reserved balance is below withdrawal amount.';
  end if;

  if v_decision = 'completed' then
    update public.wallet_accounts
    set
      reserved_balance = greatest(0, coalesce(reserved_balance, 0) - v_request.amount)
    where id = v_wallet.id
    returning available_balance, reserved_balance
    into v_available, v_reserved;

    update public.withdrawal_requests
    set
      status = 'completed',
      failure_reason = null,
      processed_at = now(),
      processed_by = p_actor_user_id
    where id = v_request.id
    returning status, processed_at, failure_reason
    into v_request.status, v_request.processed_at, v_request.failure_reason;

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
      v_request.user_id,
      v_wallet.id,
      'withdrawal_complete'::public.ledger_entry_type,
      0,
      v_request.currency,
      trim(p_idempotency_key),
      'withdrawal_requests',
      v_request.id,
      jsonb_build_object(
        'withdrawalRequestId', v_request.id,
        'stage', 'completed',
        'amount', v_request.amount
      ) || coalesce(p_metadata, '{}'::jsonb)
    );
  else
    update public.wallet_accounts
    set
      available_balance = coalesce(available_balance, 0) + v_request.amount,
      reserved_balance = greatest(0, coalesce(reserved_balance, 0) - v_request.amount)
    where id = v_wallet.id
    returning available_balance, reserved_balance
    into v_available, v_reserved;

    update public.withdrawal_requests
    set
      status = 'failed',
      failure_reason = coalesce(v_failure_reason, 'auto_risk_check_failed'),
      processed_at = now(),
      processed_by = p_actor_user_id
    where id = v_request.id
    returning status, processed_at, failure_reason
    into v_request.status, v_request.processed_at, v_request.failure_reason;

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
      v_request.user_id,
      v_wallet.id,
      'withdrawal_failed'::public.ledger_entry_type,
      v_request.amount,
      v_request.currency,
      trim(p_idempotency_key),
      'withdrawal_requests',
      v_request.id,
      jsonb_build_object(
        'withdrawalRequestId', v_request.id,
        'stage', 'failed',
        'reason', coalesce(v_request.failure_reason, 'unknown')
      ) || coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'reused', false,
    'withdrawalRequestId', v_request.id,
    'status', v_request.status,
    'amount', v_request.amount,
    'currency', v_request.currency,
    'availableBalance', coalesce(v_available, 0),
    'reservedBalance', coalesce(v_reserved, 0),
    'processedAt', coalesce(v_request.processed_at, now()),
    'failureReason', coalesce(v_request.failure_reason, '')
  );
end;
$$;

grant execute on function public.request_withdrawal(uuid, numeric, text, text, jsonb) to service_role;
grant execute on function public.process_withdrawal_request(uuid, text, text, uuid, text, jsonb) to service_role;
