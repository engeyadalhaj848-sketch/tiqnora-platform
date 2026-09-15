-- TIQNORA COMMERCE AI — approved dropshipping foundation
-- Run after 008_social_oauth_tokens.sql.
-- Supplier credentials stay in Vercel Environment Variables; this database stores no secrets.

create table if not exists public.commerce_suppliers (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('aliexpress', 'alibaba', 'amazon', 'dsers', 'manual')),
  display_name text not null,
  status text not null default 'not_configured' check (status in ('not_configured', 'pending', 'connected', 'paused', 'error')),
  fulfillment_mode text not null default 'approval_required' check (fulfillment_mode in ('approval_required', 'semi_automatic', 'automatic')),
  shipping_countries text[] not null default array['SA'],
  currency text not null default 'SAR',
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider)
);

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.commerce_suppliers(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  external_product_id text not null,
  source_url text not null,
  source_title text,
  source_price numeric(12,2),
  source_currency text not null default 'USD',
  shipping_cost numeric(12,2) not null default 0,
  estimated_delivery_min_days int,
  estimated_delivery_max_days int,
  supplier_rating numeric(3,2),
  availability_status text not null default 'unknown' check (availability_status in ('available', 'out_of_stock', 'unknown', 'discontinued')),
  approval_status text not null default 'candidate' check (approval_status in ('candidate', 'approved', 'rejected', 'paused')),
  review_notes text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(supplier_id, external_product_id)
);

create table if not exists public.fulfillment_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  supplier_id uuid references public.commerce_suppliers(id) on delete set null,
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval', 'approved', 'submitted', 'fulfilled', 'failed', 'cancelled')),
  supplier_order_reference text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  submitted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, supplier_id)
);

alter table public.products add column if not exists fulfillment_type text not null default 'own_stock'
  check (fulfillment_type in ('own_stock', 'dropship'));
alter table public.products add column if not exists delivery_note_ar text;
alter table public.products add column if not exists delivery_note_en text;

create index if not exists idx_supplier_products_product on public.supplier_products(product_id);
create index if not exists idx_supplier_products_approval on public.supplier_products(approval_status, availability_status);
create index if not exists idx_fulfillment_requests_status on public.fulfillment_requests(status, created_at desc);

alter table public.commerce_suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.fulfillment_requests enable row level security;

create policy "commerce suppliers admin" on public.commerce_suppliers for all using (public.is_admin()) with check (public.is_admin());
create policy "supplier products admin" on public.supplier_products for all using (public.is_admin()) with check (public.is_admin());
create policy "fulfillment requests admin" on public.fulfillment_requests for all using (public.is_admin()) with check (public.is_admin());

insert into public.commerce_suppliers (provider, display_name, fulfillment_mode, metadata) values
  ('aliexpress', 'AliExpress', 'approval_required', '{"setup":"Official/API or approved fulfillment partner required"}'),
  ('alibaba', 'Alibaba.com', 'approval_required', '{"setup":"Supplier agreement and official integration required"}'),
  ('amazon', 'Amazon', 'approval_required', '{"setup":"Selling Partner API is for an authorized seller account"}'),
  ('dsers', 'DSers', 'approval_required', '{"setup":"Recommended initial fulfillment bridge for AliExpress"}')
on conflict (provider) do nothing;

-- A fifth specialist for the existing internal workforce. It can analyse and draft;
-- it cannot place supplier orders by itself. Those always begin as awaiting_approval.
insert into public.ai_agents (
  organization_id, slug, name, name_ar, name_en, department, description, description_ar, description_en,
  system_prompt, provider, model, temperature, status, is_enabled, api_ready, config
)
select o.id, 'commerce', 'Commerce AI Manager', 'مدير التجارة الذكي', 'Commerce AI Manager', 'commerce',
  'Dropshipping product research, supplier comparison, pricing, and approval-safe fulfillment support.',
  'مدير التجارة بدون مخزون: يبحث عن المنتجات، يقارن الموردين، يحسب التسعير ويجهّز الطلبات للموافقة.',
  'Dropshipping commerce manager for product research, supplier comparison, pricing, and approval-safe fulfillment.',
  'You are Tiqnora AI''s Commerce AI Manager for Saudi Arabia. Research and compare products and suppliers, calculate a transparent SAR price with shipping, payment fees, tax and margin assumptions, and draft Arabic/English catalog content. Never claim live supplier data unless the user supplied it. Never purchase, submit a supplier order, change a public price, or publish a product. Mark all recommendations as candidates pending owner approval. Warn about prohibited/restricted products, delivery uncertainty, returns, and customer disclosure.',
  'google_ai', 'gemini-2.5-flash', 0.35, 'active', true, true,
  '{"capabilities":["product_research","supplier_comparison","pricing","catalog_draft","fulfillment_review"],"requires_owner_approval":true}'::jsonb
from public.organizations o where o.slug = 'tiqnora'
on conflict (organization_id, slug) do update set
  name = excluded.name, name_ar = excluded.name_ar, name_en = excluded.name_en, department = excluded.department,
  description = excluded.description, description_ar = excluded.description_ar, description_en = excluded.description_en,
  system_prompt = excluded.system_prompt, config = excluded.config, status = 'active', is_enabled = true, updated_at = now();
