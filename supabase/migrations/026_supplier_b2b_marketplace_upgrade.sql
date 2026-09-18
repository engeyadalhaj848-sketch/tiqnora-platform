-- TIQNORA 026 — Supplier management + B2B marketplace categories
-- Safe to re-run. No auto-publish / no auto-purchase.
-- Depends on 009; recommends 025 applied first.
-- Fixed: explicit jsonb casts (ERROR 42804).

-- Allow multiple suppliers per provider type (Saudi local manuals, etc.)
alter table public.commerce_suppliers drop constraint if exists commerce_suppliers_provider_key;
do $$ begin
  alter table public.commerce_suppliers drop constraint if exists commerce_suppliers_provider_unique;
exception when others then null;
end $$;

-- Drop unique(provider) if the constraint name differs
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'commerce_suppliers'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%(provider)%'
      and pg_get_constraintdef(c.oid) not ilike '%display_name%'
  loop
    execute format('alter table public.commerce_suppliers drop constraint if exists %I', r.conname);
  end loop;
end $$;

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
alter table public.commerce_suppliers add column if not exists supplier_type text;
alter table public.commerce_suppliers add column if not exists api_connection_status text;

-- Soft checks via update defaults (avoid hard fail if constraint already exists)
update public.commerce_suppliers set api_connection_status = 'not_configured' where api_connection_status is null;
alter table public.commerce_suppliers alter column api_connection_status set default 'not_configured';

-- International suppliers (explicit casts — no select * from values type inference)
insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms,
  commission_pct, notes, metadata
)
select
  v.provider, v.display_name, v.status, v.fulfillment_mode, v.supplier_type, v.country, v.category,
  v.shipping_method, v.delivery_time_min_days, v.delivery_time_max_days, v.payment_terms,
  v.commission_pct, v.notes, v.metadata::jsonb
from (
  values
    (
      'aliexpress'::text, 'AliExpress'::text, 'not_configured'::text, 'approval_required'::text,
      'international'::text, 'CN'::text, 'general_marketplace'::text, 'platform_shipping'::text,
      12, 30, 'platform_checkout'::text, null::numeric,
      'Official API or partner only. Owner approval required.'::text,
      '{"env":["ALIEXPRESS_API_KEY","ALIEXPRESS_API_SECRET"]}'::text
    ),
    (
      'alibaba', 'Alibaba.com', 'not_configured', 'approval_required',
      'international', 'CN', 'b2b_wholesale', 'supplier_shipping',
      15, 45, 'trade_assurance', null::numeric,
      'B2B wholesale. No auto-order.',
      '{"env":["ALIBABA_API_KEY","ALIBABA_API_SECRET"]}'
    ),
    (
      'cj_dropshipping', 'CJ Dropshipping', 'not_configured', 'approval_required',
      'international', 'CN', 'dropship', 'cj_fulfillment',
      10, 25, 'cj_wallet', 0::numeric,
      'CJ official API keys in Vercel.',
      '{"env":["CJ_API_KEY","CJ_API_SECRET"]}'
    ),
    (
      'dsers', 'DSers', 'not_configured', 'approval_required',
      'international', 'CN', 'dropship_tool', 'via_aliexpress',
      12, 30, 'via_platform', null::numeric,
      'DSers as intermediary — connect after agreement.',
      '{"env":["DSERS_API_KEY"]}'
    ),
    (
      'amazon', 'Amazon Product Research', 'not_configured', 'approval_required',
      'research', 'US', 'product_research', 'n/a',
      null::int, null::int, 'n/a', null::numeric,
      'Research only — no auto listing.',
      '{"env":["AMAZON_PAAPI_KEY","AMAZON_PAAPI_SECRET","AMAZON_PARTNER_TAG"],"mode":"research_only"}'
    )
) as v(
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms,
  commission_pct, notes, metadata
)
where not exists (
  select 1 from public.commerce_suppliers s
  where s.provider = v.provider and s.display_name = v.display_name
);

-- Saudi local technology suppliers (manual)
insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
select
  v.provider, v.display_name, v.status, v.fulfillment_mode, v.supplier_type, v.country, v.category,
  v.shipping_method, v.delivery_time_min_days, v.delivery_time_max_days, v.payment_terms,
  v.notes, v.metadata::jsonb
from (
  values
    ('manual'::text, 'موردو أجهزة الكمبيوتر (محلي)'::text, 'not_configured'::text, 'approval_required'::text,
     'saudi_local'::text, 'SA'::text, 'computers'::text, 'local_delivery'::text, 1, 5,
     'bank_transfer_or_credit'::text, 'موردون محليون لأجهزة الكمبيوتر واللابتوب'::text, '{}'::text),
    ('manual', 'موردو اللابتوب للأعمال (محلي)', 'not_configured', 'approval_required',
     'saudi_local', 'SA', 'laptops', 'local_delivery', 1, 7,
     'bank_transfer_or_credit', 'لابتوبات أعمال ومحطات عمل', '{}'),
    ('manual', 'موردو كاميرات المراقبة (محلي)', 'not_configured', 'approval_required',
     'saudi_local', 'SA', 'cctv', 'local_delivery_install', 2, 10,
     'bank_transfer', 'CCTV / NVR مع إمكانية التركيب', '{}'),
    ('manual', 'موردو الشبكات (محلي)', 'not_configured', 'approval_required',
     'saudi_local', 'SA', 'networking', 'local_delivery_install', 2, 10,
     'bank_transfer', 'راوترات، سويتشات، كابلات، نقاط وصول', '{}'),
    ('manual', 'موردو نقاط البيع POS (محلي)', 'not_configured', 'approval_required',
     'saudi_local', 'SA', 'pos', 'local_delivery_setup', 2, 14,
     'bank_transfer', 'أجهزة وبرامج نقاط البيع للمحلات', '{}'),
    ('manual', 'موردو الطابعات (محلي)', 'not_configured', 'approval_required',
     'saudi_local', 'SA', 'printers', 'local_delivery', 1, 7,
     'bank_transfer', 'طابعات ليزر وحبر وإيصالات', '{}'),
    ('manual', 'موردو المنزل الذكي (محلي)', 'not_configured', 'approval_required',
     'saudi_local', 'SA', 'smart_home', 'local_delivery', 2, 10,
     'bank_transfer', 'أجهزة منزل ومكتب ذكي', '{}'),
    ('manual', 'موردو تقنية الفنادق (محلي)', 'not_configured', 'approval_required',
     'saudi_local', 'SA', 'hotel_tech', 'project_delivery', 7, 30,
     'project_terms', 'شبكات فنادق، IPTV، أقفال ذكية، بنية تحتية', '{}')
) as v(
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, notes, metadata
)
where not exists (
  select 1 from public.commerce_suppliers s where s.display_name = v.display_name
);

-- Marketplace categories expansion
insert into public.categories (
  slug, type, name_ar, name_en, description_ar, description_en, sort_order, status
)
select
  v.slug, 'product', v.name_ar, v.name_en, v.description_ar, v.description_en, v.sort_order,
  'published'::public.content_status
from (
  values
    ('pos-systems'::text, 'أنظمة نقاط البيع POS'::text, 'POS Systems'::text,
     'أجهزة وبرامج نقاط البيع للمحلات والسوبرماركت في السعودية.'::text,
     'POS hardware and software for Saudi retail.'::text, 40),
    ('barcode-scanners', 'قارئات الباركود', 'Barcode Scanners',
     'قارئات باركود سلكية ولاسلكية لنقاط البيع.',
     'Wired and wireless barcode scanners.', 41),
    ('receipt-printers', 'طابعات الإيصالات', 'Receipt Printers',
     'طابعات حرارية وإيصالات لنقاط البيع.',
     'Thermal receipt printers for checkout.', 42),
    ('workstations', 'محطات العمل', 'Workstations',
     'محطات عمل احترافية للمكاتب والتصميم.',
     'Professional workstations for office and design.', 12),
    ('access-points', 'نقاط الوصول اللاسلكية', 'Access Points',
     'نقاط وصول Wi‑Fi للمكاتب والفنادق.',
     'Wi‑Fi access points for offices and hotels.', 22),
    ('fiber-equipment', 'معدات الألياف البصرية', 'Fiber Equipment',
     'حلول ألياف للربط عالي السرعة.',
     'Fiber networking equipment.', 23),
    ('structured-cabling', 'التمديدات الهيكلية', 'Structured Cabling',
     'كابلات وملحقات التمديد الشبكي.',
     'Structured cabling and accessories.', 24),
    ('access-control', 'التحكم في الدخول', 'Access Control',
     'أجهزة بصمة وبطاقات وتحكم أبواب.',
     'Fingerprint and card access control.', 33),
    ('projectors', 'أجهزة العرض', 'Projectors',
     'بروجكتر للاجتماعات والقاعات.',
     'Projectors for meetings and halls.', 52),
    ('hotel-technology', 'تقنيات الفنادق', 'Hotel Technology',
     'شبكات فنادق، IPTV، أقفال ذكية وبنية ضيافة.',
     'Hotel WiFi, IPTV, smart locks and infrastructure.', 60)
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

-- Optional FK to import queue if table exists (025)
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'product_import_queue'
  ) then
    begin
      alter table public.product_scout_results
        add constraint product_scout_results_import_queue_id_fkey
        foreign key (import_queue_id) references public.product_import_queue(id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

create index if not exists idx_product_scout_created on public.product_scout_results(created_at desc);
alter table public.product_scout_results enable row level security;
drop policy if exists "product scout admin" on public.product_scout_results;
create policy "product scout admin" on public.product_scout_results
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.product_scout_results is 'AI product scout analyses — admin review before queue/publish';
