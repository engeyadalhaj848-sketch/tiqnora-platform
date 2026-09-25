-- ============================================================
-- TIQNORA V6.1 — CRM Core + Conversations + Actions + Booking
-- Migration: 048_v6_crm_core.sql
-- Safe / idempotent. Additive only. No destructive changes.
-- Run in Supabase SQL Editor after confirming previous migrations.
-- ============================================================

-- ---------- 1. Extend existing leads table ----------
alter table public.leads add column if not exists company_name text;
alter table public.leads add column if not exists contact_name text;
alter table public.leads add column if not exists whatsapp text;
alter table public.leads add column if not exists website text;
alter table public.leads add column if not exists city text;
alter table public.leads add column if not exists country text default 'SA';
alter table public.leads add column if not exists industry text;
alter table public.leads add column if not exists pipeline_stage text;
alter table public.leads add column if not exists lead_score numeric(5,2);
alter table public.leads add column if not exists opportunity_score numeric(5,2);
alter table public.leads add column if not exists score_breakdown jsonb not null default '{}'::jsonb;
alter table public.leads add column if not exists estimated_value numeric(12,2);
alter table public.leads add column if not exists assigned_agent text;
alter table public.leads add column if not exists last_contact_at timestamptz;
alter table public.leads add column if not exists next_followup_at timestamptz;
alter table public.leads add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.leads add column if not exists company_id uuid;
alter table public.leads add column if not exists contact_id uuid;
alter table public.leads add column if not exists tags text[] not null default '{}';
alter table public.leads add column if not exists custom_fields jsonb not null default '{}'::jsonb;

-- Backfill contact_name / company_name from legacy columns where empty
update public.leads
set contact_name = coalesce(contact_name, name),
    company_name = coalesce(company_name, company)
where contact_name is null or company_name is null;

create index if not exists idx_leads_org_status on public.leads(organization_id, status, created_at desc);
create index if not exists idx_leads_assigned on public.leads(assigned_to, status);
create index if not exists idx_leads_next_followup on public.leads(next_followup_at) where next_followup_at is not null;
create index if not exists idx_leads_score on public.leads(opportunity_score desc nulls last);

-- ---------- 2. CRM Companies ----------
create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  industry text,
  website text,
  city text,
  country text default 'SA',
  phone text,
  email text,
  size_band text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_companies_org on public.crm_companies(organization_id, name);

-- ---------- 3. CRM Contacts ----------
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.crm_companies(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  whatsapp text,
  title text,
  is_primary boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_contacts_org on public.crm_contacts(organization_id, full_name);
create index if not exists idx_crm_contacts_company on public.crm_contacts(company_id);

-- FKs on leads (added after tables exist)
do $$ begin
  alter table public.leads
    add constraint leads_company_id_fkey
    foreign key (company_id) references public.crm_companies(id) on delete set null;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.leads
    add constraint leads_contact_id_fkey
    foreign key (contact_id) references public.crm_contacts(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ---------- 4. Pipelines & Stages ----------
create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  is_default boolean not null default false,
  industry text,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  name text not null,
  slug text not null,
  position int not null default 0,
  probability numeric(5,2) not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  unique (pipeline_id, slug)
);
create index if not exists idx_pipeline_stages_pipeline on public.crm_pipeline_stages(pipeline_id, position);

-- Seed default pipeline for Tiqnora org
insert into public.crm_pipelines (organization_id, name, slug, is_default)
select o.id, 'Sales Pipeline', 'default', true
from public.organizations o where o.slug = 'tiqnora'
on conflict (organization_id, slug) do nothing;

insert into public.crm_pipeline_stages (pipeline_id, name, slug, position, probability, is_won, is_lost)
select p.id, v.name, v.slug, v.position, v.probability, v.is_won, v.is_lost
from public.crm_pipelines p
cross join (values
  ('Lead', 'lead', 10, 10, false, false),
  ('Contacted', 'contacted', 20, 20, false, false),
  ('Qualified', 'qualified', 30, 40, false, false),
  ('Proposal', 'proposal', 40, 60, false, false),
  ('Negotiation', 'negotiation', 50, 75, false, false),
  ('Won', 'won', 60, 100, true, false),
  ('Lost', 'lost', 70, 0, false, true)
) as v(name, slug, position, probability, is_won, is_lost)
where p.slug = 'default'
  and not exists (
    select 1 from public.crm_pipeline_stages s where s.pipeline_id = p.id and s.slug = v.slug
  );

-- ---------- 5. Opportunities ----------
create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.crm_companies(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  pipeline_id uuid references public.crm_pipelines(id) on delete set null,
  stage_id uuid references public.crm_pipeline_stages(id) on delete set null,
  title text not null,
  value numeric(12,2),
  currency text not null default 'SAR',
  expected_close_at date,
  status text not null default 'open' check (status in ('open','won','lost','abandoned')),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_agent text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_opps_org on public.crm_opportunities(organization_id, status, created_at desc);
create index if not exists idx_crm_opps_lead on public.crm_opportunities(lead_id);

-- ---------- 6. Activities (timeline) ----------
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  company_id uuid references public.crm_companies(id) on delete set null,
  activity_type text not null check (activity_type in (
    'note','call','email','whatsapp','meeting','task','stage_change','system','ai'
  )),
  title text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_crm_activities_lead on public.crm_activities(lead_id, created_at desc);
create index if not exists idx_crm_activities_org on public.crm_activities(organization_id, created_at desc);

-- ---------- 7. Conversations + Messages (Unified Inbox V2) ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null,
  external_thread_id text,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.crm_companies(id) on delete set null,
  assigned_agent text,
  assigned_user uuid references public.profiles(id) on delete set null,
  sentiment text,
  intent text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','pending','resolved','spam','archived')),
  last_message_at timestamptz,
  unread_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_conversations_external
  on public.conversations(organization_id, platform, external_thread_id)
  where external_thread_id is not null;
create index if not exists idx_conversations_inbox
  on public.conversations(organization_id, status, last_message_at desc nulls last);
create index if not exists idx_conversations_lead on public.conversations(lead_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound','system')),
  body text,
  external_message_id text,
  sender_name text,
  ai_meta jsonb not null default '{}'::jsonb,
  social_event_id uuid references public.social_events(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create unique index if not exists idx_messages_external
  on public.messages(organization_id, external_message_id)
  where external_message_id is not null;

-- Link social_events → CRM (additive)
alter table public.social_events add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.social_events add column if not exists contact_id uuid references public.crm_contacts(id) on delete set null;
alter table public.social_events add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

-- ---------- 8. Appointments (Booking Engine minimal) ----------
create table if not exists public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  duration_minutes int not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  service_id uuid references public.appointment_services(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled' check (status in (
    'scheduled','confirmed','completed','cancelled','no_show','rescheduled'
  )),
  location text,
  notes text,
  reminder_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_appointments_org_starts on public.appointments(organization_id, starts_at);
create index if not exists idx_appointments_lead on public.appointments(lead_id);

-- ---------- 9. Follow-ups ----------
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  reason text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','skipped','cancelled')),
  draft_message text,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_agent text,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_follow_ups_due on public.follow_ups(organization_id, status, due_at);

-- ---------- 10. Action / Approval Engine ----------
create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_type text not null,
  status text not null default 'draft' check (status in (
    'draft','pending_approval','approved','executing','completed','failed','cancelled'
  )),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  related_entity_type text,
  related_entity_id uuid,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  error_code text,
  error_message text,
  retry_count int not null default 0,
  requires_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_actions_status on public.actions(organization_id, status, created_at desc);
create index if not exists idx_actions_lead on public.actions(lead_id);

-- ---------- 11. Extend ai_tasks ----------
alter table public.ai_tasks add column if not exists related_entity_type text;
alter table public.ai_tasks add column if not exists related_entity_id uuid;
alter table public.ai_tasks add column if not exists requires_approval boolean not null default false;
alter table public.ai_tasks add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.ai_tasks add column if not exists goal text;
alter table public.ai_tasks add column if not exists context jsonb not null default '{}'::jsonb;
alter table public.ai_tasks add column if not exists input jsonb not null default '{}'::jsonb;
alter table public.ai_tasks add column if not exists output jsonb not null default '{}'::jsonb;

-- ---------- 12. RLS ----------
alter table public.crm_companies enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_pipelines enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_opportunities enable row level security;
alter table public.crm_activities enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.appointment_services enable row level security;
alter table public.appointments enable row level security;
alter table public.follow_ups enable row level security;
alter table public.actions enable row level security;

-- Admin-full policies (consistent with existing social_* pattern)
do $$ begin
  create policy "crm_companies_admin" on public.crm_companies for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "crm_contacts_admin" on public.crm_contacts for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "crm_pipelines_admin" on public.crm_pipelines for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "crm_pipeline_stages_admin" on public.crm_pipeline_stages for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "crm_opportunities_admin" on public.crm_opportunities for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "crm_activities_admin" on public.crm_activities for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "conversations_admin" on public.conversations for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "messages_admin" on public.messages for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "appointment_services_admin" on public.appointment_services for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "appointments_admin" on public.appointments for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "follow_ups_admin" on public.follow_ups for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "actions_admin" on public.actions for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end $$;

-- Grants
grant select, insert, update on public.crm_companies to authenticated;
grant select, insert, update on public.crm_contacts to authenticated;
grant select on public.crm_pipelines to authenticated;
grant select on public.crm_pipeline_stages to authenticated;
grant select, insert, update on public.crm_opportunities to authenticated;
grant select, insert on public.crm_activities to authenticated;
grant select, insert, update on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update on public.appointments to authenticated;
grant select on public.appointment_services to authenticated;
grant select, insert, update on public.follow_ups to authenticated;
grant select, insert, update on public.actions to authenticated;

-- ---------- 13. Default appointment service ----------
insert into public.appointment_services (organization_id, name, duration_minutes)
select o.id, 'استشارة / Consultation', 30
from public.organizations o where o.slug = 'tiqnora'
and not exists (
  select 1 from public.appointment_services s
  where s.organization_id = o.id and s.name = 'استشارة / Consultation'
);

-- Done
comment on table public.actions is 'V6 Approval Engine — all external side-effects must pass through here';
comment on table public.conversations is 'V6 Unified Inbox threads';
comment on table public.crm_opportunities is 'V6 CRM opportunities linked to leads/pipeline';
