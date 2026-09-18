-- TIQNORA 033 — Dynamic pricing + supplier comparison reports
-- Non-destructive. No auto price change / no auto order / no auto publish.

create table if not exists public.product_price_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  cost_price numeric(12,2),
  shipping_cost numeric(12,2),
  vat_amount numeric(12,2),
  recommended_price numeric(12,2),
  minimum_price numeric(12,2),
  expected_profit numeric(12,2),
  profit_margin numeric(8,2),
  pricing_strategy text,
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  agent text default 'tiqnora_dynamic_pricing_agent'
);

create index if not exists idx_ppr_product on public.product_price_reports(product_id, created_at desc);

create table if not exists public.supplier_comparison_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  suppliers jsonb not null default '[]'::jsonb,
  recommended_supplier text,
  comparison_score int,
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  agent text default 'tiqnora_supplier_comparison_agent'
);

create index if not exists idx_scr_product on public.supplier_comparison_reports(product_id, created_at desc);
create index if not exists idx_scr_created on public.supplier_comparison_reports(created_at desc);

alter table public.product_price_reports enable row level security;
alter table public.supplier_comparison_reports enable row level security;
drop policy if exists "product_price_reports_admin" on public.product_price_reports;
create policy "product_price_reports_admin" on public.product_price_reports
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "supplier_comparison_reports_admin" on public.supplier_comparison_reports;
create policy "supplier_comparison_reports_admin" on public.supplier_comparison_reports
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.product_price_reports is 'AI pricing recommendations — no automatic price updates';
comment on table public.supplier_comparison_reports is 'AI supplier comparison — no automatic purchasing';
