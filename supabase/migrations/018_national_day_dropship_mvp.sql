-- Tiqnora National Day Dropshipping MVP (no auto-purchase)
-- Safe additive migration

-- Campaign flag on products
alter table public.products
  add column if not exists campaign_tags text[] not null default '{}';

alter table public.products
  add column if not exists supplier_name text;

alter table public.products
  add column if not exists supplier_url text;

comment on column public.products.campaign_tags is 'e.g. national-day, ramadan — used by campaign landings';
comment on column public.products.supplier_name is 'Manual supplier label for dropship margin view';
comment on column public.products.supplier_url is 'Source URL for operator reference (not shown to customers by default)';

-- Ensure National Day category exists (product type)
insert into public.categories (slug, name_ar, name_en, type, sort_order, status)
select 'national-day', 'عروض اليوم الوطني', 'National Day Offers', 'product', 1, 'published'
where not exists (select 1 from public.categories where slug = 'national-day');

-- Future integration placeholders (no credentials)
insert into public.commerce_suppliers (provider, display_name, status, fulfillment_mode, shipping_countries, currency, metadata)
values
  ('aliexpress', 'AliExpress', 'not_configured', 'approval_required', array['SA'], 'SAR', '{"future":true,"note":"Manual approval only — no auto buy"}'::jsonb),
  ('alibaba', 'Alibaba', 'not_configured', 'approval_required', array['SA'], 'SAR', '{"future":true}'::jsonb)
on conflict (provider) do update set updated_at = now();

-- Optional: mark CJ-style provider if check allows — schema may only allow listed providers
-- Skip providers not in check constraint

-- Demo campaign products only if table empty of national-day tagged items
do $$
declare
  cat_id uuid;
  cnt int;
begin
  select id into cat_id from public.categories where slug = 'national-day' limit 1;
  select count(*) into cnt from public.products where 'national-day' = any(campaign_tags);
  if cnt = 0 and cat_id is not null then
    insert into public.products (
      slug, sku, category_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar
    ) values
    (
      'nd96-led-strip-smart',
      'ND96-LED-01',
      cat_id,
      'شريط إضاءة ذكي RGB — عرض اليوم الوطني',
      'Smart RGB LED Strip — National Day Offer',
      'شريط إضاءة قابل للتحكم عبر التطبيق، مناسب للديكور المنزلي والاحتفالات. تنفيذ دروبشيبنغ بموافقة المشغّل.',
      'App-controlled RGB LED strip for home décor. Dropship fulfillment with operator approval.',
      129.00, 20, 55.00, 50, true,
      array[]::text[],
      true, true, 10, 'dropship', 'يصل خلال 7–14 يوم عمل',
      array['national-day'], 'Manual / TBD', 'اليوم الوطني، إضاءة، عرض'
    ),
    (
      'nd96-powerbank-20k',
      'ND96-PB-20K',
      cat_id,
      'باور بانك 20000 مللي أمبير — خصم وطني',
      '20000mAh Power Bank — National Offer',
      'شحن سريع للجوالات والأجهزة اللوحية. مثالي للسفر والمناسبات.',
      'Fast-charge power bank for phones and tablets.',
      149.00, 15, 70.00, 40, true,
      array[]::text[],
      true, true, 20, 'dropship', 'يصل خلال 7–12 يوم عمل',
      array['national-day'], 'Manual / TBD', 'اليوم الوطني، شحن، باور بانك'
    ),
    (
      'nd96-desk-organizer',
      'ND96-DESK-01',
      cat_id,
      'منظم مكتب خشبي — لمسة احتفال',
      'Wooden Desk Organizer — Seasonal',
      'تنظيم مكتبي أنيق للمكاتب المنزلية والشركات الصغيرة.',
      'Elegant desk organizer for home and small offices.',
      89.00, 25, 35.00, 30, true,
      array[]::text[],
      true, false, 30, 'dropship', 'يصل خلال 8–15 يوم عمل',
      array['national-day'], 'Manual / TBD', 'اليوم الوطني، مكتب'
    );
  end if;
end $$;
