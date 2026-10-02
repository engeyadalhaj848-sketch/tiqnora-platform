-- Additive tables missing from 060. Full tenant security.
-- Does NOT recreate ai_agent_evals / ai_agent_messages / ai_agent_learning_events / ai_knowledge_*.

create table if not exists public.agent_memory_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  memory_id text not null,
  agent_key text,
  memory_type text not null
    check (memory_type in ('working','episodic','semantic','shared','customer')),
  scope text not null default 'agent'
    check (scope in ('agent','shared','customer','organization')),
  customer_id text,
  key text not null,
  content text not null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) default 1.0,
  source text,
  tags text[] not null default '{}',
  expires_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, memory_id)
);
create index if not exists idx_agent_memory_entries_org_type
  on public.agent_memory_entries(organization_id, memory_type, created_at desc)
  where archived_at is null;

create table if not exists public.agent_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  artifact_id text not null,
  task_id uuid,
  workflow_run_id uuid,
  trace_id text,
  creator_agent_key text not null,
  artifact_type text not null,
  uri text,
  storage_path text,
  storage_bucket text,
  reference_id text,
  content text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified','failed','pending')),
  verified_at timestamptz,
  verification_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, artifact_id)
);
create index if not exists idx_agent_artifacts_org_trace
  on public.agent_artifacts(organization_id, trace_id)
  where trace_id is not null;

create table if not exists public.agent_traces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trace_id text not null,
  workflow_run_id uuid,
  task_id uuid,
  root_agent_key text,
  trigger text not null default 'manual',
  status text not null default 'running'
    check (status in ('queued','running','waiting_approval','completed','failed','cancelled','skipped')),
  summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms int,
  created_at timestamptz not null default now(),
  unique (organization_id, trace_id)
);
create unique index if not exists agent_traces_trace_id_global on public.agent_traces(trace_id);

create table if not exists public.agent_trace_spans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trace_id text not null,
  span_id text not null,
  parent_span_id text,
  agent_key text,
  span_type text not null default 'step',
  name text not null,
  status text not null default 'running',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  duration_ms int,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trace_id, span_id)
);
create index if not exists idx_agent_trace_spans_org_trace
  on public.agent_trace_spans(organization_id, trace_id, created_at);

-- RLS
alter table public.agent_memory_entries enable row level security;
alter table public.agent_artifacts enable row level security;
alter table public.agent_traces enable row level security;
alter table public.agent_trace_spans enable row level security;

revoke all on public.agent_memory_entries from anon, authenticated;
revoke all on public.agent_artifacts from anon, authenticated;
revoke all on public.agent_traces from anon, authenticated;
revoke all on public.agent_trace_spans from anon, authenticated;

grant select, insert, update on public.agent_memory_entries to authenticated;
grant select, insert, update on public.agent_artifacts to authenticated;
grant select, insert, update on public.agent_traces to authenticated;
grant select, insert, update on public.agent_trace_spans to authenticated;

drop policy if exists agent_memory_entries_admin on public.agent_memory_entries;
create policy agent_memory_entries_admin on public.agent_memory_entries
  for all to authenticated
  using ((select public.is_admin()) and organization_id in (
    select m.organization_id from public.organization_members m where m.user_id = (select auth.uid())
    union
    select p.default_organization_id from public.profiles p where p.id = (select auth.uid())
  ))
  with check ((select public.is_admin()) and organization_id in (
    select m.organization_id from public.organization_members m where m.user_id = (select auth.uid())
    union
    select p.default_organization_id from public.profiles p where p.id = (select auth.uid())
  ));

drop policy if exists agent_artifacts_admin on public.agent_artifacts;
create policy agent_artifacts_admin on public.agent_artifacts
  for all to authenticated
  using ((select public.is_admin()) and organization_id in (
    select m.organization_id from public.organization_members m where m.user_id = (select auth.uid())
    union
    select p.default_organization_id from public.profiles p where p.id = (select auth.uid())
  ))
  with check ((select public.is_admin()) and organization_id in (
    select m.organization_id from public.organization_members m where m.user_id = (select auth.uid())
    union
    select p.default_organization_id from public.profiles p where p.id = (select auth.uid())
  ));

drop policy if exists agent_traces_admin on public.agent_traces;
create policy agent_traces_admin on public.agent_traces
  for all to authenticated
  using ((select public.is_admin()) and organization_id in (
    select m.organization_id from public.organization_members m where m.user_id = (select auth.uid())
    union
    select p.default_organization_id from public.profiles p where p.id = (select auth.uid())
  ))
  with check ((select public.is_admin()) and organization_id in (
    select m.organization_id from public.organization_members m where m.user_id = (select auth.uid())
    union
    select p.default_organization_id from public.profiles p where p.id = (select auth.uid())
  ));

drop policy if exists agent_trace_spans_admin on public.agent_trace_spans;
create policy agent_trace_spans_admin on public.agent_trace_spans
  for all to authenticated
  using ((select public.is_admin()) and organization_id in (
    select m.organization_id from public.organization_members m where m.user_id = (select auth.uid())
    union
    select p.default_organization_id from public.profiles p where p.id = (select auth.uid())
  ))
  with check ((select public.is_admin()) and organization_id in (
    select m.organization_id from public.organization_members m where m.user_id = (select auth.uid())
    union
    select p.default_organization_id from public.profiles p where p.id = (select auth.uid())
  ));
