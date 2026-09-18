-- TIQNORA 035 — CJ Dropshipping connector + safe product import workflow
-- No auto-purchase. No auto-publish. Imports land in product_import_queue (pending_review).
-- Draft products are created with is_active = false only.

-- Ensure CJ connection row exists (from 034 seed; idempotent)
insert into public.supplier_connections (provider, status, env_key_refs)
select 'cj_dropshipping', 'not_configured', '{"api_key":"CJ_API_KEY","api_secret":"CJ_API_SECRET"}'::jsonb
where not exists (
  select 1 from public.supplier_connections c where c.provider = 'cj_dropshipping'
);

-- Ensure CJ supplier catalog row
insert into public.commerce_suppliers (
  provider, display_name, status, fulfillment_mode, supplier_type, country, category,
  shipping_method, delivery_time_min_days, delivery_time_max_days, payment_terms, commission_pct, notes
)
select
  'cj_dropshipping', 'CJ Dropshipping', 'not_configured', 'approval_required',
  'international', 'CN', 'dropship', 'cj_fulfillment', 7, 18, 'cj_wallet', 0,
  'Official CJ API — keys only in Vercel env CJ_API_KEY. Import requires admin approval.'
where not exists (
  select 1 from public.commerce_suppliers s where s.display_name = 'CJ Dropshipping'
);

-- Optional helper columns on import queue (safe if already present via jsonb)
alter table public.product_import_queue
  add column if not exists ai_score numeric(5,2),
  add column if not exists ai_recommendation text,
  add column if not exists import_source text default 'manual';

comment on column public.product_import_queue.ai_score is 'Composite AI score 0-100 after import pipeline';
comment on column public.product_import_queue.ai_recommendation is 'PUBLISH_READY | REVIEW_FIRST | NEEDS_WORK';
comment on column public.product_import_queue.import_source is 'cj | aliexpress | manual | scout';

-- Index for admin queue filters
create index if not exists idx_product_import_queue_source
  on public.product_import_queue (import_source, status, created_at desc);

comment on table public.supplier_connections is
  'Supplier connector health — Phase 034/035. Secrets only in Vercel env.';
