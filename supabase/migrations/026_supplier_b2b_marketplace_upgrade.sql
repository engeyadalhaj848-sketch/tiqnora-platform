-- TIQNORA 026 FIX — paste this entire file (no select * from values)
-- Safe to re-run.

-- Columns
alter table public.commerce_suppliers add column if not exists country text;
alter table public.commerce_suppliers add column if not exists website text;
alter table public.commerce_suppliers add column if not exists category text;
alter table public.commerce_suppliers add column if not exists shipping_method text;
alter table public.commerce_suppliers add column if not exists delivery_time_min_days int;
alter table public.commerce_suppliers add column if not exists delivery_time_max_days int;
alter table public.commerce_suppliers add column if not exists payment_terms text;
alter table public.commerce_suppliers add column if not exists commission_pct numeric(6,2);
alter table public.commerce_suppliers add column if not exists notes text;
alter table public.commerce_suppliers add column if not exists supplier_type text;
alter table public.commerce_suppliers add column if not exists api_connection_status text default 'not_configured';

create unique index if not exists commerce_suppliers_provider_display_uidx
  on public.commerce_suppliers (provider, display_name);

-- International (one row each — explicit jsonb)
insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, commission_pct, notes, metadata
)
select 'aliexpress', 'AliExpress', 'not_configured', 'approval_required', 'international', 'CN', 'general_marketplace',
  'platform_shipping', 12, 30, 'platform_checkout', null, 'Official API or partner only.',
  '{"env":["ALIEXPRESS_API_KEY","ALIEXPRESS_API_SECRET"]}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.provider = 'aliexpress' and s.display_name = 'AliExpress');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, commission_pct, notes, metadata
)
select 'alibaba', 'Alibaba.com', 'not_configured', 'approval_required', 'international', 'CN', 'b2b_wholesale',
  'supplier_shipping', 15, 45, 'trade_assurance', null, 'B2B wholesale. No auto-order.',
  '{"env":["ALIBABA_API_KEY","ALIBABA_API_SECRET"]}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.provider = 'alibaba' and s.display_name = 'Alibaba.com');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, commission_pct, notes, metadata
)
select 'cj_dropshipping', 'CJ Dropshipping', 'not_configured', 'approval_required', 'international', 'CN', 'dropship',
  'cj_fulfillment', 10, 25, 'cj_wallet', 0, 'CJ official API keys in Vercel.',
  '{"env":["CJ_API_KEY","CJ_API_SECRET"]}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.provider = 'cj_dropshipping' and s.display_name = 'CJ Dropshipping');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, commission_pct, notes, metadata
)
select 'dsers', 'DSers', 'not_configured', 'approval_required', 'international', 'CN', 'dropship_tool',
  'via_aliexpress', 12, 30, 'via_platform', null, 'DSers intermediary.',
  '{"env":["DSERS_API_KEY"]}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.provider = 'dsers' and s.display_name = 'DSers');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, commission_pct, notes, metadata
)
select 'amazon', 'Amazon Product Research', 'not_configured', 'approval_required', 'research', 'US', 'product_research',
  'n/a', null, null, 'n/a', null, 'Research only — no auto listing.',
  '{"mode":"research_only"}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.provider = 'amazon' and s.display_name = 'Amazon Product Research');

-- Saudi local
insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select 'manual', 'موردو أجهزة الكمبيوتر (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'computers',
  'local_delivery', 1, 5, 'bank_transfer_or_credit', 'موردون محليون لأجهزة الكمبيوتر', '{}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.display_name = 'موردو أجهزة الكمبيوتر (محلي)');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select 'manual', 'موردو اللابتوب للأعمال (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'laptops',
  'local_delivery', 1, 7, 'bank_transfer_or_credit', 'لابتوبات أعمال', '{}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.display_name = 'موردو اللابتوب للأعمال (محلي)');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select 'manual', 'موردو كاميرات المراقبة (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'cctv',
  'local_delivery_install', 2, 10, 'bank_transfer', 'CCTV / NVR', '{}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.display_name = 'موردو كاميرات المراقبة (محلي)');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select 'manual', 'موردو الشبكات (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'networking',
  'local_delivery_install', 2, 10, 'bank_transfer', 'راوترات وسويتشات', '{}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.display_name = 'موردو الشبكات (محلي)');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select 'manual', 'موردو نقاط البيع POS (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'pos',
  'local_delivery_setup', 2, 14, 'bank_transfer', 'أجهزة POS', '{}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.display_name = 'موردو نقاط البيع POS (محلي)');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select 'manual', 'موردو الطابعات (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'printers',
  'local_delivery', 1, 7, 'bank_transfer', 'طابعات', '{}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.display_name = 'موردو الطابعات (محلي)');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select 'manual', 'موردو المنزل الذكي (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'smart_home',
  'local_delivery', 2, 10, 'bank_transfer', 'منزل ومكتب ذكي', '{}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.display_name = 'موردو المنزل الذكي (محلي)');

insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select 'manual', 'موردو تقنية الفنادق (محلي)', 'not_configured', 'approval_required', 'saudi_local', 'SA', 'hotel_tech',
  'project_delivery', 7, 30, 'project_terms', 'شبكات فنادق و IPTV', '{}'::jsonb
where not exists (select 1 from public.commerce_suppliers s where s.display_name = 'موردو تقنية الفنادق (محلي)');

-- Categories
insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'pos-systems', 'product', 'أنظمة نقاط البيع POS', 'POS Systems',
  'أجهزة وبرامج نقاط البيع للمحلات.', 'POS systems for retail.', 40, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'pos-systems');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'barcode-scanners', 'product', 'قارئات الباركود', 'Barcode Scanners',
  'قارئات باركود لنقاط البيع.', 'Barcode scanners.', 41, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'barcode-scanners');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'receipt-printers', 'product', 'طابعات الإيصالات', 'Receipt Printers',
  'طابعات حرارية للإيصالات.', 'Receipt printers.', 42, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'receipt-printers');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'workstations', 'product', 'محطات العمل', 'Workstations',
  'محطات عمل للمكاتب.', 'Workstations.', 12, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'workstations');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'access-points', 'product', 'نقاط الوصول اللاسلكية', 'Access Points',
  'نقاط وصول Wi-Fi.', 'Wi-Fi access points.', 22, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'access-points');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'fiber-equipment', 'product', 'معدات الألياف البصرية', 'Fiber Equipment',
  'حلول ألياف.', 'Fiber equipment.', 23, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'fiber-equipment');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'structured-cabling', 'product', 'التمديدات الهيكلية', 'Structured Cabling',
  'كابلات وتمديدات.', 'Structured cabling.', 24, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'structured-cabling');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'access-control', 'product', 'التحكم في الدخول', 'Access Control',
  'بصمة وبطاقات.', 'Access control.', 33, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'access-control');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'projectors', 'product', 'أجهزة العرض', 'Projectors',
  'بروجكتر للاجتماعات.', 'Projectors.', 52, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'projectors');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'hotel-technology', 'product', 'تقنيات الفنادق', 'Hotel Technology',
  'شبكات فنادق و IPTV وأقفال ذكية.', 'Hotel technology.', 60, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'hotel-technology');

-- Scout table
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
  market_demand text,
  competition_level text,
  seo_keywords text,
  product_category text,
  recommendation text,
  recommendation_reason text,
  ai_raw jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  import_queue_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_scout_created on public.product_scout_results(created_at desc);
alter table public.product_scout_results enable row level security;
drop policy if exists "product scout admin" on public.product_scout_results;
create policy "product scout admin" on public.product_scout_results
  for all using (public.is_admin()) with check (public.is_admin());
