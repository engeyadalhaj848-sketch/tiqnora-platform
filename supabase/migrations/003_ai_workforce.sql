-- ============================================================
-- TIQNORA AI WORKFORCE — Multi-tenant foundation (Admin phase)
-- Version: 1.0 | 2026-09-11
-- Safe to run after schema.sql + 002_security_hardening.sql.
-- ============================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

insert into public.organizations (slug, name)
values ('tiqnora', 'Tiqnora AI')
on conflict (slug) do update set name = excluded.name;

insert into public.organization_members (organization_id, user_id, role)
select o.id, p.id,
       case when p.role = 'super_admin' then 'owner' else 'admin' end
from public.organizations o
cross join public.profiles p
where o.slug = 'tiqnora' and p.role in ('admin','super_admin')
on conflict (organization_id, user_id) do update set role = excluded.role;

-- Upgrade the existing AI modules table without breaking its current consumers.
alter table public.ai_agents add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.ai_agents add column if not exists name text;
alter table public.ai_agents add column if not exists department text;
alter table public.ai_agents add column if not exists description text;
alter table public.ai_agents add column if not exists status text default 'active';

update public.ai_agents a
set organization_id = o.id,
    name = coalesce(a.name, a.name_en, a.name_ar),
    description = coalesce(a.description, a.description_en, a.description_ar),
    department = coalesce(a.department, 'general'),
    status = coalesce(a.status, case when a.is_enabled then 'active' else 'inactive' end)
from public.organizations o
where o.slug = 'tiqnora' and a.organization_id is null;

alter table public.ai_agents alter column organization_id set not null;
alter table public.ai_agents alter column name set not null;
alter table public.ai_agents alter column department set not null;
alter table public.ai_agents alter column status set not null;

alter table public.ai_agents drop constraint if exists ai_agents_slug_key;
create unique index if not exists ai_agents_org_slug_key on public.ai_agents(organization_id, slug);
create index if not exists idx_ai_agents_org_status on public.ai_agents(organization_id, status);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 20000),
  response text,
  provider text,
  model text,
  status text not null default 'completed' check (status in ('pending','completed','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 240),
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  memory_key text not null check (char_length(memory_key) between 1 and 160),
  memory_value text not null check (char_length(memory_value) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, memory_key)
);

create index if not exists idx_ai_conversations_agent_created on public.ai_conversations(agent_id, created_at desc);
create index if not exists idx_ai_conversations_user_created on public.ai_conversations(user_id, created_at desc);
create index if not exists idx_ai_tasks_agent_status on public.ai_tasks(agent_id, status, priority);
create index if not exists idx_ai_memory_agent on public.ai_memory(agent_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_tasks enable row level security;
alter table public.ai_memory enable row level security;

-- Phase 1: the entire workforce is private to active Tiqnora admins.
drop policy if exists "organizations_admin" on public.organizations;
create policy "organizations_admin" on public.organizations for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "organization_members_admin" on public.organization_members;
create policy "organization_members_admin" on public.organization_members for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ai_agents_read" on public.ai_agents;
drop policy if exists "ai_agents_admin" on public.ai_agents;
create policy "ai_agents_admin" on public.ai_agents for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ai_conversations_admin" on public.ai_conversations;
create policy "ai_conversations_admin" on public.ai_conversations for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "ai_tasks_admin" on public.ai_tasks;
create policy "ai_tasks_admin" on public.ai_tasks for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "ai_memory_admin" on public.ai_memory;
create policy "ai_memory_admin" on public.ai_memory for all
  using (public.is_admin()) with check (public.is_admin());

-- The four internal employees. Provider/model can be changed in the existing AI settings.
insert into public.ai_agents (
  organization_id, slug, name, name_ar, name_en, department,
  description, description_ar, description_en, system_prompt,
  provider, model, temperature, status, is_enabled, api_ready, config
)
select o.id, v.slug, v.name, v.name_ar, v.name_en, v.department,
       v.description, v.description_ar, v.description_en, v.system_prompt,
       'openai', 'gpt-4o-mini', v.temperature, 'active', true, true, v.config
from public.organizations o
cross join (values
  ('marketing', 'Marketing AI Manager', 'مدير التسويق بالذكاء الاصطناعي', 'Marketing AI Manager', 'marketing',
   'Digital marketing director for Tiqnora focused on Saudi and GCC B2B growth.',
   'مدير التسويق الرقمي في تيكنورا والمتخصص في نمو الأعمال داخل السوق السعودي والخليجي.',
   'Tiqnora digital marketing director specializing in Saudi and GCC B2B growth.',
   'You are Tiqnora AI''s Marketing AI Manager. Act as a senior Saudi B2B marketing director. Produce evidence-aware market research, competitor analysis, Saudi/GCC campaign plans, lead-generation strategies, pricing suggestions, growth experiments, and executive reports. Ask for missing commercial context, distinguish facts from assumptions, respect Saudi culture, and return practical prioritized actions with KPIs.',
   0.65::numeric, '{"capabilities":["market_research","competitor_analysis","campaign_planning","lead_generation","pricing","growth_reports"]}'::jsonb),
  ('content', 'Content AI Manager', 'مدير المحتوى بالذكاء الاصطناعي', 'Content AI Manager', 'content',
   'Head of bilingual Arabic and English SEO content for Tiqnora.',
   'رئيس صناعة المحتوى العربي والإنجليزي المحسّن لمحركات البحث في تيكنورا.',
   'Head of bilingual Arabic and English SEO content for Tiqnora.',
   'You are Tiqnora AI''s Content AI Manager and a senior bilingual Arabic-English SEO strategist. Create website copy, SEO articles, landing pages, LinkedIn posts, Instagram captions, TikTok scripts, and email campaigns. Match the requested channel and audience, keep Arabic natural for Saudi businesses, never invent claims, and include a clear CTA and SEO intent when relevant.',
   0.75::numeric, '{"capabilities":["website_copy","seo_articles","landing_pages","social_copy","video_scripts","email_campaigns"]}'::jsonb),
  ('social-media', 'Social Media AI Manager', 'مدير التواصل الاجتماعي بالذكاء الاصطناعي', 'Social Media AI Manager', 'social_media',
   'Social media department manager for Instagram, LinkedIn, TikTok, and X.',
   'مدير قسم التواصل الاجتماعي لمنصات إنستغرام ولينكدإن وتيك توك وإكس.',
   'Social media department manager for Instagram, LinkedIn, TikTok, and X.',
   'You are Tiqnora AI''s Social Media AI Manager. Build monthly calendars, post and short-video ideas, platform-native captions, responsible hashtag research, analytics summaries, and growth experiments for Instagram, LinkedIn, TikTok, and X. Adapt every recommendation to the platform, Saudi/GCC audience, available production capacity, and measurable objectives.',
   0.8::numeric, '{"platforms":["instagram","linkedin","tiktok","x"],"capabilities":["content_calendar","post_ideas","video_ideas","captions","hashtags","analytics"]}'::jsonb),
  ('developer', 'CTO AI Assistant', 'مساعد المدير التقني بالذكاء الاصطناعي', 'CTO AI Assistant', 'engineering',
   'Senior technical lead assistant for Tiqnora code, databases, and deployments.',
   'مساعد تقني خبير لمراجعة كود تيكنورا وقواعد البيانات وعمليات النشر.',
   'Senior technical lead assistant for Tiqnora code, databases, and deployments.',
   'You are Tiqnora AI''s CTO AI Assistant and a senior software architect. Analyze code and database designs, review changes, identify bugs and security risks, propose maintainable improvements, generate technical documentation, and assist with Supabase and Vercel deployments. Preserve existing behavior, never claim to have executed actions you did not execute, protect secrets, and provide verification steps.',
   0.35::numeric, '{"capabilities":["code_analysis","reviews","debugging","documentation","database","deployment"]}'::jsonb)
) as v(slug,name,name_ar,name_en,department,description,description_ar,description_en,system_prompt,temperature,config)
where o.slug = 'tiqnora'
on conflict (organization_id, slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  department = excluded.department,
  description = excluded.description,
  description_ar = excluded.description_ar,
  description_en = excluded.description_en,
  system_prompt = excluded.system_prompt,
  temperature = excluded.temperature,
  status = 'active',
  is_enabled = true,
  config = excluded.config,
  updated_at = now();
