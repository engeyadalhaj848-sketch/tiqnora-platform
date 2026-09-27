-- Tiqnora — Apify integration (additive, non-destructive)
-- Secrets stay in Vercel env (APIFY_TOKEN). Never store tokens in DB.

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_class t on c.conrelid = t.oid
  join pg_namespace n on t.relnamespace = n.oid
  where n.nspname = 'public'
    and t.relname = 'integration_connections'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%provider%';
  if conname is not null then
    execute format('alter table public.integration_connections drop constraint %I', conname);
  end if;
exception when others then null;
end $$;

alter table public.integration_connections drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider in (
    'openai','anthropic','google_ai','resend','stripe','whop','smsa','saudi_post',
    'meta','linkedin','tiktok','vapi','retell','apify','google_places','telegram'
  ));

insert into public.integration_connections (provider, display_name, enabled, status, metadata)
values (
  'apify',
  'Apify',
  false,
  'not_configured',
  jsonb_build_object(
    'mcp_status', 'available_not_enabled',
    'mcp_url', 'https://mcp.apify.com',
    'default_max_results', 10,
    'hard_cap_results', 50,
    'purpose', 'lead_research_and_public_web_actors'
  )
)
on conflict (provider) do update
set
  display_name = excluded.display_name,
  metadata = public.integration_connections.metadata || excluded.metadata,
  updated_at = now();

create table if not exists public.apify_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  apify_run_id text,
  actor_id text not null,
  status text not null default 'READY',
  dataset_id text,
  items_count int default 0,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,
  error_code text,
  error_message text,
  usage jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_apify_runs_created on public.apify_runs(created_at desc);
create index if not exists idx_apify_runs_actor on public.apify_runs(actor_id);
create index if not exists idx_apify_runs_apify_id on public.apify_runs(apify_run_id);

alter table public.apify_runs enable row level security;

do $$ begin
  create policy "apify_runs_admin"
    on public.apify_runs
    for all
    using (public.is_admin())
    with check (public.is_admin());
exception when duplicate_object then null;
end $$;

revoke all on public.apify_runs from anon;
revoke all on public.apify_runs from authenticated;
grant select, insert, update on public.apify_runs to authenticated;

comment on table public.apify_runs is 'Apify Actor run observability (no tokens). Admin only.';
