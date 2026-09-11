-- ============================================================
-- TIQNORA AI — Supabase Database Schema (Production)
-- Version: 1.0 | 2026-09-10
-- Run this file in Supabase SQL Editor (whole file at once)
-- ============================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
create type user_role as enum ('customer', 'admin', 'super_admin');
create type content_status as enum ('draft', 'published', 'archived');
create type service_period as enum ('one_time', 'monthly', 'yearly');
create type order_status as enum ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
create type payment_status as enum ('unpaid', 'paid', 'failed', 'refunded');
create type payment_method as enum ('cod', 'bank_transfer', 'mada', 'credit_card', 'apple_pay');
create type shipment_status as enum ('pending', 'created', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled');
create type shipping_provider as enum ('smsa', 'spl', 'aramex', 'dhl', 'custom');

-- ============================================================
-- 1. USERS / ADMINS / ROLES / PERMISSIONS
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role user_role not null default 'customer',
  is_active boolean not null default true,
  avatar_url text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role user_role not null,
  permission text not null,          -- e.g. 'manage_services', 'manage_orders', 'manage_settings'
  created_at timestamptz not null default now(),
  unique(role, permission)
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,               -- e.g. 'service.create', 'order.update'
  entity text,                        -- table name
  entity_id text,
  details jsonb default '{}',
  ip text,
  created_at timestamptz not null default now()
);

-- Helper: auto-create profile on signup; owner emails get super_admin automatically
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_emails text[] := array['eng.eyadalhaj848@gmail.com'];
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when lower(new.email) = any(owner_emails) then 'super_admin'::user_role else 'customer'::user_role end)
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is admin check
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin') and is_active
  );
$$;

-- ============================================================
-- 2. CATEGORIES / BRANDS
-- ============================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  type text not null check (type in ('service', 'product')),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  icon text,
  image_url text,
  sort_order int not null default 0,
  status content_status not null default 'published',
  seo_title_ar text, seo_title_en text,
  seo_description_ar text, seo_description_en text,
  keywords_ar text, keywords_en text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  description text,
  status content_status not null default 'published',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. SERVICES
-- ============================================================

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id uuid references public.categories(id) on delete set null,
  icon text default '✦',
  image_url text,
  title_ar text not null,
  title_en text not null,
  description_ar text not null,
  description_en text not null,
  details_ar text,
  details_en text,
  price numeric(10,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  period service_period not null default 'one_time',
  duration_hours numeric(8,2),
  status content_status not null default 'published',
  featured boolean not null default false,
  sort_order int not null default 0,
  seo_title_ar text, seo_title_en text,
  seo_description_ar text, seo_description_en text,
  keywords_ar text, keywords_en text,
  schema_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. PRODUCTS (E-COMMERCE)
-- ============================================================

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  sku text unique,
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  specifications jsonb default '{}',   -- [{"key_ar":"","key_en":"","value_ar":"","value_en":""}]
  price numeric(10,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  cost_price numeric(10,2),
  stock_quantity int not null default 0,
  track_stock boolean not null default true,
  images text[] default '{}',
  is_active boolean not null default true,
  featured boolean not null default false,
  sort_order int not null default 0,
  seo_title_ar text, seo_title_en text,
  seo_description_ar text, seo_description_en text,
  keywords_ar text, keywords_en text,
  schema_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  sku text,
  price numeric(10,2),
  stock_quantity int not null default 0,
  attributes jsonb default '{}',
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- ============================================================
-- 5. PACKAGES / PRICING / COUPONS
-- ============================================================

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  features_ar text[] default '{}',
  features_en text[] default '{}',
  price_monthly numeric(10,2) not null default 0,
  price_yearly numeric(10,2),
  discount_percent numeric(5,2) not null default 0,
  price_range_min numeric(10,2),
  price_range_max numeric(10,2),
  billing_type text not null default 'monthly' check (billing_type in ('monthly','yearly','one_time','range')),
  is_visible boolean not null default true,
  featured boolean not null default false,
  sort_order int not null default 0,
  cta_label_ar text, cta_label_en text,
  seo_title_ar text, seo_title_en text,
  seo_description_ar text, seo_description_en text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null default 'percent' check (type in ('percent','fixed','free_shipping')),
  value numeric(10,2) not null default 0,
  min_order_amount numeric(10,2) default 0,
  max_uses int,
  used_count int not null default 0,
  starts_at timestamptz default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. CUSTOMERS / ORDERS / PAYMENTS
-- ============================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  city text,
  address text,
  notes text,
  total_orders int not null default 0,
  total_spent numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  -- snapshot of customer info (works for guest checkout too)
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  shipping_city text,
  shipping_address text,
  items jsonb not null default '[]',  -- snapshot: [{kind, ref_id, title_ar, title_en, price, qty}]
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  coupon_code text,
  shipping_cost numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'SAR',
  status order_status not null default 'pending',
  payment_status payment_status not null default 'unpaid',
  payment_method payment_method not null default 'cod',
  notes text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_type text not null check (item_type in ('service','product','package')),
  ref_id uuid,
  title_ar text not null,
  title_en text not null,
  unit_price numeric(10,2) not null,
  quantity int not null default 1,
  line_total numeric(12,2) not null
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method payment_method not null,
  status payment_status not null default 'unpaid',
  amount numeric(12,2) not null,
  transaction_ref text,
  provider_payload jsonb default '{}',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. SHIPPING
-- ============================================================

create table public.shipping_settings (
  id uuid primary key default gen_random_uuid(),
  provider shipping_provider not null unique,
  display_name text not null,
  api_key_encrypted text,
  api_url text,
  is_enabled boolean not null default false,
  supports_tracking boolean not null default true,
  base_cost numeric(10,2) not null default 0,
  free_shipping_threshold numeric(10,2),
  config jsonb default '{}',
  updated_at timestamptz not null default now()
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider shipping_provider not null default 'smsa',
  awb_number text,                    -- tracking number from carrier
  tracking_url text,
  status shipment_status not null default 'pending',
  cost numeric(10,2) default 0,
  label_url text,
  events jsonb default '[]',          -- [{status, location, timestamp, description}]
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8. CMS: MEDIA / PAGES / SETTINGS / SEO
-- ============================================================

create table public.media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  url text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  alt_text text,
  folder text default 'general',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_ar text not null,
  title_en text not null,
  content jsonb not null default '{}',  -- flexible sections: [{type, props}]
  status content_status not null default 'published',
  is_in_nav boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Keys used by the platform (insert defaults):
insert into public.site_settings (key, value) values
  ('site', '{"name_ar":"Tiqnora AI","name_en":"Tiqnora AI","logo_url":"assets/tiqnora-logo.png","default_lang":"ar","default_theme":"midnight","active_themes":["midnight","pearl","desert","ocean","forest","aurora","royal"],"contact_email":"eng.eyadalhaj848@gmail.com","phone":"","whatsapp":"","city":"Madinah","country":"SA"}'),
  ('hero', '{"eyebrow_ar":"حلول تقنية تفهم عملك","title_ar":"نبني أنظمة تقنية تعمل بثقة.","title_en":"We build systems that work with confidence.","subtitle_ar":"","subtitle_en":"","image_url":"","cta_primary_ar":"شاهد الباقات","cta_primary_href":"#pricing","cta_secondary_ar":"استكشف الخدمات","cta_secondary_href":"#services"}'),
  ('social', '{"linkedin":"https://www.linkedin.com/in/eyad-alhaj-aa186925a","github":"https://github.com/engeyadalhaj848-sketch","twitter":"","instagram":""}'),
  ('seo', '{"default_title_ar":"Tiqnora AI | حلول تقنية عملية للأعمال","default_title_en":"Tiqnora AI | Practical technology solutions","default_description_ar":"حلول تقنية عملية في البنية التحتية، الأنظمة، المواقع، التسويق والأتمتة.","default_description_en":"Practical technology solutions in infrastructure, systems, websites, marketing and automation.","og_image_url":"","twitter_handle":"","geo_region":"SA","geo_cities":["Riyadh","Madinah","Jeddah"],"ga_measurement_id":"","gsc_verification":""}'),
  ('store', '{"enabled":true,"currency":"SAR","allow_guest_checkout":true,"cod_enabled":true,"bank_transfer_enabled":true,"bank_details_ar":"","bank_details_en":"","low_stock_threshold":3}'),
  ('shipping', '{"default_provider":"smsa","flat_rate":25,"free_threshold":500,"enabled_providers":["smsa","spl","aramex","dhl"]}'),
  ('ai', '{"default_provider":"openai","api_keys":{},"modules":{"assistant":{"enabled":true},"marketing":{"enabled":false},"ads":{"enabled":false},"sales":{"enabled":false},"channel":{"enabled":false},"content":{"enabled":false}}}'),
  ('theme', '{"active":"midnight","allow_user_switch":true}');

-- ============================================================
-- 9. AI MODULES
-- ============================================================

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,           -- assistant, marketing, ads, sales, channel, content
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  provider text not null default 'openai',
  model text default 'gpt-4o-mini',
  system_prompt text,
  temperature numeric(3,2) default 0.7,
  is_enabled boolean not null default false,
  api_ready boolean not null default true,
  config jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_agents (slug, name_ar, name_en, description_ar, description_en) values
  ('assistant', 'المساعد الذكي', 'AI Assistant', 'مساعد عام لخدمة العملاء والردود السريعة.', 'General assistant for customer service and quick replies.'),
  ('marketing', 'مدير التسويق الذكي', 'AI Marketing Manager', 'توليد خطط تسويقية ومحتوى حملات.', 'Generate marketing plans and campaign content.'),
  ('ads', 'مدير الإعلانات الذكي', 'AI Ads Manager', 'اقتراح هياكل حملات وإعلانات محسّنة.', 'Suggest campaign structures and optimized ads.'),
  ('sales', 'محلل المبيعات الذكي', 'AI Sales Analyst', 'تحليل الطلبات والفرص واقتراحات بيعية.', 'Analyze orders and opportunities with sales suggestions.'),
  ('channel', 'محلل القنوات الذكي', 'AI Channel Analyst', 'تحليل أداء قنوات البيع والتواصل.', 'Analyze sales and communication channel performance.'),
  ('content', 'مولّد المحتوى الذكي', 'AI Content Generator', 'توليد نصوص ومنشورات ووصف منتجات.', 'Generate copy, posts and product descriptions.');

-- ============================================================
-- 10. CONTACT / LEADS / ANALYTICS
-- ============================================================

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  message text,
  source text default 'contact_form',
  status text not null default 'new' check (status in ('new','contacted','qualified','converted','closed')),
  created_at timestamptz not null default now()
);

create table public.page_views (
  id bigint generated always as identity primary key,
  path text not null,
  referrer text,
  user_agent text,
  session_id text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_services_status on public.services(status, sort_order);
create index idx_products_active on public.products(is_active, sort_order);
create index idx_products_category on public.products(category_id);
create index idx_orders_status on public.orders(status, created_at desc);
create index idx_orders_customer on public.orders(customer_id);
create index idx_order_items_order on public.order_items(order_id);
create index idx_shipments_order on public.shipments(order_id);
create index idx_activity_logs_created on public.activity_logs(created_at desc);
create index idx_categories_type on public.categories(type, sort_order);
create index idx_page_views_path on public.page_views(path, created_at desc);
create index idx_media_folder on public.media(folder, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.activity_logs enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.packages enable row level security;
alter table public.coupons enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipping_settings enable row level security;
alter table public.shipments enable row level security;
alter table public.media enable row level security;
alter table public.pages enable row level security;
alter table public.site_settings enable row level security;
alter table public.ai_agents enable row level security;
alter table public.leads enable row level security;
alter table public.page_views enable row level security;

-- --- Profiles: everyone can read basic profiles; owner can update own ---
create policy "profiles_read" on public.profiles for select using (true);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);
create policy "profiles_admin_all" on public.profiles for all using (public.is_admin());

-- --- Role permissions: admin only ---
create policy "role_permissions_admin" on public.role_permissions for all using (public.is_admin());

-- --- Activity logs: insert by authenticated, read by admin ---
create policy "logs_insert" on public.activity_logs for insert with check (auth.role() = 'authenticated');
create policy "logs_admin_read" on public.activity_logs for select using (public.is_admin());

-- --- Public catalog: read published, write admin ---
create policy "categories_read" on public.categories for select using (status = 'published' or public.is_admin());
create policy "categories_admin" on public.categories for all using (public.is_admin());
create policy "brands_read" on public.brands for select using (status = 'published' or public.is_admin());
create policy "brands_admin" on public.brands for all using (public.is_admin());
create policy "services_read" on public.services for select using (status = 'published' or public.is_admin());
create policy "services_admin" on public.services for all using (public.is_admin());
create policy "products_read" on public.products for select using (is_active or public.is_admin());
create policy "products_admin" on public.products for all using (public.is_admin());
create policy "variants_read" on public.product_variants for select using (public.is_admin() or exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "variants_admin" on public.product_variants for all using (public.is_admin());
create policy "packages_read" on public.packages for select using (is_visible or public.is_admin());
create policy "packages_admin" on public.packages for all using (public.is_admin());

-- --- Coupons: read by admin; validated server-side via RPC ---
create policy "coupons_admin" on public.coupons for all using (public.is_admin());
create policy "coupons_validate" on public.coupons for select using (public.is_admin());

-- --- Orders: customers read/write their own; admin everything ---
create policy "orders_insert" on public.orders for insert with check (true);  -- guest checkout allowed
create policy "orders_own_read" on public.orders for select using (auth.uid() = user_id or public.is_admin());
create policy "orders_admin_update" on public.orders for update using (public.is_admin());
create policy "orders_admin_delete" on public.orders for delete using (public.is_admin());
create policy "order_items_insert" on public.order_items for insert with check (true);
create policy "order_items_read" on public.order_items for select using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "payments_insert" on public.payments for insert with check (true);
create policy "payments_read" on public.payments for select using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- --- Customers: admin manage; customer sees own row ---
create policy "customers_admin" on public.customers for all using (public.is_admin());
create policy "customers_self_read" on public.customers for select using (user_id = auth.uid());

-- --- Shipping: admin only ---
create policy "shipping_settings_admin" on public.shipping_settings for all using (public.is_admin());
create policy "shipments_admin" on public.shipments for all using (public.is_admin());
create policy "shipments_owner_read" on public.shipments for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);

-- --- Media/CMS/Settings: read public (site needs them), write admin ---
create policy "media_read" on public.media for select using (true);
create policy "media_admin" on public.media for all using (public.is_admin());
create policy "pages_read" on public.pages for select using (status = 'published' or public.is_admin());
create policy "pages_admin" on public.pages for all using (public.is_admin());
create policy "settings_read" on public.site_settings for select using (true);
create policy "settings_admin" on public.site_settings for all using (public.is_admin());
create policy "ai_agents_read" on public.ai_agents for select using (true);
create policy "ai_agents_admin" on public.ai_agents for all using (public.is_admin());

-- --- Leads: anyone can submit; admin reads/updates ---
create policy "leads_insert" on public.leads for insert with check (true);
create policy "leads_admin" on public.leads for all using (public.is_admin());

-- --- Page views: insert public, read admin ---
create policy "views_insert" on public.page_views for insert with check (true);
create policy "views_read" on public.page_views for select using (public.is_admin());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public) values
  ('media', 'media', true),
  ('products', 'products', true)
on conflict (id) do nothing;

create policy "storage_public_read" on storage.objects for select using (bucket_id in ('media','products'));
create policy "storage_admin_write" on storage.objects for insert with check (public.is_admin());
create policy "storage_admin_update" on storage.objects for update using (public.is_admin());
create policy "storage_admin_delete" on storage.objects for delete using (public.is_admin());

-- ============================================================
-- RPC: coupon validation (public-safe, no table exposure)
-- ============================================================
create or replace function public.validate_coupon(p_code text, p_subtotal numeric)
returns table (valid boolean, discount numeric, error text)
language plpgsql security definer set search_path = public as $$
declare
  c public.coupons;
begin
  select * into c from public.coupons where upper(code) = upper(p_code) and is_active limit 1;
  if not found then
    return query select false, 0::numeric, 'INVALID';
    return;
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return query select false, 0::numeric, 'EXPIRED';
    return;
  end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then
    return query select false, 0::numeric, 'MAX_USES';
    return;
  end if;
  if p_subtotal < coalesce(c.min_order_amount, 0) then
    return query select false, 0::numeric, 'MIN_AMOUNT';
    return;
  end if;
  declare
    disc numeric := 0;
  begin
    if c.type = 'percent' then disc := round(p_subtotal * c.value / 100.0, 2);
    elsif c.type = 'fixed' then disc := least(c.value, p_subtotal);
    end if;
    return query select true, disc, null::text;
  end;
end; $$;

-- ============================================================
-- RPC: order tracking by order number (public)
-- ============================================================
create or replace function public.track_order(p_order_number text)
returns table (order_number text, status public.order_status, payment_status public.payment_status, total numeric, created_at timestamptz, shipment_status public.shipment_status, awb_number text, tracking_url text, events jsonb)
language sql security definer set search_path = public stable as $$
  select o.order_number, o.status, o.payment_status, o.total, o.created_at,
         s.status as shipment_status, s.awb_number, s.tracking_url, s.events
  from public.orders o
  left join public.shipments s on s.order_id = o.id
  where upper(o.order_number) = upper(p_order_number)
  limit 1;
$$;

grant execute on function public.track_order(text) to anon, authenticated;
grant execute on function public.validate_coupon(text, numeric) to anon, authenticated;

-- ============================================================
-- SEED: DEFAULT SERVICE CATEGORIES + CATEGORIES
-- ============================================================
insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, icon, sort_order) values
  ('it-solutions', 'service', 'حلول تقنية المعلومات', 'IT Solutions', 'البنية التحتية والشبكات والأمن والصيانة', 'Infrastructure, networks, security and maintenance', '⌘', 1),
  ('digital-services', 'service', 'الخدمات الرقمية', 'Digital Services', 'المواقع والتطبيقات والتسويق الرقمي', 'Websites, apps and digital marketing', '◒', 2),
  ('ai-services', 'service', 'خدمات الذكاء الاصطناعي', 'AI Services', 'الوكلاء الذكيون والأتمتة والتحليلات', 'AI agents, automation and analytics', '✺', 3),
  ('networking-equipment', 'product', 'معدات الشبكات', 'Networking Equipment', 'راوترات وسويتشات ونقاط وصول', 'Routers, switches and access points', '⌁', 1),
  ('cctv-cameras', 'product', 'كاميرات المراقبة', 'CCTV Cameras', 'كاميرات وأنظمة تسجيل', 'Cameras and recording systems', '◉', 2),
  ('computers', 'product', 'أجهزة الكمبيوتر', 'Computers', 'أجهزة مكتبية ومحمولة', 'Desktops and laptops', '▣', 3),
  ('printers', 'product', 'الطابعات', 'Printers', 'طابعات وماسحات ضوئية', 'Printers and scanners', '⚙', 4),
  ('accessories', 'product', 'الملحقات', 'Accessories', 'ملحقات وقطع تقنية', 'Accessories and parts', '✦', 5);

insert into public.shipping_settings (provider, display_name, is_enabled, base_cost) values
  ('smsa', 'سمسا إكسبرس SMSA', false, 25),
  ('spl', 'البريد السعودي سبل', false, 20),
  ('aramex', 'أرامكس Aramex', false, 30),
  ('dhl', 'DHL', false, 45),
  ('custom', 'شحن مخصص', true, 25);


-- TIQNORA SECURITY HARDENING
-- Tiqnora AI security hardening
-- Safe to run after schema.sql and safe to re-run.

-- Do not expose every customer profile to anonymous visitors.
drop policy if exists "profiles_read" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_secure_read" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles_secure_self_update" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Prevent a customer from promoting their own role or reactivating an account.
create or replace function public.protect_profile_security_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.email := old.email;
  end if;
  return new;
end; $$;
drop trigger if exists protect_profile_security_fields on public.profiles;
create trigger protect_profile_security_fields
  before update on public.profiles
  for each row execute function public.protect_profile_security_fields();

-- Never expose AI prompts/configuration or API-key settings through the anon client.
drop policy if exists "ai_agents_read" on public.ai_agents;
drop policy if exists "settings_read" on public.site_settings;
create policy "settings_public_safe_read" on public.site_settings
  for select using (key not in ('ai') or public.is_admin());
update public.site_settings
  set value = value - 'api_keys'
  where key = 'ai';

-- Payment records must be created by a trusted webhook/server or an admin,
-- never directly by an anonymous browser.
drop policy if exists "payments_insert" on public.payments;

-- Guest checkout is a quote request. Force server-controlled security fields.
create or replace function public.sanitize_public_order_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.user_id := auth.uid();
    new.status := 'pending';
    new.payment_status := 'unpaid';
    new.admin_notes := null;
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end; $$;
drop trigger if exists sanitize_public_order_insert on public.orders;
create trigger sanitize_public_order_insert
  before insert on public.orders
  for each row execute function public.sanitize_public_order_insert();

-- Basic data-integrity constraints for browser-submitted carts.
do $$ begin
  alter table public.orders add constraint orders_nonnegative_totals
    check (subtotal >= 0 and discount_amount >= 0 and shipping_cost >= 0 and total >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.order_items add constraint order_items_positive_values
    check (unit_price >= 0 and quantity > 0 and line_total >= 0);
exception when duplicate_object then null; end $$;
