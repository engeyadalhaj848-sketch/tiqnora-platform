-- TIQNORA 032 — Product market intelligence reports
-- Non-destructive. No auto-publish / no auto-purchase.

create table if not exists public.product_market_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  demand_score int,
  competition_score int,
  seo_score int,
  supplier_score int,
  suggested_price numeric(12,2),
  estimated_profit numeric(12,2),
  profit_margin numeric(8,2),
  keywords jsonb not null default '[]'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  ai_decision text not null default 'REVIEW_FIRST'
    check (ai_decision in ('ADD_PRODUCT', 'REVIEW_FIRST', 'NOT_RECOMMENDED')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  agent text default 'tiqnora_market_intelligence_agent'
);

create index if not exists idx_pmr_decision on public.product_market_reports(ai_decision, created_at desc);
create index if not exists idx_pmr_product on public.product_market_reports(product_id);
create index if not exists idx_pmr_name on public.product_market_reports(product_name);

alter table public.product_market_reports enable row level security;
drop policy if exists "product_market_reports_admin" on public.product_market_reports;
create policy "product_market_reports_admin" on public.product_market_reports
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.product_market_reports is 'Market intelligence before import/publish — admin decision required';
