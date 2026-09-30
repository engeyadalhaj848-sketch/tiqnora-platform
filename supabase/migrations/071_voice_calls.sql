-- ============================================================
-- TIQNORA AI — Phone Voice Agent foundation
-- Consent-first outbound calling with audit trail.
-- ============================================================

create table if not exists public.voice_call_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('lead','customer')),
  entity_id uuid not null,
  phone text not null,
  scope text not null default 'outbound_ai_call' check (scope in ('outbound_ai_call')),
  status text not null default 'unknown' check (status in ('unknown','granted','revoked')),
  source text,
  evidence_note text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, phone, scope)
);

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_id uuid references public.actions(id) on delete set null,
  consent_id uuid references public.voice_call_permissions(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  provider text not null default 'vapi',
  external_call_id text,
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  purpose text not null default 'followup' check (purpose in ('followup','support','appointment','sales','other')),
  destination_phone text not null,
  status text not null default 'queued' check (status in ('queued','ringing','in_progress','completed','failed','cancelled')),
  duration_seconds integer,
  ended_reason text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_voice_calls_external
  on public.voice_calls(provider, external_call_id)
  where external_call_id is not null;

create index if not exists idx_voice_permissions_entity
  on public.voice_call_permissions(organization_id, entity_type, entity_id, status);

create index if not exists idx_voice_calls_org_created
  on public.voice_calls(organization_id, created_at desc);

create index if not exists idx_voice_calls_lead
  on public.voice_calls(lead_id, created_at desc)
  where lead_id is not null;

alter table public.voice_call_permissions enable row level security;
alter table public.voice_calls enable row level security;

grant select, insert, update, delete on public.voice_call_permissions to authenticated;
grant select, insert, update, delete on public.voice_calls to authenticated;

drop policy if exists "voice_call_permissions_admin" on public.voice_call_permissions;
create policy "voice_call_permissions_admin"
  on public.voice_call_permissions
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "voice_calls_admin" on public.voice_calls;
create policy "voice_calls_admin"
  on public.voice_calls
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

insert into public.integration_connections (provider, display_name, enabled, mode, status, metadata)
values (
  'vapi',
  'Vapi Voice AI',
  false,
  'production',
  'not_configured',
  '{"purpose":"voice_agent_phone_calls","recording_default":false,"transcript_storage_default":false,"consent_required":true}'::jsonb
)
on conflict (provider) do update set
  display_name = excluded.display_name,
  metadata = coalesce(public.integration_connections.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();
