-- Enable guarded AI auto replies for inbound WhatsApp messages via YCloud.

alter table public.social_automation_rules
  drop constraint if exists social_automation_rules_match_mode_check;

alter table public.social_automation_rules
  add constraint social_automation_rules_match_mode_check
  check (match_mode in ('exact','contains','intent_or_keyword','always'));

insert into public.social_automation_rules (
  organization_id,
  name,
  platforms,
  event_types,
  keywords,
  match_mode,
  intent,
  reply_template,
  create_lead,
  auto_reply,
  is_active
)
select
  o.id,
  'رد واتساب الذكي التلقائي',
  array['whatsapp']::text[],
  array['message.received']::text[],
  '{}'::text[],
  'always',
  'whatsapp_auto_reply',
  'أهلًا {{author_name}} 👋 شكرًا لتواصلك مع Tiqnora. كيف نقدر نخدمك؟',
  false,
  true,
  true
from public.organizations o
where o.slug='tiqnora'
and not exists (
  select 1
  from public.social_automation_rules r
  where r.organization_id=o.id
    and r.intent='whatsapp_auto_reply'
);

update public.social_automation_rules
set platforms=array['whatsapp']::text[],
    event_types=array['message.received']::text[],
    keywords='{}'::text[],
    match_mode='always',
    reply_template='أهلًا {{author_name}} 👋 شكرًا لتواصلك مع Tiqnora. كيف نقدر نخدمك؟',
    create_lead=false,
    auto_reply=true,
    is_active=true,
    updated_at=now()
where intent='whatsapp_auto_reply';
