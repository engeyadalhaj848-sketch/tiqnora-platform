-- ============================================================
-- 044 Growth Engine V1: prospects + outreach drafts + analytics events
-- Idempotent. No auto-send. Human approval required for outreach.
-- ============================================================

-- Prospects (discovered businesses — separate from inbound leads)
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  business_name_norm text generated always as (
    lower(trim(regexp_replace(coalesce(business_name, ''), '\s+', ' ', 'g')))
  ) stored,
  category text,
  city text default 'المدينة المنورة',
  district text,
  website text,
  website_domain text,
  phone text,
  phone_norm text,
  whatsapp text,
  email text,
  instagram text,
  facebook text,
  tiktok text,
  linkedin text,
  google_maps_url text,
  source text,
  source_url text,
  website_exists boolean default false,
  website_quality text,
  mobile_quality text,
  has_whatsapp boolean default false,
  has_instagram boolean default false,
  has_booking boolean default false,
  has_contact_form boolean default false,
  has_services_page boolean default false,
  opportunity_score integer not null default 0,
  priority text not null default 'LOW' check (priority in ('HIGH','MEDIUM','LOW')),
  audit_summary text,
  audit_json jsonb not null default '{}'::jsonb,
  missing_opportunities text[] default '{}',
  status text not null default 'new' check (status in (
    'new','audited','qualified','contact_ready','contacted','replied','won','lost','skip'
  )),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_prospects_domain
  on public.prospects (website_domain) where website_domain is not null and website_domain <> '';
create unique index if not exists uq_prospects_phone_norm
  on public.prospects (phone_norm) where phone_norm is not null and phone_norm <> '';
create unique index if not exists uq_prospects_name_city
  on public.prospects (business_name_norm, city);
create index if not exists idx_prospects_priority_status on public.prospects (priority, status);
create index if not exists idx_prospects_category_city on public.prospects (category, city);
create index if not exists idx_prospects_score on public.prospects (opportunity_score desc);

alter table public.prospects enable row level security;
drop policy if exists "prospects_admin_all" on public.prospects;
create policy "prospects_admin_all" on public.prospects
  for all using (public.is_admin()) with check (public.is_admin());

-- Outreach drafts (never auto-sent)
create table if not exists public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email','linkedin','other')),
  subject text,
  message text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','skipped','failed')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_outreach_prospect on public.outreach_drafts (prospect_id, status);
alter table public.outreach_drafts enable row level security;
drop policy if exists "outreach_admin_all" on public.outreach_drafts;
create policy "outreach_admin_all" on public.outreach_drafts
  for all using (public.is_admin()) with check (public.is_admin());

-- Scoring helper (configurable weights via jsonb later)
create or replace function public.score_prospect_from_audit(p_audit jsonb)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  s int := 0;
begin
  if coalesce((p_audit->>'website_exists')::boolean, false) is false then
    s := s + 30;
  elsif coalesce(p_audit->>'website_quality', '') in ('weak','outdated','broken') then
    s := s + 20;
  end if;
  if coalesce(p_audit->>'mobile_quality', '') in ('poor','none') then s := s + 10; end if;
  if coalesce((p_audit->>'has_whatsapp')::boolean, false) is false then s := s + 10; end if;
  if coalesce((p_audit->>'has_instagram')::boolean, false) is false then s := s + 5; end if;
  if coalesce((p_audit->>'has_google_cta')::boolean, false) is false then s := s + 5; end if;
  if coalesce((p_audit->>'has_contact_form')::boolean, false) is false then s := s + 5; end if;
  if coalesce((p_audit->>'needs_booking')::boolean, false) and coalesce((p_audit->>'has_booking')::boolean, false) is false then
    s := s + 10;
  end if;
  if coalesce((p_audit->>'has_seo_basics')::boolean, true) is false then s := s + 10; end if;
  return least(s, 100);
end;
$$;

create or replace function public.priority_from_score(p_score integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_score >= 60 then 'HIGH'
    when p_score >= 30 then 'MEDIUM'
    else 'LOW'
  end;
$$;

-- Touch updated_at
create or replace function public.trg_prospects_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists prospects_touch on public.prospects;
create trigger prospects_touch before update on public.prospects
  for each row execute function public.trg_prospects_touch();

create or replace function public.trg_outreach_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists outreach_touch on public.outreach_drafts;
create trigger outreach_touch before update on public.outreach_drafts
  for each row execute function public.trg_outreach_touch();

-- Ensure analytics_events can store growth events (table may already exist from 016/042)
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

-- Blog drafts cluster (12) — status=draft only, not published
insert into public.blog_posts (slug, title_ar, title_en, excerpt_ar, body_ar, status, tags, published_at)
select * from (values
  ('website-checklist-madinah-sme', 'قائمة فحص موقع الشركات الصغيرة في المدينة المنورة', 'Website checklist for Madinah SMEs',
   'بنود عملية تتأكد منها قبل أن تدفع لتصميم أو إعادة بناء موقع.',
   E'## لمن هذا المقال\nأصحاب المنشآت في المدينة المنورة الذين يفكرون في موقع جديد أو تحديث موقع قديم.\n\n## بنود الفحص\n1. هل الصفحة الرئيسية توضح ماذا تفعل خلال 5 ثوانٍ؟\n2. هل يوجد مسار واتساب واضح على الجوال؟\n3. هل صفحات الخدمات منفصلة وواضحة؟\n4. هل العناوين والوصف موجودان؟\n5. هل الموقع يفتح بسرعة معقولة على شبكة الجوال؟\n\n## الخطوة التالية\nراجع صفحة [تصميم المواقع](/services/web-design-madinah) أو تواصل عبر واتساب لنقاش النطاق — بدون أسعار ثابتة مسبقة.',
   'draft', array['web','madinah','sme'], null::timestamptz),
  ('ai-agents-when-to-start', 'متى تبدأ شركتك بوكيل ذكاء اصطناعي؟', 'When to start with an AI agent',
   'إشارات عملية: أسئلة متكررة، تأخير رد، وحاجة لتوحيد الأسلوب.',
   E'## الفكرة\nالوكيل مفيد عندما تتكرر نفس الأسئلة وتتأخر الردود.\n\n## علامات الاستعداد\n- لديك إجابات موثوقة يمكن توثيقها\n- فريق يراجع الحالات الاستثنائية\n- قناة واضحة للتحويل البشري\n\nراجع [وكلاء AI](/services/ai-agents-business).',
   'draft', array['ai','support'], null::timestamptz),
  ('whatsapp-customer-service-basics', 'أساسيات خدمة العملاء عبر واتساب بدون إزعاج', 'WhatsApp customer service basics',
   'كيف تنظم الاستقبال والمتابعة دون رسائل عشوائية.',
   E'## قواعد عملية\n- رد أولي سريع ثم تحويل واضح\n- لا ترسل عروضاً جماعية بدون موافقة ومسار نظامي\n- احتفظ بسجل بسيط للطلبات\n\n[أتمتة واتساب](/services/whatsapp-automation)',
   'draft', array['whatsapp','support'], null::timestamptz),
  ('social-automation-without-spam', 'أتمتة السوشيال بدون محتوى مكرر مزعج', 'Social automation without spam',
   'متى تساعد الأتمتة ومتى تضر بالحساب المحلي.',
   E'## المبدأ\nالأتمتة للتنظيم، والبشر للصوت الحقيقي.\n\n[أتمتة السوشيال](/services/social-media-automation)',
   'draft', array['social'], null::timestamptz),
  ('seo-vs-geo-for-local-business', 'الفرق بين SEO وGEO لمنشأة محلية', 'SEO vs GEO for local business',
   'وضوح الكيان والمحتوى أهم من حشو اسم المدينة.',
   E'## باختصار\nSEO للنتائج التقليدية، GEO/AEO لوضوح المعلومات أمام أنظمة الإجابة.\n\n[SEO / GEO](/services/seo-madinah)',
   'draft', array['seo','geo'], null::timestamptz),
  ('network-basics-for-retail', 'أساسيات الشبكة للمتاجر الصغيرة', 'Network basics for small retail',
   'واي فاي، نقاط بيع، وكاميرات على شبكة واحدة مرتبة.',
   E'## نقاط سريعة\n- افصل ضيوف الواي فاي عن أجهزة العمل إن أمكن\n- وثّق كلمات المرور والأجهزة\n\n[حلول الشبكات](/services/business-network-solutions)',
   'draft', array['network','retail'], null::timestamptz),
  ('restaurant-digital-presence', 'حضور رقمي للمطاعم: موقع وواتساب وقائمة', 'Restaurant digital presence',
   'ما الذي يحتاجه مطعم محلي قبل حملات الإعلانات.',
   E'## الأولويات\n1. قائمة واضحة\n2. واتساب\n3. صفحة تعريفية موثوقة\n\n[تصميم مواقع](/services/web-design-madinah)',
   'draft', array['restaurant'], null::timestamptz),
  ('hotel-guest-journey-digital', 'رحلة نزيل الفندق رقمياً: من البحث إلى الحجز', 'Hotel guest digital journey',
   'صفحات واضحة، تواصل سريع، وروابط حجز موثوقة.',
   E'## ملاحظة\nلا نخترع نسب إشغال؛ نركز على وضوح المسار.\n\n[حلول الفنادق](/solutions/hotel-digital-solutions-saudi)',
   'draft', array['hotel'], null::timestamptz),
  ('real-estate-lead-capture', 'التقاط عملاء العقارات عبر الويب وواتساب', 'Real estate lead capture',
   'صفحات مشاريع واضحة ومسار استفسار واحد.',
   E'## عناصر أساسية\n- صور حقيقية\n- منطقة ومدينة واضحة\n- زر واتساب\n\n[حلول العقارات](/solutions/real-estate-digital-solutions-saudi)',
   'draft', array['real-estate'], null::timestamptz),
  ('building-materials-catalog-online', 'كتالوج مواد البناء أونلاين: من الفوضى إلى طلب عرض سعر', 'Building materials online catalog',
   'كيف يساعد الموقع موزعي المواد على تنظيم الاستفسارات.',
   E'## الفكرة\nتصنيف المنتجات + نموذج/واتساب لطلب عرض سعر.\n\n[حلول مواد البناء](/solutions/building-materials-digital-solutions-saudi)',
   'draft', array['construction'], null::timestamptz),
  ('ecommerce-for-local-shop', 'متجر إلكتروني بسيط للمحل المحلي', 'Simple ecommerce for local shops',
   'متى يكفي كتالوج واتساب ومتى تحتاج متجراً.',
   E'## قرار عملي\nابدأ بحجم الطلبات الفعلي لا بعدد المنتجات فقط.\n\n[المتجر](/shop)',
   'draft', array['ecommerce'], null::timestamptz),
  ('madinah-sme-tech-priorities', 'أولويات التقنية للشركات الصغيرة في المدينة المنورة', 'Tech priorities for Madinah SMEs',
   'رتّب: تواصل، حضور، ثم أتمتة.',
   E'## ترتيب مقترح\n1. قناة تواصل موثوقة\n2. صفحة/موقع يوضح الخدمة\n3. تنظيم داخلي بسيط\n4. أتمتة محدودة\n\n[عن تيقنورا](/about)',
   'draft', array['madinah','sme'], null::timestamptz)
) as v(slug, title_ar, title_en, excerpt_ar, body_ar, status, tags, published_at)
where exists (select 1 from information_schema.tables where table_schema='public' and table_name='blog_posts')
on conflict (slug) do nothing;

comment on table public.prospects is 'Growth Engine discovered businesses; separate from inbound leads';
comment on table public.outreach_drafts is 'Outbound message drafts; require Admin approve before any send';
