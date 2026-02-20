-- Step 20: Institution-verified access + single active institution membership

-- 1) Membership lifecycle fields (single active institution per user)
alter table public.organization_memberships
  add column if not exists status text,
  add column if not exists verified_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

update public.organization_memberships
set
  status = coalesce(status, 'active'),
  verified_at = coalesce(verified_at, created_at, now())
where status is null
   or verified_at is null;

alter table public.organization_memberships
  alter column status set default 'active',
  alter column status set not null;

alter table public.organization_memberships
  drop constraint if exists organization_memberships_status_check;

alter table public.organization_memberships
  add constraint organization_memberships_status_check
  check (status in ('active', 'revoked'));

-- Keep exactly one active organization membership per user.
-- If drift already exists, retain most recently verified membership as active.
with ranked as (
  select
    id,
    user_id,
    row_number() over (
      partition by user_id
      order by coalesce(verified_at, created_at) desc, created_at desc, id desc
    ) as rank_order
  from public.organization_memberships
  where status = 'active'
)
update public.organization_memberships om
set
  status = 'revoked',
  revoked_at = now(),
  revoked_reason = coalesce(om.revoked_reason, 'migration_single_active_enforcement')
from ranked
where om.id = ranked.id
  and ranked.rank_order > 1;

create unique index if not exists organization_memberships_one_active_per_user_idx
  on public.organization_memberships (user_id)
  where status = 'active';

create index if not exists organization_memberships_user_status_idx
  on public.organization_memberships (user_id, status);

-- 2) Verified institution email identities
create table if not exists public.user_institution_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  domain text not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status text not null default 'pending_verification' check (status in ('pending_verification', 'verified', 'revoked')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_institution_emails_email_lower check (email = lower(email)),
  constraint user_institution_emails_domain_lower check (domain = lower(domain)),
  constraint user_institution_emails_domain_edu check (domain ~ '^[a-z0-9.-]+\\.edu$'),
  constraint user_institution_emails_email_matches_domain check (split_part(email, '@', 2) = domain)
);

create unique index if not exists user_institution_emails_email_unique_idx
  on public.user_institution_emails (email);

create index if not exists user_institution_emails_user_status_idx
  on public.user_institution_emails (user_id, status);

create index if not exists user_institution_emails_org_idx
  on public.user_institution_emails (organization_id);

create trigger user_institution_emails_set_updated_at
before update on public.user_institution_emails
for each row execute function public.set_updated_at();

-- 3) Verification challenges for institution emails
create table if not exists public.institution_email_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_email_id uuid not null references public.user_institution_emails(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institution_email_challenges_user_created_idx
  on public.institution_email_challenges (user_id, created_at desc);

create index if not exists institution_email_challenges_email_idx
  on public.institution_email_challenges (institution_email_id, created_at desc);

create unique index if not exists institution_email_challenges_one_open_idx
  on public.institution_email_challenges (institution_email_id)
  where consumed_at is null;

create trigger institution_email_challenges_set_updated_at
before update on public.institution_email_challenges
for each row execute function public.set_updated_at();

-- 4) Access helper functions
create or replace function public.try_parse_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_uuid uuid;
begin
  if p_value is null or length(trim(p_value)) = 0 then
    return null;
  end if;

  begin
    v_uuid := trim(p_value)::uuid;
  exception when others then
    v_uuid := null;
  end;

  return v_uuid;
end;
$$;

create or replace function public.resolve_market_required_organization_id(p_access_rules jsonb)
returns uuid
language plpgsql
stable
as $$
declare
  v_candidate text;
  v_candidate_uuid uuid;
begin
  if p_access_rules is null then
    return null;
  end if;

  v_candidate := nullif(trim(coalesce(p_access_rules ->> 'organizationId', '')), '');
  v_candidate_uuid := public.try_parse_uuid(v_candidate);
  if v_candidate_uuid is not null then
    return v_candidate_uuid;
  end if;

  if jsonb_typeof(p_access_rules -> 'organizationIds') = 'array' then
    for v_candidate in
      select value
      from jsonb_array_elements_text(p_access_rules -> 'organizationIds')
    loop
      v_candidate_uuid := public.try_parse_uuid(v_candidate);
      if v_candidate_uuid is not null then
        return v_candidate_uuid;
      end if;
    end loop;
  end if;

  return null;
end;
$$;

create or replace function public.resolve_active_user_organization_id(p_user_id uuid)
returns uuid
language sql
stable
as $$
  select om.organization_id
  from public.organization_memberships om
  where om.user_id = p_user_id
    and om.status = 'active'
  order by coalesce(om.verified_at, om.created_at) desc, om.created_at desc
  limit 1;
$$;

create or replace function public.user_has_market_position(p_user_id uuid, p_market_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.positions p
    where p.user_id = p_user_id
      and p.market_id = p_market_id
      and (
        coalesce(p.yes_shares, 0) > 0
        or coalesce(p.no_shares, 0) > 0
      )
  );
$$;

create or replace function public.can_user_read_market(
  p_user_id uuid,
  p_market_id uuid,
  p_creator_id uuid,
  p_visibility public.market_visibility,
  p_access_rules jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_required_org uuid;
  v_active_org uuid;
begin
  v_required_org := public.resolve_market_required_organization_id(p_access_rules);

  if p_visibility in ('public', 'unlisted') and v_required_org is null then
    return true;
  end if;

  if p_user_id is null then
    return false;
  end if;

  if p_creator_id = p_user_id or public.is_platform_admin(p_user_id) then
    return true;
  end if;

  if v_required_org is null then
    return false;
  end if;

  v_active_org := public.resolve_active_user_organization_id(p_user_id);
  if v_active_org is not null and v_active_org = v_required_org then
    return true;
  end if;

  if public.user_has_market_position(p_user_id, p_market_id) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.can_user_trade_market(
  p_user_id uuid,
  p_market_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_market record;
  v_required_org uuid;
  v_active_org uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  select id, creator_id, visibility, access_rules
  into v_market
  from public.markets
  where id = p_market_id;

  if not found then
    return false;
  end if;

  if v_market.creator_id = p_user_id or public.is_platform_admin(p_user_id) then
    return true;
  end if;

  v_required_org := public.resolve_market_required_organization_id(v_market.access_rules);

  if v_required_org is null then
    return v_market.visibility in ('public', 'unlisted');
  end if;

  v_active_org := public.resolve_active_user_organization_id(p_user_id);
  return v_active_org is not null and v_active_org = v_required_org;
end;
$$;

create or replace function public.verify_institution_email_challenge(
  p_user_id uuid,
  p_challenge_id uuid,
  p_code_hash text,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_challenge record;
  v_org record;
  v_max_attempts integer := greatest(1, coalesce(p_max_attempts, 5));
begin
  if p_user_id is null then
    raise exception '[INST_FORBIDDEN] authenticated user is required.';
  end if;

  if p_challenge_id is null then
    raise exception '[INST_VALIDATION] challenge id is required.';
  end if;

  if p_code_hash is null or length(trim(p_code_hash)) = 0 then
    raise exception '[INST_VALIDATION] code hash is required.';
  end if;

  select
    c.id,
    c.user_id,
    c.institution_email_id,
    c.code_hash,
    c.expires_at,
    c.consumed_at,
    c.attempt_count,
    e.organization_id,
    e.email
  into v_challenge
  from public.institution_email_challenges c
  join public.user_institution_emails e
    on e.id = c.institution_email_id
  where c.id = p_challenge_id
    and c.user_id = p_user_id
  for update;

  if not found then
    raise exception '[INST_NOT_FOUND] institution verification challenge not found.';
  end if;

  if v_challenge.consumed_at is not null then
    raise exception '[INST_CONFLICT] institution verification challenge already consumed.';
  end if;

  if v_challenge.expires_at <= v_now then
    raise exception '[INST_EXPIRED] institution verification challenge expired.';
  end if;

  if v_challenge.attempt_count >= v_max_attempts then
    raise exception '[INST_TOO_MANY_ATTEMPTS] verification attempts exceeded.';
  end if;

  if v_challenge.code_hash <> p_code_hash then
    update public.institution_email_challenges
    set
      attempt_count = attempt_count + 1,
      updated_at = v_now
    where id = p_challenge_id;

    raise exception '[INST_INVALID_CODE] verification code is invalid.';
  end if;

  update public.institution_email_challenges
  set
    consumed_at = v_now,
    updated_at = v_now
  where id = p_challenge_id;

  update public.user_institution_emails
  set
    status = 'verified',
    verified_at = coalesce(verified_at, v_now),
    updated_at = v_now
  where id = v_challenge.institution_email_id;

  update public.organization_memberships
  set
    status = 'revoked',
    revoked_at = v_now,
    revoked_reason = 'switched_institution'
  where user_id = p_user_id
    and status = 'active'
    and organization_id <> v_challenge.organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    membership_role,
    verified_by,
    created_at,
    status,
    verified_at,
    revoked_at,
    revoked_reason
  )
  values (
    v_challenge.organization_id,
    p_user_id,
    'member',
    null,
    v_now,
    'active',
    v_now,
    null,
    null
  )
  on conflict (organization_id, user_id)
  do update
    set
      status = 'active',
      verified_at = excluded.verified_at,
      revoked_at = null,
      revoked_reason = null;

  select id, name, slug
  into v_org
  from public.organizations
  where id = v_challenge.organization_id;

  return jsonb_build_object(
    'organizationId', v_org.id,
    'organizationName', v_org.name,
    'organizationSlug', v_org.slug,
    'verifiedEmail', v_challenge.email,
    'verifiedAt', v_now
  );
end;
$$;

-- 5) RLS updates for institution-aware market reads
alter table public.user_institution_emails enable row level security;
alter table public.institution_email_challenges enable row level security;

drop policy if exists user_institution_emails_select_own_or_admin on public.user_institution_emails;
create policy user_institution_emails_select_own_or_admin
on public.user_institution_emails
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists user_institution_emails_insert_own_or_admin on public.user_institution_emails;
create policy user_institution_emails_insert_own_or_admin
on public.user_institution_emails
for insert
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists user_institution_emails_update_own_or_admin on public.user_institution_emails;
create policy user_institution_emails_update_own_or_admin
on public.user_institution_emails
for update
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists institution_email_challenges_select_own_or_admin on public.institution_email_challenges;
create policy institution_email_challenges_select_own_or_admin
on public.institution_email_challenges
for select
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists institution_email_challenges_insert_own_or_admin on public.institution_email_challenges;
create policy institution_email_challenges_insert_own_or_admin
on public.institution_email_challenges
for insert
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists institution_email_challenges_update_own_or_admin on public.institution_email_challenges;
create policy institution_email_challenges_update_own_or_admin
on public.institution_email_challenges
for update
using (user_id = auth.uid() or public.is_platform_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists markets_select_visible_creator_or_admin on public.markets;
create policy markets_select_visible_creator_or_admin
on public.markets
for select
using (
  public.can_user_read_market(
    auth.uid(),
    id,
    creator_id,
    visibility,
    access_rules
  )
);

drop policy if exists market_sources_select on public.market_sources;
create policy market_sources_select
on public.market_sources
for select
using (
  exists (
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

drop policy if exists market_evidence_select on public.market_evidence;
create policy market_evidence_select
on public.market_evidence
for select
using (
  exists (
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

drop policy if exists market_disputes_select on public.market_disputes;
create policy market_disputes_select
on public.market_disputes
for select
using (
  exists (
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

drop policy if exists market_amm_state_select on public.market_amm_state;
create policy market_amm_state_select
on public.market_amm_state
for select
using (
  exists (
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

-- Service role execution grants for explicit RPC calls.
grant execute on function public.verify_institution_email_challenge(uuid, uuid, text, integer) to service_role;
grant execute on function public.resolve_active_user_organization_id(uuid) to service_role;
grant execute on function public.resolve_market_required_organization_id(jsonb) to service_role;
grant execute on function public.can_user_trade_market(uuid, uuid) to service_role;
