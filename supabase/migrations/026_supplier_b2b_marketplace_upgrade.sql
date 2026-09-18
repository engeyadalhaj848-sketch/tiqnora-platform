-- TIQNORA 026 — Supplier management + B2B marketplace categories
-- Safe to re-run. No auto-publish / no auto-purchase.
-- Depends on 009; recommends 025 applied first.

-- Allow multiple suppliers per provider type (Saudi local manuals, etc.)
alter table public.commerce_suppliers drop constraint if exists commerce_suppliers_provider_key;
alter table public.commerce_suppliers drop constraint if exists commerce_suppliers_provider_unique;
do $$ begin
  alter table public.commerce_suppliers drop constraint if exists commerce_suppliers_provider_key;
exception when others then null;
end $$;

-- Drop unique(provider) if present
create unique index if not exists commerce_suppliers_provider_display_uidx
  on public.commerce_suppliers (provider, display_name);

-- Profile fields
alter table public.commerce_suppliers add column if not exists country text;
alter table public.commerce_suppliers add column if not exists website text;
alter table public.commerce_suppliers add column if not exists category text;
alter table public.commerce_suppliers add column if not exists shipping_method text;
alter table public.commerce_suppliers add column if not exists delivery_time_min_days int;
alter table public.commerce_suppliers add column if not exists delivery_time_max_days int;
alter table public.commerce_suppliers add column if not exists payment_terms text;
alter table public.commerce_suppliers add column if not exists commission_pct numeric(6,2);
alter table public.commerce_suppliers add column if not exists notes text;
alter table public.commerce_suppliers add column if not exists supplier_type text
  check (supplier_type is null or supplier_type in ('international', 'saudi_local', 'research'));
alter table public.commerce_suppliers add column if not exists api_connection_status text
  not null default 'not_configured'
  check (api_connection_status in ('not_configured', 'configured', 'connected', 'error'));

-- Ensure international rows exist with profile defaults
insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, commission_pct, notes, metadata
)
select * from (values
  ('aliexpress', 'AliExpress', 'not_configured', 'approval_required', 'international', 'CN', 'general_marketplace',
   'platform_shipping', 12, 30, 'platform_checkout', null::numeric,
   'Official API or partner only. Owner approval required.', '{"env":["ALIEXPRESS_API_KEY","ALIEXPRESS_API_SECRET"]}'::text),
  ('alibaba', 'Alibaba.com', 'not_configured', 'approval_required', 'international', 'CN', 'b2b_wholesale',
   'supplier_shipping', 15, 45, 'trade_assurance', null::numeric,
   'B2B wholesale. No auto-order.', '{"env":["ALIBABA_API_KEY","ALIBABA_API_SECRET"]}'::text),
  ('cj_dropshipping', 'CJ Dropshipping', 'not_configured', 'approval_required', 'international', 'CN', 'dropship',
   'cj_fulfillment', 10, 25, 'cj_wallet', 0::numeric,
   'CJ official API keys in Vercel.', '{"env":["CJ_API_KEY","CJ_API_SECRET"]}'::text),
  ('dsers', 'DSers', 'not_configured', 'approval_required', 'international', 'CN', 'dropship_tool',
   'via_aliexpress', 12, 30, 'via_platform', null::numeric,
   'DSers as intermediary — connect after agreement.', '{"env":["DSERS_API_KEY"]}'::text),
  ('amazon', 'Amazon Product Research', 'not_configured', 'approval_required', 'research', 'US', 'product_research',
   'n/a', null::int, null::int, 'n/a', null::numeric,
   'Research only — no auto listing.', '{"env":["AMAZON_PAAPI_KEY","AMAZON_PAAPI_SECRET","AMAZON_PARTNER_TAG"],"mode":"research_only"}'::text)
) as v(provider, display_name, status, fulfillment_mode, supplier_type, country, category,
       shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, commission_pct, notes, metadata)
where not exists (
  select 1 from public.commerce_suppliers s where s.provider = v.provider and s.display_name = v.display_name
);

-- Saudi local technology suppliers (manual — no API secrets)
insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select * from (values
  ('manual', 'موردو أجهزة الكمبيوتر (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'computers',
   'local_delivery', 1, 5, 'bank_transfer_or_credit', 'موردون محليون لأجهزة الكمبيوتر واللابتوب', '{}'),
  ('manual', 'موردو اللابتوب للأعمال (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'laptops',
   'local_delivery', 1, 7, 'bank_transfer_or_credit', 'لابتوبات أعمال ومحطات عمل', '{}'),
  ('manual', 'موردو كاميرات المراقبة (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'cctv',
   'local_delivery_install', 2, 10, 'bank_transfer', 'CCTV / NVR مع إمكانية التركيب', '{}'),
  ('manual', 'موردو الشبكات (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'networking',
   'local_delivery_install', 2, 10, 'bank_transfer', 'راوترات، سويتشات، كابلات، نقاط وصول', '{}'),
  ('manual', 'موردو نقاط البيع POS (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'pos',
   'local_delivery_setup', 2, 14, 'bank_transfer', 'أجهزة وبرامج نقاط البيع للمحلات', '{}'),
  ('manual', 'موردو الطابعات (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'printers',
   'local_delivery', 1, 7, 'bank_transfer', 'طابعات ليزر وحبر وإيصالات', '{}'),
  ('manual', 'موردو المنزل الذكي (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'smart_home',
   'local_delivery', 2, 10, 'bank_transfer', 'أجهزة منزل ومكتب ذكي', '{}'),
  ('manual', 'موردو تقنية الفنادق (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'hotel_tech',
   'project_delivery', 7, 30, 'project_terms', 'شبكات فنادق، IPTV، أقفال ذكية، بنية تحتية', '{}')
) as v(provider, display_name, status, fulfillment_mode, supplier_type, country, category,
       shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata)
where not exists (
  select 1 from public.commerce_suppliers s where s.display_name = v.display_name
);

-- Marketplace categories expansion
insert into public.categories (
  slug, type, name_ar, name_en, description_ar, description_en, sort_order, status
)
select v.slug, 'product', v.name_ar, v.name_en, v.description_ar, v.description_en, v.sort_order,
       'published'::public.content_status
from (values
  ('pos-systems', 'أنظمة نقاط البيع POS', 'POS Systems',
   'أجهزة وبرامج نقاط البيع للمحلات والسوبرماركت في السعودية.', 'POS hardware and software for Saudi retail.', 40),
  ('barcode-scanners', 'قارئات الباركود', 'Barcode Scanners',
   'قارئات باركود سلكية ولاسلكية لنقاط البيع.', 'Wired and wireless barcode scanners.', 41),
  ('receipt-printers', 'طابعات الإيصالات', 'Receipt Printers',
   'طابعات حرارية وإيصالات لنقاط البيع.', 'Thermal receipt printers for checkout.', 42),
  ('workstations', 'محطات العمل', 'Workstations',
   'محطات عمل احترافية للمكاتب والتصميم.', 'Professional workstations for office and design.', 12),
  ('access-points', 'نقاط الوصول اللاسلكية', 'Access Points',
   'نقاط وصول Wi‑Fi للمكاتب والفنادق.', 'Wi‑Fi access points for offices and hotels.', 22),
  ('fiber-equipment', 'معدات الألياف البصرية', 'Fiber Equipment',
   'حلول ألياف للربط عالي السرعة.', 'Fiber networking equipment.', 23),
  ('structured-cabling', 'التمديدات الهيكلية', 'Structured Cabling',
   'كابلات وملحقات التمديد الشبكي.', 'Structured cabling and accessories.', 24),
  ('access-control', 'التحكم في الدخول', 'Access Control',
   'أجهزة بصمة وبطاقات وتحكم أبواب.', 'Fingerprint and card access control.', 33),
  ('projectors', 'أجهزة العرض', 'Projectors',
   'بروجكتر للاجتماعات والقاعات.', 'Projectors for meetings and halls.', 52),
  ('hotel-technology', 'تقنيات الفنادق', 'Hotel Technology',
   'شبكات فنادق، IPTV، أقفال ذكية وبنية ضيافة.', 'Hotel WiFi, IPTV, smart locks and infrastructure.', 60)
) as v(slug, name_ar, name_en, description_ar, description_en, sort_order)
where not exists (select 1 from public.categories c where c.slug = v.slug);

-- Scout results table (structured AI analyses)
create table if not exists public.product_scout_results (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  supplier_name text,
  supplier_id uuid references public.commerce_suppliers(id) on delete set null,
  purchase_cost numeric(12,2),
  shipping_cost numeric(12,2) default 0,
  suggested_price numeric(12,2),
  expected_profit numeric(12,2),
  margin_pct numeric(6,2),
  market_demand text check (market_demand is null or market_demand in ('low','medium','high')),
  competition_level text check (competition_level is null or competition_level in ('low','medium','high')),
  seo_keywords text,
  product_category text,
  recommendation text check (recommendation is null or recommendation in ('suitable','marginal','not_suitable')),
  recommendation_reason text,
  ai_raw jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft','queued','approved','rejected')),
  import_queue_id uuid references public.product_import_queue(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_scout_created on public.product_scout_results(created_at desc);
alter table public.product_scout_results enable row level security;
drop policy if exists "product scout admin" on public.product_scout_results;
create policy "product scout admin" on public.product_scout_results
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.product_scout_results is 'AI product scout analyses — admin review before queue/publish';
