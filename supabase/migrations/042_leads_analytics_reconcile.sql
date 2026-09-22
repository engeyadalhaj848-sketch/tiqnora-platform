-- ============================================================
-- 042: Reconcile leads / analytics / marketing (Production parity)
-- Idempotent. Safe on databases that already received manual fixes.
-- Does NOT modify existing ai_agents rows beyond ensuring sales agent shape.
-- ============================================================

-- 1) Leads enrichment columns
alter table public.leads add column if not exists notes text;
alter table public.leads add column if not exists company text;
alter table public.leads add column if not exists interest text;
alter table public.leads add column if not exists utm_source text;
alter table public.leads add column if not exists utm_medium text;
alter table public.leads add column if not exists utm_campaign text;
alter table public.leads add column if not exists page_path text;
alter table public.leads add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists updated_at timestamptz default now();

-- 2) analytics_events
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

-- 3) marketing_automations
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

-- Grants (idempotent)
grant select, insert on public.analytics_events to anon, authenticated;
grant select, insert, update on public.marketing_automations to authenticated;
grant select, insert, update on public.leads to authenticated;

-- 4) lead_welcome trigger (TRIGGER-ONLY; security definer with fixed search_path)
create or replace function public.trg_lead_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.marketing_automations (lead_id, kind, channel, status, payload, scheduled_for)
  values (
    new.id,
    'welcome',
    'internal',
    'pending',
    jsonb_build_object('name', new.name, 'email', new.email, 'source', new.source),
    now()
  );
  insert into public.notifications (user_id, audience, type, title_ar, body_ar, link, metadata)
  select
    p.id,
    'admin',
    'new_lead',
    'عميل محتمل جديد',
    coalesce(new.name, '') || ' — ' || coalesce(new.source, ''),
    '/admin#leads',
    jsonb_build_object('lead_id', new.id)
  from public.profiles p
  where p.role in ('admin', 'super_admin') and p.is_active is true;
  return new;
end;
$$;

drop trigger if exists lead_welcome on public.leads;
create trigger lead_welcome
  after insert on public.leads
  for each row execute function public.trg_lead_welcome();

-- 5) Security Advisor: mutable search_path on current_period_ym
create or replace function public.current_period_ym()
returns text
language sql
stable
set search_path = public
as $$
  select to_char(timezone('Asia/Riyadh', now()), 'YYYY-MM');
$$;

-- Note: No bulk REVOKE on SECURITY DEFINER functions in this migration.
-- Public RPCs (track_order, validate_coupon, get_app_version, mobile device RPCs)
-- must remain callable as designed. Review remaining Advisor warnings manually.
