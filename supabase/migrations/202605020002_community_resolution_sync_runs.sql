-- Persist lightweight community-resolution cron summaries for admin-only
-- production smoke checks.

create table if not exists public.community_resolution_sync_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('completed', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  ran_at timestamptz not null default now()
);

create index if not exists community_resolution_sync_runs_ran_at_idx
  on public.community_resolution_sync_runs (ran_at desc);

alter table public.community_resolution_sync_runs enable row level security;

drop policy if exists community_resolution_sync_runs_admin_select
on public.community_resolution_sync_runs;

create policy community_resolution_sync_runs_admin_select
on public.community_resolution_sync_runs
for select
using (public.is_platform_admin(auth.uid()));

grant select on public.community_resolution_sync_runs to authenticated;
grant all on public.community_resolution_sync_runs to service_role;
