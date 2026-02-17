create table public.market_research_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('public', 'institution')),
  organization_id uuid references public.organizations(id) on delete set null,
  status text not null check (status in ('running', 'completed', 'partial', 'failed', 'skipped')),
  model_name text not null,
  trigger_source text not null default 'codex_automation',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  check (
    (scope = 'public' and organization_id is null)
    or (scope = 'institution')
  )
);

create table public.market_research_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.market_research_runs(id) on delete cascade,
  scope text not null check (scope in ('public', 'institution')),
  scope_key text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  event_fingerprint text not null,
  question text not null,
  category text not null,
  us_focus boolean not null,
  confidence numeric(4, 3) not null check (confidence >= 0 and confidence <= 1),
  proposal_payload jsonb not null,
  sources_snapshot jsonb not null,
  submission_status text not null check (
    submission_status in (
      'submitted_review',
      'skipped_duplicate',
      'skipped_quality',
      'skipped_invalid',
      'submit_failed'
    )
  ),
  submitted_market_id uuid references public.markets(id) on delete set null,
  submission_error text,
  created_at timestamptz not null default now(),
  check (char_length(scope_key) > 0),
  check (char_length(event_fingerprint) > 0),
  check (
    (scope = 'public' and organization_id is null and scope_key = 'public')
    or (scope = 'institution' and organization_id is not null)
  )
);

create unique index market_research_proposals_scope_fingerprint_uidx
  on public.market_research_proposals (scope_key, event_fingerprint);

create index market_research_runs_scope_started_idx
  on public.market_research_runs (scope, started_at desc);

create index market_research_runs_org_started_idx
  on public.market_research_runs (organization_id, started_at desc);

create index market_research_proposals_run_created_idx
  on public.market_research_proposals (run_id, created_at desc);

create index market_research_proposals_scope_created_idx
  on public.market_research_proposals (scope, created_at desc);

create unique index market_research_runs_running_scope_uidx
  on public.market_research_runs (scope, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'running';

alter table public.market_research_runs enable row level security;
alter table public.market_research_proposals enable row level security;

create policy market_research_runs_admin_only
on public.market_research_runs
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

create policy market_research_proposals_admin_only
on public.market_research_proposals
for all
using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));
