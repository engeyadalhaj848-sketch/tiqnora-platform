-- TIQNORA SOCIAL INBOX — platform-neutral foundation
-- Apply after 003_ai_workforce.sql.

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null,
  external_account_id text not null,
  account_name text,
  status text not null default 'pending' check (status in ('pending','active','expired','disabled','error')),
  capabilities jsonb not null default '{}',
  settings jsonb not null default '{}',
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform, external_account_id)
);

create table if not exists public.social_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.social_connections(id) on delete set null,
  platform text not null,
  event_type text not null,
  external_event_id text not null,
  external_parent_id text,
  author_external_id text,
  author_name text,
  content text,
  permalink text,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  intent text,
  intent_confidence numeric(5,4),
  processing_status text not null default 'new' check (processing_status in ('new','matched','ignored','processed','failed')),
  raw_payload jsonb not null default '{}',
  unique (platform, external_event_id)
);

create table if not exists public.social_automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  platforms text[] not null default '{}', -- empty means every connected platform
  event_types text[] not null default array['comment.created'],
  keywords text[] not null default '{}',
  match_mode text not null default 'intent_or_keyword' check (match_mode in ('exact','contains','intent_or_keyword')),
  intent text,
  reply_template text,
  create_lead boolean not null default true,
  auto_reply boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_event_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.social_events(id) on delete cascade,
  rule_id uuid references public.social_automation_rules(id) on delete set null,
  action_type text not null,
  status text not null default 'pending' check (status in ('pending','completed','failed','skipped')),
  result jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_social_events_inbox on public.social_events(organization_id, received_at desc);
create index if not exists idx_social_events_status on public.social_events(organization_id, processing_status, received_at);
create index if not exists idx_social_actions_pending on public.social_event_actions(status, created_at);

alter table public.social_connections enable row level security;
alter table public.social_events enable row level security;
alter table public.social_automation_rules enable row level security;
alter table public.social_event_actions enable row level security;

create policy "social_connections_admin" on public.social_connections for all using (public.is_admin()) with check (public.is_admin());
create policy "social_events_admin" on public.social_events for all using (public.is_admin()) with check (public.is_admin());
create policy "social_rules_admin" on public.social_automation_rules for all using (public.is_admin()) with check (public.is_admin());
create policy "social_actions_admin" on public.social_event_actions for all using (public.is_admin()) with check (public.is_admin());

insert into public.social_automation_rules (
  organization_id, name, platforms, keywords, intent, reply_template, create_lead, auto_reply
)
select id, 'طلب تحليل النشاط', '{}', array['تحليل','حلل نشاطي','أبغى تحليل','اريد تحليل'], 'business_audit',
       'أهلًا {{author_name}} 👋 تم استلام طلب التحليل. أرسل لنا اسم نشاطك ورابط حسابك أو موقعك لنبدأ.', true, false
from public.organizations where slug = 'tiqnora'
and not exists (
  select 1 from public.social_automation_rules r
  where r.organization_id = organizations.id and r.intent = 'business_audit'
);
