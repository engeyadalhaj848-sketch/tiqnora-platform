-- TIQNORA — Supplier integration layer (architecture only, no auto-purchase)
-- Extends 009_commerce_ai_dropshipping.sql
-- API secrets stay in Vercel env vars; DB stores references only.

-- Allow CJ Dropshipping + research providers on commerce_suppliers
alter table public.commerce_suppliers drop constraint if exists commerce_suppliers_provider_check;
alter table public.commerce_suppliers add constraint commerce_suppliers_provider_check
  check (provider in (
    'aliexpress', 'alibaba', 'cj_dropshipping', 'amazon', 'dsers', 'manual', 'other'
  ));

-- Seed missing providers (idempotent)
insert into public.commerce_suppliers (provider, display_name, status, fulfillment_mode, metadata)
select v.provider, v.display_name, 'not_configured', 'approval_required', v.metadata::jsonb
from (values
  ('cj_dropshipping', 'CJ Dropshipping', '{"setup":"Official CJ API keys in Vercel env CJ_API_KEY","docs":"https://developers.cjdropshipping.com"}'),
  ('amazon', 'Amazon Product Research', '{"setup":"Research only — no auto listing. PA-API credentials in env if used","mode":"research_only"}')
) as v(provider, display_name, metadata)
where not exists (
  select 1 from public.commerce_suppliers s where s.provider = v.provider
);

-- supplier_accounts: account metadata + env key refs (never raw secrets)
create table if not exists public.supplier_accounts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.commerce_suppliers(id) on delete cascade,
  account_label text not null default 'default',
  status text not null default 'inactive'
    check (status in ('inactive', 'active', 'error', 'revoked')),
  -- Names of environment variables only — values never stored in DB
  api_key_env text,
  api_secret_env text,
  access_token_env text,
  webhook_secret_env text,
  config jsonb not null default '{}'::jsonb,
  last_health_check_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, account_label)
);

-- product_import_queue: staging before publish (admin approval required)
create table if not exists public.product_import_queue (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.commerce_suppliers(id) on delete set null,
  supplier_product_id uuid references public.supplier_products(id) on delete set null,
  external_product_id text,
  source_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  proposed_name_ar text,
  proposed_name_en text,
  proposed_description_ar text,
  proposed_price numeric(12,2),
  proposed_cost numeric(12,2),
  proposed_images text[] default '{}',
  seo_title_ar text,
  seo_keywords_ar text,
  profit_margin_pct numeric(6,2),
  ai_research jsonb not null default '{}'::jsonb,
  status text not null default 'pending_review'
    check (status in (
      'pending_review', 'needs_edits', 'approved', 'published', 'rejected', 'cancelled'
    )),
  review_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  published_product_id uuid references public.products(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- supplier_sync_logs
create table if not exists public.supplier_sync_logs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.commerce_suppliers(id) on delete set null,
  account_id uuid references public.supplier_accounts(id) on delete set null,
  sync_type text not null default 'manual'
    check (sync_type in ('manual', 'catalog', 'stock', 'order', 'tracking', 'health')),
  status text not null default 'started'
    check (status in ('started', 'success', 'partial', 'failed')),
  items_total int not null default 0,
  items_ok int not null default 0,
  items_failed int not null default 0,
  message text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null
);

-- supplier_orders: preparation after admin approval (no auto submit)
create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  fulfillment_request_id uuid references public.fulfillment_requests(id) on delete set null,
  order_id uuid not null references public.orders(id) on delete cascade,
  supplier_id uuid references public.commerce_suppliers(id) on delete set null,
  account_id uuid references public.supplier_accounts(id) on delete set null,
  status text not null default 'draft'
    check (status in (
      'draft', 'ready', 'submitted', 'confirmed', 'shipped', 'delivered', 'cancelled', 'failed'
    )),
  external_order_id text,
  tracking_number text,
  tracking_url text,
  shipping_carrier text,
  line_items jsonb not null default '[]'::jsonb,
  cost_total numeric(12,2),
  currency text not null default 'USD',
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  notes text,
  prepared_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- commerce audit (admin actions)
create table if not exists public.commerce_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_import_queue_status on public.product_import_queue(status, created_at desc);
create index if not exists idx_supplier_sync_logs_supplier on public.supplier_sync_logs(supplier_id, started_at desc);
create index if not exists idx_supplier_orders_status on public.supplier_orders(status, created_at desc);
create index if not exists idx_supplier_orders_order on public.supplier_orders(order_id);
create index if not exists idx_commerce_audit_created on public.commerce_audit_logs(created_at desc);

alter table public.supplier_accounts enable row level security;
alter table public.product_import_queue enable row level security;
alter table public.supplier_sync_logs enable row level security;
alter table public.supplier_orders enable row level security;
alter table public.commerce_audit_logs enable row level security;

drop policy if exists "supplier accounts admin" on public.supplier_accounts;
create policy "supplier accounts admin" on public.supplier_accounts
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "product import queue admin" on public.product_import_queue;
create policy "product import queue admin" on public.product_import_queue
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "supplier sync logs admin" on public.supplier_sync_logs;
create policy "supplier sync logs admin" on public.supplier_sync_logs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "supplier orders admin" on public.supplier_orders;
create policy "supplier orders admin" on public.supplier_orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "commerce audit admin" on public.commerce_audit_logs;
create policy "commerce audit admin" on public.commerce_audit_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- Helper: when dropship order item needs fulfillment, admin creates supplier_order after approval
-- No automatic external API calls from database triggers.

comment on table public.supplier_accounts is 'Supplier account config; secrets live in env vars referenced by *_env columns';
comment on table public.product_import_queue is 'Imported/research products await admin approval before publish';
comment on table public.supplier_orders is 'Supplier-side order prep after fulfillment approval; submit is manual/semi until official API wired';
