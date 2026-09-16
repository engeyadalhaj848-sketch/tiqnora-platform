-- ============================================================
-- TIQNORA AI — Phase 1 Activation (idempotent)
-- Run once in Supabase SQL Editor after migrations 002–009.
-- Does NOT drop data. Safe to re-run.
-- ============================================================

-- 1) Ensure organization exists
insert into public.organizations (slug, name, status)
values ('tiqnora', 'Tiqnora AI', 'active')
on conflict (slug) do update set name = excluded.name, status = 'active', updated_at = now();

-- 2) Link existing admins to organization
insert into public.organization_members (organization_id, user_id, role)
select o.id, p.id,
       case when p.role = 'super_admin' then 'owner' else 'admin' end
from public.organizations o
cross join public.profiles p
where o.slug = 'tiqnora' and p.role in ('admin', 'super_admin')
on conflict (organization_id, user_id) do update set role = excluded.role;

-- 3) Ensure AI agents table has required columns (from 003)
alter table public.ai_agents add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.ai_agents add column if not exists name text;
alter table public.ai_agents add column if not exists department text;
alter table public.ai_agents add column if not exists description text;
alter table public.ai_agents add column if not exists status text default 'active';

-- Backfill org on any orphan agents
update public.ai_agents a
set organization_id = o.id
from public.organizations o
where o.slug = 'tiqnora' and a.organization_id is null;

-- 4) Seed / refresh the four internal workforce agents (Gemini-ready)
insert into public.ai_agents (
  organization_id, slug, name, name_ar, name_en, department,
  description, description_ar, description_en, system_prompt,
  provider, model, temperature, status, is_enabled, api_ready, config
)
select o.id, v.slug, v.name, v.name_ar, v.name_en, v.department,
       v.description, v.description_ar, v.description_en, v.system_prompt,
       'google_ai', 'gemini-2.5-flash', v.temperature, 'active', true, true, v.config
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
  provider = 'google_ai',
  model = 'gemini-2.5-flash',
  temperature = excluded.temperature,
  status = 'active',
  is_enabled = true,
  api_ready = true,
  config = excluded.config,
  updated_at = now();

-- Fix any agents still on the non-existent gemini-3.6-flash model
update public.ai_agents
set model = 'gemini-2.5-flash', provider = 'google_ai', updated_at = now()
where model in ('gemini-3.6-flash', 'gemini-3-flash') or (provider in ('google_ai','gemini') and model is null);

-- 5) Social OAuth token vault (008) if missing
create table if not exists public.social_provider_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('meta','whatsapp','tiktok','linkedin')),
  ciphertext text not null,
  iv text not null,
  tag text not null,
  scopes text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);
alter table public.social_provider_tokens enable row level security;
drop policy if exists "social token vault denied" on public.social_provider_tokens;
create policy "social token vault denied" on public.social_provider_tokens
  for all using (false) with check (false);

-- 6) Integration registry seed (005)
insert into public.integration_connections (provider, display_name) values
  ('openai','OpenAI'),('anthropic','Anthropic'),('google_ai','Google AI'),
  ('resend','Resend'),('stripe','Stripe'),('whop','Whop'),
  ('smsa','SMSA Express'),('saudi_post','Saudi Post'),
  ('meta','Meta'),('linkedin','LinkedIn'),('tiktok','TikTok'),
  ('vapi','Vapi'),('retell','Retell')
on conflict (provider) do nothing;

-- Mark google_ai as connected when used as default (status only; no secrets)
update public.integration_connections
set status = 'connected', enabled = true, updated_at = now()
where provider = 'google_ai' and status = 'not_configured';

-- 7) Commerce suppliers foundation (009)
insert into public.commerce_suppliers (provider, display_name, fulfillment_mode, metadata) values
  ('aliexpress', 'AliExpress', 'approval_required', '{"setup":"Official/API or approved fulfillment partner required"}'),
  ('alibaba', 'Alibaba', 'approval_required', '{"setup":"Trade assurance preferred"}'),
  ('amazon', 'Amazon', 'approval_required', '{"setup":"SP-API credentials in Vercel only"}'),
  ('dsers', 'DSers', 'approval_required', '{"setup":"Recommended initial fulfillment bridge for AliExpress"}'),
  ('manual', 'Manual / Local Supplier', 'approval_required', '{"setup":"Owner-managed supplier"}')
on conflict (provider) do nothing;

-- 8) Default shipping providers rows
insert into public.shipping_settings (provider, display_name, is_enabled, supports_tracking, base_cost)
values
  ('smsa', 'SMSA Express', false, true, 25),
  ('spl', 'Saudi Post (SPL)', false, true, 20),
  ('aramex', 'Aramex', false, true, 35),
  ('dhl', 'DHL', false, true, 55),
  ('custom', 'شحن مخصص', true, false, 25)
on conflict (provider) do nothing;

-- 9) AI settings key (no secrets)
insert into public.site_settings (key, value)
values ('ai', jsonb_build_object(
  'default_provider', 'google_ai',
  'default_model', 'gemini-2.5-flash',
  'providers', jsonb_build_array('google_ai','openai','anthropic','xai')
))
on conflict (key) do update set value = public.site_settings.value || excluded.value;

-- 10) Verification view for owner (optional helper)
create or replace function public.phase1_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  select jsonb_build_object(
    'organizations', (select count(*) from organizations),
    'ai_agents', (select count(*) from ai_agents where is_enabled),
    'services', (select count(*) from services where status = 'published'),
    'packages', (select count(*) from packages where is_visible),
    'products', (select count(*) from products where is_active),
    'commerce_suppliers', (select count(*) from commerce_suppliers),
    'shipping_settings', (select count(*) from shipping_settings),
    'integration_connections', (select count(*) from integration_connections),
    'social_provider_tokens_table', (select to_regclass('public.social_provider_tokens') is not null)
  ) into result;
  return result;
end;
$$;

grant execute on function public.phase1_status() to authenticated;
