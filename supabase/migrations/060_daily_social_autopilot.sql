-- Tiqnora Daily Social Autopilot + Chief of Staff
-- User-authorized automatic organic publishing is scoped to currently supported connected feeds.

insert into public.ai_agents (
  organization_id, slug, name, name_ar, name_en, department,
  description, description_ar, description_en, system_prompt,
  provider, model, temperature, status, is_enabled, api_ready, config
)
select
  o.id,
  'manager',
  'AI Chief of Staff',
  'مدير الوكلاء الذكي',
  'AI Chief of Staff',
  'management',
  'Coordinates Tiqnora specialist agents, dependencies, decisions, and daily execution.',
  'يدير ويوزع العمل بين وكلاء Tiqnora المتخصصين ويجمع نتائجهم في خطة تنفيذ واحدة.',
  'Coordinates Tiqnora specialist agents, dependencies, decisions, and daily execution.',
  'You are Tiqnora AI Chief of Staff. Break business goals into specialist workstreams, assign the correct Tiqnora agents, define dependencies and acceptance criteria, reconcile conflicting recommendations, and return one executive next-action plan. Do not replace specialists when delegation is better. Preserve approval gates for spend, customer outreach, purchases, pricing changes and irreversible actions. Daily organic social publishing may run only on channels explicitly enabled by organization social_autopilot settings.',
  'openai',
  'chat-latest',
  0.3,
  'active',
  true,
  true,
  '{"elite_profile":"v1","capabilities":["delegation","coordination","prioritization","quality_control","executive_summary"],"primary_provider":"openai"}'::jsonb
from public.organizations o
where o.slug='tiqnora'
on conflict (organization_id, slug) do update set
  name=excluded.name,
  name_ar=excluded.name_ar,
  name_en=excluded.name_en,
  department=excluded.department,
  description=excluded.description,
  description_ar=excluded.description_ar,
  description_en=excluded.description_en,
  system_prompt=excluded.system_prompt,
  provider='openai',
  model='chat-latest',
  status='active',
  is_enabled=true,
  api_ready=true,
  config=coalesce(public.ai_agents.config,'{}'::jsonb)||excluded.config,
  updated_at=now();

update public.organizations o
set settings = coalesce(o.settings,'{}'::jsonb) || jsonb_build_object(
  'social_autopilot',
  jsonb_build_object(
    'enabled', true,
    'platforms', jsonb_build_array('facebook','instagram'),
    'timezone', 'Asia/Riyadh',
    'daily_time', '08:00',
    'mode', 'organic_daily',
    'approved_by', coalesce((
      select p.id::text
      from public.organization_members m
      join public.profiles p on p.id=m.user_id
      where m.organization_id=o.id
        and p.is_active=true
        and p.role in ('super_admin','admin')
      order by case when p.role='super_admin' then 0 else 1 end, p.created_at
      limit 1
    ), ''),
    'authorized_at', now()::text,
    'authorized_scope', 'daily organic Facebook and Instagram publishing'
  )
),
updated_at=now()
where o.slug='tiqnora';

update public.ai_agents a
set config = coalesce(a.config,'{}'::jsonb) || '{"daily_social_autopilot":true,"collaborates_with":["manager","marketing","content","image-designer"]}'::jsonb,
    updated_at=now()
from public.organizations o
where a.organization_id=o.id and o.slug='tiqnora' and a.slug='social-media';
