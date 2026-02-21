-- Step 21: Admin institution merge utilities.

create or replace function public.replace_institution_org_in_access_rules(
  p_access_rules jsonb,
  p_source_organization_id uuid,
  p_target_organization_id uuid
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_rules jsonb := coalesce(p_access_rules, '{}'::jsonb);
  v_item text;
  v_updated_ids jsonb := '[]'::jsonb;
begin
  if p_source_organization_id is null or p_target_organization_id is null then
    return v_rules;
  end if;

  if public.try_parse_uuid(v_rules ->> 'organizationId') = p_source_organization_id then
    v_rules := jsonb_set(v_rules, '{organizationId}', to_jsonb(p_target_organization_id::text), true);
  end if;

  if jsonb_typeof(v_rules -> 'organizationIds') = 'array' then
    v_updated_ids := '[]'::jsonb;

    for v_item in
      select value
      from jsonb_array_elements_text(v_rules -> 'organizationIds')
    loop
      if public.try_parse_uuid(v_item) = p_source_organization_id then
        v_updated_ids := v_updated_ids || to_jsonb(p_target_organization_id::text);
      else
        v_updated_ids := v_updated_ids || to_jsonb(v_item);
      end if;
    end loop;

    v_rules := jsonb_set(v_rules, '{organizationIds}', v_updated_ids, true);
  end if;

  return v_rules;
end;
$$;

create or replace function public.admin_merge_institutions(
  p_admin_user_id uuid,
  p_source_organization_id uuid,
  p_target_organization_id uuid,
  p_delete_source boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_source record;
  v_target record;
  v_domains_moved integer := 0;
  v_domains_deduplicated integer := 0;
  v_emails_moved integer := 0;
  v_memberships_moved integer := 0;
  v_roles_moved integer := 0;
  v_runs_moved integer := 0;
  v_proposals_moved integer := 0;
  v_markets_updated integer := 0;
  v_source_deleted boolean := false;
begin
  if p_admin_user_id is null then
    raise exception '[INST_FORBIDDEN] admin user is required.';
  end if;

  if not public.is_platform_admin(p_admin_user_id) then
    raise exception '[INST_FORBIDDEN] platform admin role required.';
  end if;

  if p_source_organization_id is null or p_target_organization_id is null then
    raise exception '[INST_VALIDATION] source and target institution ids are required.';
  end if;

  if p_source_organization_id = p_target_organization_id then
    raise exception '[INST_VALIDATION] source and target institutions must differ.';
  end if;

  select id, name, slug
  into v_source
  from public.organizations
  where id = p_source_organization_id
  for update;

  if not found then
    raise exception '[INST_NOT_FOUND] source institution not found.';
  end if;

  select id, name, slug
  into v_target
  from public.organizations
  where id = p_target_organization_id
  for update;

  if not found then
    raise exception '[INST_NOT_FOUND] target institution not found.';
  end if;

  update public.organization_domains d
  set organization_id = p_target_organization_id
  where d.organization_id = p_source_organization_id
    and not exists (
      select 1
      from public.organization_domains existing
      where existing.organization_id = p_target_organization_id
        and existing.domain = d.domain
    );
  get diagnostics v_domains_moved = row_count;

  with removed as (
    delete from public.organization_domains d
    where d.organization_id = p_source_organization_id
      and exists (
        select 1
        from public.organization_domains existing
        where existing.organization_id = p_target_organization_id
          and existing.domain = d.domain
      )
    returning 1
  )
  select count(*) into v_domains_deduplicated
  from removed;

  update public.user_institution_emails
  set
    organization_id = p_target_organization_id,
    updated_at = v_now
  where organization_id = p_source_organization_id;
  get diagnostics v_emails_moved = row_count;

  with source_memberships as (
    select
      user_id,
      membership_role,
      verified_by,
      created_at,
      coalesce(status, 'revoked') as status,
      verified_at
    from public.organization_memberships
    where organization_id = p_source_organization_id
  ),
  removed_source as (
    delete from public.organization_memberships
    where organization_id = p_source_organization_id
    returning user_id
  ),
  upserted as (
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
    select
      p_target_organization_id,
      s.user_id,
      s.membership_role,
      s.verified_by,
      s.created_at,
      case when s.status = 'active' then 'active' else 'revoked' end,
      s.verified_at,
      case when s.status = 'active' then null else v_now end,
      case when s.status = 'active' then null else 'institution_merged' end
    from source_memberships s
    on conflict (organization_id, user_id)
    do update
      set
        membership_role = excluded.membership_role,
        verified_by = coalesce(excluded.verified_by, public.organization_memberships.verified_by),
        verified_at = coalesce(excluded.verified_at, public.organization_memberships.verified_at),
        status = case
          when excluded.status = 'active' then 'active'
          else public.organization_memberships.status
        end,
        revoked_at = case
          when excluded.status = 'active' then null
          else public.organization_memberships.revoked_at
        end,
        revoked_reason = case
          when excluded.status = 'active' then null
          else public.organization_memberships.revoked_reason
        end
    returning 1
  )
  select count(*) into v_memberships_moved
  from upserted;

  with source_roles as (
    select user_id, role, created_at
    from public.user_roles
    where organization_id = p_source_organization_id
  ),
  inserted_roles as (
    insert into public.user_roles (user_id, role, organization_id, created_at)
    select
      r.user_id,
      r.role,
      p_target_organization_id,
      r.created_at
    from source_roles r
    on conflict (user_id, role, organization_id)
    do nothing
    returning 1
  ),
  removed_roles as (
    delete from public.user_roles
    where organization_id = p_source_organization_id
    returning 1
  )
  select count(*) into v_roles_moved
  from inserted_roles;

  update public.market_research_runs
  set organization_id = p_target_organization_id
  where organization_id = p_source_organization_id;
  get diagnostics v_runs_moved = row_count;

  update public.market_research_proposals
  set organization_id = p_target_organization_id
  where organization_id = p_source_organization_id;
  get diagnostics v_proposals_moved = row_count;

  update public.markets m
  set access_rules = public.replace_institution_org_in_access_rules(
    m.access_rules,
    p_source_organization_id,
    p_target_organization_id
  )
  where public.resolve_market_required_organization_id(m.access_rules) = p_source_organization_id;
  get diagnostics v_markets_updated = row_count;

  if p_delete_source then
    delete from public.organizations
    where id = p_source_organization_id;
    v_source_deleted := found;
  end if;

  insert into public.admin_action_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    p_admin_user_id,
    'merge_institutions',
    'organization',
    p_target_organization_id,
    jsonb_build_object(
      'sourceOrganizationId', p_source_organization_id,
      'targetOrganizationId', p_target_organization_id,
      'sourceOrganizationName', v_source.name,
      'targetOrganizationName', v_target.name,
      'domainsMoved', v_domains_moved,
      'domainsDeduplicated', v_domains_deduplicated,
      'emailsMoved', v_emails_moved,
      'membershipsMoved', v_memberships_moved,
      'rolesMoved', v_roles_moved,
      'runsMoved', v_runs_moved,
      'proposalsMoved', v_proposals_moved,
      'marketsUpdated', v_markets_updated,
      'sourceDeleted', v_source_deleted
    )
  );

  return jsonb_build_object(
    'sourceOrganizationId', p_source_organization_id,
    'targetOrganizationId', p_target_organization_id,
    'sourceOrganizationName', v_source.name,
    'targetOrganizationName', v_target.name,
    'domainsMoved', v_domains_moved,
    'domainsDeduplicated', v_domains_deduplicated,
    'emailsMoved', v_emails_moved,
    'membershipsMoved', v_memberships_moved,
    'rolesMoved', v_roles_moved,
    'runsMoved', v_runs_moved,
    'proposalsMoved', v_proposals_moved,
    'marketsUpdated', v_markets_updated,
    'sourceDeleted', v_source_deleted
  );
end;
$$;

grant execute on function public.admin_merge_institutions(uuid, uuid, uuid, boolean) to service_role;
