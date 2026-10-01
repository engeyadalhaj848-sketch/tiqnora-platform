-- Tiqnora Agent Concepts Runtime v1
-- Memory & State, RAG, Evals, Skills metadata, A2A audit trail.
-- Additive only. Existing workforce orchestration remains authoritative for external actions.

create table if not exists public.ai_agent_state (
  agent_id uuid primary key references public.ai_agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version bigint not null default 1,
  mode text not null default 'ready',
  current_goal text,
  active_thread text,
  last_outcome text,
  counters jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_agent_state_org on public.ai_agent_state(organization_id, updated_at desc);

create table if not exists public.ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  source_type text not null default 'internal',
  source_uri text,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_knowledge_documents_org on public.ai_knowledge_documents(organization_id, is_active, updated_at desc);

create table if not exists public.ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.ai_knowledge_documents(id) on delete cascade,
  ordinal int not null default 0,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  unique(document_id, ordinal)
);
create index if not exists idx_ai_knowledge_chunks_org on public.ai_knowledge_chunks(organization_id, document_id);
create index if not exists idx_ai_knowledge_chunks_search on public.ai_knowledge_chunks using gin(search_vector);

create table if not exists public.ai_agent_evals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  conversation_id uuid,
  rubric text not null default 'tiqnora-agent-eval/v1',
  score int not null check (score between 0 and 100),
  passed boolean not null default false,
  dimensions jsonb not null default '{}'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_agent_evals_agent on public.ai_agent_evals(agent_id, created_at desc);
create index if not exists idx_ai_agent_evals_org on public.ai_agent_evals(organization_id, created_at desc);

create table if not exists public.ai_agent_learning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  source_eval_id uuid references public.ai_agent_evals(id) on delete set null,
  lesson_key text not null,
  lesson text not null,
  status text not null default 'proposed'
    check (status in ('proposed','approved','rejected','applied')),
  auto_apply boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_agent_learning_events_agent on public.ai_agent_learning_events(agent_id, status, created_at desc);

create table if not exists public.ai_agent_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  protocol text not null default 'tiqnora-a2a/v1',
  correlation_id text not null,
  message_id text not null,
  from_agent_id uuid references public.ai_agents(id) on delete set null,
  to_agent_id uuid references public.ai_agents(id) on delete set null,
  message_type text not null check (message_type in ('task','message','artifact','handoff')),
  task text,
  message text,
  artifact jsonb,
  hop int not null default 1 check (hop between 1 and 4),
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','cancelled')),
  requires_approval boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(organization_id, message_id)
);
create index if not exists idx_ai_agent_messages_corr on public.ai_agent_messages(organization_id, correlation_id, created_at);
create index if not exists idx_ai_agent_messages_to on public.ai_agent_messages(to_agent_id, status, created_at);

create or replace function public.search_agent_knowledge(
  p_organization_id uuid,
  p_query text,
  p_match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  title text,
  source_uri text,
  content text,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('simple', coalesce(nullif(trim(p_query), ''), '')) as query
  )
  select
    c.id,
    c.document_id,
    d.title,
    d.source_uri,
    c.content,
    greatest(
      ts_rank_cd(c.search_vector, q.query),
      case when c.content ilike '%' || p_query || '%' then 0.5 else 0 end
    )::real as rank
  from public.ai_knowledge_chunks c
  join public.ai_knowledge_documents d on d.id = c.document_id
  cross join q
  where c.organization_id = p_organization_id
    and d.is_active = true
    and trim(coalesce(p_query, '')) <> ''
    and (
      c.search_vector @@ q.query
      or c.content ilike '%' || p_query || '%'
      or d.title ilike '%' || p_query || '%'
    )
  order by rank desc, c.ordinal asc
  limit greatest(1, least(coalesce(p_match_count, 8), 8));
$$;

alter table public.ai_agent_state enable row level security;
alter table public.ai_knowledge_documents enable row level security;
alter table public.ai_knowledge_chunks enable row level security;
alter table public.ai_agent_evals enable row level security;
alter table public.ai_agent_learning_events enable row level security;
alter table public.ai_agent_messages enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_agent_state',
    'ai_knowledge_documents',
    'ai_knowledge_chunks',
    'ai_agent_evals',
    'ai_agent_learning_events',
    'ai_agent_messages'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_org', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_admin()) and (organization_id = (select p.default_organization_id from public.profiles p where p.id = (select auth.uid())) or exists (select 1 from public.organization_members m where m.user_id = (select auth.uid()) and m.organization_id = %I.organization_id))) with check ((select public.is_admin()) and (organization_id = (select p.default_organization_id from public.profiles p where p.id = (select auth.uid())) or exists (select 1 from public.organization_members m where m.user_id = (select auth.uid()) and m.organization_id = %I.organization_id)))',
      t || '_admin_org', t, t, t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

grant execute on function public.search_agent_knowledge(uuid, text, int) to authenticated;

-- Learning is deliberately review-gated: the runtime may propose lessons,
-- but no lesson can silently mutate prompts, skills, code, or tool permissions.
