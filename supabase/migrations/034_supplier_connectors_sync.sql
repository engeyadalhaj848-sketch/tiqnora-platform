-- TIQNORA 034 — Real supplier connectors & inventory sync engine
-- Secrets stay in Vercel env vars only. No auto-purchase / no auto-publish.

-- Connection health per supplier (config refs only)
create table if not exists public.supplier_connections (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.commerce_suppliers(id) on delete cascade,
  provider text not null,
  status text not null default 'not_configured'
    check (status in ('not_configured', 'connected', 'error', 'disabled')),
  env_key_refs jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_test_at timestamptz,
  sync_result jsonb not null default '{}'::jsonb,
  last_error text,
  products_synced int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);

create index if not exists idx_supplier_connections_status on public.supplier_connections(status);

-- Map external supplier SKUs to Tiqnora products
create table if not exists public.supplier_product_mapping (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.commerce_suppliers(id) on delete set null,
  provider text,
  supplier_product_id text not null,
  tiqnora_product_id uuid references public.products(id) on delete set null,
  supplier_price numeric(12,2),
  supplier_stock int,
  shipping_estimate text,
  currency text default 'SAR',
  raw_snapshot jsonb not null default '{}'::jsonb,
  last_checked timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, supplier_product_id)
);

create index if not exists idx_spm_tiqnora on public.supplier_product_mapping(tiqnora_product_id);
create index if not exists idx_spm_provider on public.supplier_product_mapping(provider);

-- Inventory / price change logs (alerts only — no auto price updates)
create table if not exists public.inventory_sync_logs (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  provider text,
  product_id uuid references public.products(id) on delete set null,
  mapping_id uuid references public.supplier_product_mapping(id) on delete set null,
  old_value text,
  new_value text,
  change_type text not null
    check (change_type in ('price', 'stock', 'availability', 'shipping', 'sync', 'connection', 'alert')),
  message text,
  requires_review boolean not null default true,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_sync_created on public.inventory_sync_logs(created_at desc);
create index if not exists idx_inv_sync_review on public.inventory_sync_logs(requires_review, acknowledged);

alter table public.supplier_connections enable row level security;
alter table public.supplier_product_mapping enable row level security;
alter table public.inventory_sync_logs enable row level security;

drop policy if exists "supplier_connections_admin" on public.supplier_connections;
create policy "supplier_connections_admin" on public.supplier_connections
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "supplier_product_mapping_admin" on public.supplier_product_mapping;
create policy "supplier_product_mapping_admin" on public.supplier_product_mapping
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "inventory_sync_logs_admin" on public.inventory_sync_logs;
create policy "inventory_sync_logs_admin" on public.inventory_sync_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed connection rows for known providers (idempotent)
insert into public.supplier_connections (provider, status, env_key_refs)
select v.provider, 'not_configured', v.refs::jsonb
from (values
  ('cj_dropshipping', '{"api_key":"CJ_API_KEY","api_secret":"CJ_API_SECRET"}'),
  ('aliexpress', '{"api_key":"ALIEXPRESS_API_KEY","api_secret":"ALIEXPRESS_API_SECRET"}'),
  ('alibaba', '{"api_key":"ALIBABA_API_KEY","api_secret":"ALIBABA_API_SECRET"}'),
  ('dsers', '{"api_key":"DSERS_API_KEY"}')
) as v(provider, refs)
where not exists (select 1 from public.supplier_connections c where c.provider = v.provider);

comment on table public.supplier_connections is 'Supplier connector status — secrets only in Vercel env';
comment on table public.inventory_sync_logs is 'Price/stock change alerts — never auto-updates customer prices';
