-- Phase 6: lead enrichment, analytics events, marketing automation queue, sales agent

alter table public.leads add column if not exists notes text;
alter table public.leads add column if not exists company text;
alter table public.leads add column if not exists interest text;
alter table public.leads add column if not exists utm_source text;
alter table public.leads add column if not exists utm_medium text;
alter table public.leads add column if not exists utm_campaign text;
alter table public.leads add column if not exists page_path text;
alter table public.leads add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists updated_at timestamptz default now();

-- First-party analytics events (works even without GA)
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  path text,
  session_id text,
  user_id uuid,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_analytics_events_name on public.analytics_events(event_name, created_at desc);

alter table public.analytics_events enable row level security;
drop policy if exists "analytics_insert_public" on public.analytics_events;
create policy "analytics_insert_public" on public.analytics_events for insert with check (true);
drop policy if exists "analytics_admin_read" on public.analytics_events;
create policy "analytics_admin_read" on public.analytics_events for select using (public.is_admin());

-- Marketing automation jobs (email optional later)
create table if not exists public.marketing_automations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('welcome','follow_up','upgrade_reminder','marketing_report','custom')),
  channel text not null default 'internal' check (channel in ('internal','email','telegram')),
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.marketing_automations enable row level security;
drop policy if exists "mkt_auto_admin" on public.marketing_automations;
create policy "mkt_auto_admin" on public.marketing_automations for all using (public.is_admin()) with check (public.is_admin());

-- Sales AI agent
insert into public.organizations (slug, name) values ('tiqnora', 'Tiqnora AI')
on conflict (slug) do nothing;

insert into public.ai_agents (
  organization_id, slug, name, name_ar, name_en, role, status, is_enabled,
  model, temperature, system_prompt_ar, system_prompt_en, description
)
select o.id, 'sales', 'Sales AI Assistant', 'مساعد المبيعات', 'Sales AI Assistant', 'sales', 'active', true,
  'gemini-3.6-flash', 0.5,
  'أنت مساعد مبيعات Tiqnora AI. تشرح الخدمات والباقات بوضوح بالعربية، تقترح الخطة المناسبة (مجاني/أساسي/احترافي/مؤسسي) حسب احتياج العميل، وتجمع الاسم والبريد واهتمامه بلباقة. لا تعد بدفع إلكتروني حي حالياً. لا تخترع أسعاراً غير موجودة. حوّل المهتمين لطلب تواصل أو تسجيل في بوابة العملاء.',
  'You are Tiqnora Sales AI. Explain services and SaaS plans clearly, recommend Free/Basic/Professional/Enterprise, collect name/email/interest politely. Do not claim live card payments are enabled. Guide users to /customer or a contact lead.',
  'AI sales assistant for service questions, plan recommendation, and lead capture.'
from public.organizations o where o.slug = 'tiqnora'
on conflict (organization_id, slug) do update set
  is_enabled = true, status = 'active',
  system_prompt_ar = excluded.system_prompt_ar,
  system_prompt_en = excluded.system_prompt_en;

-- Welcome automation on new lead
create or replace function public.trg_lead_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.marketing_automations (lead_id, kind, channel, status, payload, scheduled_for)
  values (new.id, 'welcome', 'internal', 'pending',
    jsonb_build_object('name', new.name, 'email', new.email, 'source', new.source),
    now());
  insert into public.notifications (user_id, audience, type, title_ar, body_ar, link, metadata)
  select p.id, 'admin', 'new_lead', 'عميل محتمل جديد', coalesce(new.name,'') || ' — ' || coalesce(new.source,''),
    '/admin#leads', jsonb_build_object('lead_id', new.id)
  from public.profiles p where p.role in ('admin','super_admin') and p.is_active;
  return new;
end;
$$;
drop trigger if exists lead_welcome on public.leads;
create trigger lead_welcome after insert on public.leads
  for each row execute function public.trg_lead_welcome();
