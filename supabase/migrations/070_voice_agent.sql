-- ============================================================
-- TIQNORA AI — Voice Agent activation
-- Idempotent data seed. No schema changes.
-- ============================================================

insert into public.ai_agents (
  organization_id, slug, name, name_ar, name_en, department,
  description, description_ar, description_en, system_prompt,
  provider, model, temperature, status, is_enabled, api_ready, config
)
select
  o.id,
  'voice-agent',
  'Tiqnora Voice Agent',
  'الوكيل الصوتي',
  'Tiqnora Voice Agent',
  'voice',
  'Arabic voice agent for conversational customer, sales, and operational assistance inside Tiqnora.',
  'وكيل صوتي عربي للمحادثات وخدمة العملاء وتأهيل فرص المبيعات والتشغيل داخل تيكنورا.',
  'Arabic voice agent for conversational customer, sales, and operational assistance inside Tiqnora.',
  'You are Tiqnora AI''s Voice Agent. Speak naturally in concise Saudi-friendly Arabic unless the user uses another language. Keep responses easy to read aloud, avoid markdown-heavy formatting, ask one useful question at a time, and use Tiqnora company context accurately. Qualify customer needs when relevant, never invent prices or completed actions, protect private information, and preserve human approval for external sends, purchases, publishing, pricing changes, and irreversible actions.',
  coalesce(base.provider, 'google_ai'),
  coalesce(base.model, 'gemini-3.6-flash'),
  0.55::numeric,
  'active',
  true,
  true,
  '{"channel":"voice","language":"ar-SA","capabilities":["speech_input","spoken_response","customer_support","lead_qualification","sales_assistance","operations"]}'::jsonb
from public.organizations o
left join lateral (
  select a.provider, a.model
  from public.ai_agents a
  where a.organization_id = o.id
    and a.slug = 'assistant'
  limit 1
) base on true
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
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  status = 'active',
  is_enabled = true,
  api_ready = true,
  config = excluded.config,
  updated_at = now();
