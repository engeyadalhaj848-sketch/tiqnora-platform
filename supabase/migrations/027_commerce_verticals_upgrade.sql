-- TIQNORA 027 — Commerce verticals: POS, Hotel, Construction, Safety + local Saudi suppliers + Scout scoring
-- Safe to re-run. No auto-publish / no auto-purchase.
-- Depends on 009 + recommends 025/026 applied first.

-- ========== Categories (product verticals) ==========
insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'pos-systems', 'product', 'أنظمة نقاط البيع والبيع بالتجزئة', 'POS & Retail Solutions',
  'أجهزة كاشير، قارئات باركود، طابعات فواتير، أدراج نقدية وأجهزة مخزون',
  'POS terminals, barcode scanners, receipt printers, cash drawers, inventory devices',
  70, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'pos-systems');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'hotel-technology', 'product', 'تقنيات الفنادق', 'Hotel Technology Solutions',
  'واي فاي فنادق، نقاط وصول، سويتشات، أقفال ذكية، أنظمة دخول، IPTV وأتمتة الغرف',
  'Hotel WiFi, access points, switches, smart locks, door access, IPTV, room automation',
  71, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'hotel-technology');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'construction-tech', 'product', 'تقنيات مواقع الإنشاء', 'Construction Technology',
  'كاميرات مواقع، معدات شبكات، لابتوبات هندسية، طابعات وأجهزة قياس',
  'Site cameras, network gear, engineering laptops, printers, measuring devices',
  72, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'construction-tech');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'safety-security', 'product', 'السلامة والأمن', 'Safety & Security',
  'كاميرات CCTV، أجهزة NVR، التحكم بالدخول، أجهزة بيومترية',
  'CCTV, NVR, access control, biometric devices',
  73, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'safety-security');

-- ========== Supplier profile extras (idempotent) ==========
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
alter table public.commerce_suppliers add column if not exists city text;
alter table public.commerce_suppliers add column if not exists contact_phone text;
alter table public.commerce_suppliers add column if not exists contact_email text;

update public.commerce_suppliers set api_connection_status = 'not_configured' where api_connection_status is null;
alter table public.commerce_suppliers alter column api_connection_status set default 'not_configured';

-- Allow manual + local variants without unique(provider) clash
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'commerce_suppliers' and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ~* '\(provider\)'
      and pg_get_constraintdef(c.oid) !~* 'display_name'
  loop
    execute format('alter table public.commerce_suppliers drop constraint if exists %I', r.conname);
  end loop;
end $$;

create unique index if not exists commerce_suppliers_provider_display_uidx
  on public.commerce_suppliers (provider, display_name);

-- ========== Local Saudi suppliers seed ==========
insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, city, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms,
  commission_pct, notes, api_connection_status, metadata
)
select
  v.provider, v.display_name, v.status, v.fulfillment_mode, v.supplier_type, v.country, v.city, v.category,
  v.shipping_method, v.delivery_time_min_days, v.delivery_time_max_days, v.payment_terms,
  v.commission_pct, v.notes, v.api_connection_status, v.metadata::jsonb
from (values
  (
    'manual'::text, 'موزع IT محلي — الرياض'::text, 'not_configured'::text, 'approval_required'::text,
    'local_saudi'::text, 'SA'::text, 'Riyadh'::text, 'computers'::text,
    'local_delivery'::text, 1, 5, 'net_30_or_cash'::text, null::numeric,
    'موزع أجهزة حاسب وطابعات وشبكات — تعاقد يدوي فقط.'::text, 'not_configured'::text,
    '{"region":"central","verticals":["computers","networking","printers"]}'::text
  ),
  (
    'manual', 'مورد CCTV وأمن — جدة', 'not_configured', 'approval_required',
    'local_saudi', 'SA', 'Jeddah', 'cctv',
    'local_delivery', 1, 7, 'cash_or_transfer', null::numeric,
    'مورد كاميرات ومسجلات وتحكم دخول — بدون API.',
    'not_configured',
    '{"region":"western","verticals":["cctv","safety-security","access-control"]}'
  ),
  (
    'manual', 'مورد أنظمة POS — الدمام', 'not_configured', 'approval_required',
    'local_saudi', 'SA', 'Dammam', 'pos',
    'local_delivery', 2, 7, 'net_15', null::numeric,
    'كاشير، باركود، أدراج نقدية وطابعات فواتير.',
    'not_configured',
    '{"region":"eastern","verticals":["pos","printers","retail"]}'
  ),
  (
    'manual', 'حلول شبكات وفنادق — الرياض', 'not_configured', 'approval_required',
    'local_saudi', 'SA', 'Riyadh', 'hotel',
    'local_delivery', 2, 10, 'project_invoice', null::numeric,
    'نقاط وصول، سويتشات، أقفال ذكية ومعدات غرف فندقية.',
    'not_configured',
    '{"region":"central","verticals":["hotel","networking","smart_home"]}'
  ),
  (
    'manual', 'جملة ملحقات مكتبية وتقنية — الرياض', 'not_configured', 'approval_required',
    'local_saudi', 'SA', 'Riyadh', 'computers',
    'local_delivery', 1, 4, 'cash_or_transfer', null::numeric,
    'لابتوبات، محطات عمل، ملحقات — جملة B2B.',
    'not_configured',
    '{"region":"central","verticals":["computers","printers"]}'
  )
) as v(
  provider, display_name, status, fulfillment_mode, supplier_type, country, city, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms,
  commission_pct, notes, api_connection_status, metadata
)
where not exists (
  select 1 from public.commerce_suppliers s where s.display_name = v.display_name
);

-- Ensure international rows have supplier_type
update public.commerce_suppliers
set supplier_type = 'international'
where supplier_type is null
  and provider in ('aliexpress','alibaba','cj_dropshipping','dsers','amazon');

update public.commerce_suppliers
set supplier_type = 'local_saudi'
where supplier_type is null and country = 'SA';

-- ========== Product Scout results — scoring columns ==========
create table if not exists public.product_scout_results (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  supplier_name text,
  supplier_id uuid references public.commerce_suppliers(id) on delete set null,
  purchase_cost numeric(12,2),
  shipping_cost numeric(12,2) default 0,
  vat_amount numeric(12,2) default 0,
  suggested_price numeric(12,2),
  expected_profit numeric(12,2),
  margin_pct numeric(6,2),
  score int,
  market_demand text,
  competition_level text,
  seo_opportunity text,
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

alter table public.product_scout_results add column if not exists vat_amount numeric(12,2) default 0;
alter table public.product_scout_results add column if not exists score int;
alter table public.product_scout_results add column if not exists seo_opportunity text;

create index if not exists idx_product_scout_created on public.product_scout_results(created_at desc);
create index if not exists idx_product_scout_score on public.product_scout_results(score desc nulls last);
create index if not exists idx_product_scout_status on public.product_scout_results(status);

alter table public.product_scout_results enable row level security;
drop policy if exists "product scout admin" on public.product_scout_results;
create policy "product scout admin" on public.product_scout_results
  for all using (public.is_admin()) with check (public.is_admin());

-- Optional: product opportunity tags on products (non-breaking)
alter table public.products add column if not exists opportunity_tags text[];
alter table public.products add column if not exists scout_score int;

comment on table public.product_scout_results is 'AI Product Scout drafts — admin review only; never auto-publish';
