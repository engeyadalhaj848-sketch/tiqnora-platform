-- Tiqnora V6 — AI Workforce Orchestration (additive)
-- Reuses ai_tasks / ai_agents / actions. Adds workflow_runs + workflow_steps.

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_type text not null,
  trigger text not null default 'manual',
  status text not null default 'queued'
    check (status in ('queued','running','waiting_approval','completed','failed','cancelled','skipped')),
  current_step text,
  idempotency_key text,
  event_id text,
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_workflow_runs_org on public.workflow_runs(organization_id, created_at desc);
create index if not exists idx_workflow_runs_status on public.workflow_runs(organization_id, status);
alter table public.workflow_runs
  add constraint workflow_runs_idempotency_unique
  unique (organization_id, workflow_type, idempotency_key);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_key text not null,
  agent_key text,
  status text not null default 'queued'
    check (status in ('queued','running','waiting_dependency','waiting_approval','completed','failed','cancelled','skipped')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  duration_ms int,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, step_key)
);
create index if not exists idx_workflow_steps_run on public.workflow_steps(run_id, created_at);

-- Optional link from ai_tasks to workflow
alter table public.ai_tasks add column if not exists workflow_run_id uuid;
alter table public.ai_tasks add column if not exists workflow_step_key text;
alter table public.ai_tasks add column if not exists attempt_count int default 0;
alter table public.ai_tasks add column if not exists max_attempts int default 3;

alter table public.ai_tasks
  add constraint ai_tasks_workflow_run_id_fkey
  foreign key (workflow_run_id)
  references public.workflow_runs(id)
  on delete set null;

create index if not exists idx_ai_tasks_workflow_run
  on public.ai_tasks(workflow_run_id)
  where workflow_run_id is not null;

alter table public.workflow_runs enable row level security;
alter table public.workflow_steps enable row level security;

drop policy if exists workflow_runs_org on public.workflow_runs;
create policy workflow_runs_org on public.workflow_runs
  for all to authenticated
  using (
    (select public.is_admin())
    and (
      organization_id = (select p.default_organization_id from public.profiles p where p.id = (select auth.uid()))
      or exists (
        select 1 from public.organization_members m
        where m.user_id = (select auth.uid())
          and m.organization_id = workflow_runs.organization_id
      )
    )
  )
  with check (
    (select public.is_admin())
    and (
      organization_id = (select p.default_organization_id from public.profiles p where p.id = (select auth.uid()))
      or exists (
        select 1 from public.organization_members m
        where m.user_id = (select auth.uid())
          and m.organization_id = workflow_runs.organization_id
      )
    )
  );

drop policy if exists workflow_steps_org on public.workflow_steps;
create policy workflow_steps_org on public.workflow_steps
  for all to authenticated
  using (
    (select public.is_admin())
    and (
      organization_id = (select p.default_organization_id from public.profiles p where p.id = (select auth.uid()))
      or exists (
        select 1 from public.organization_members m
        where m.user_id = (select auth.uid())
          and m.organization_id = workflow_steps.organization_id
      )
    )
  )
  with check (
    (select public.is_admin())
    and (
      organization_id = (select p.default_organization_id from public.profiles p where p.id = (select auth.uid()))
      or exists (
        select 1 from public.organization_members m
        where m.user_id = (select auth.uid())
          and m.organization_id = workflow_steps.organization_id
      )
    )
  );

revoke all on public.workflow_runs from anon, authenticated;
revoke all on public.workflow_steps from anon, authenticated;
grant select, insert, update on public.workflow_runs to authenticated;
grant select, insert, update on public.workflow_steps to authenticated;
