-- TIQNORA 031 — Product verification reports (section scores)
-- Non-destructive. No auto-publish.

create table if not exists public.product_verification_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  overall_score int not null check (overall_score >= 0 and overall_score <= 100),
  image_score int,
  content_score int,
  specification_score int,
  seo_score int,
  business_score int,
  issues jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  status text not null default 'BLOCKED'
    check (status in ('READY_TO_PUBLISH', 'MINOR_FIXES', 'NEEDS_IMPROVEMENT', 'BLOCKED')),
  checks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  agent text default 'tiqnora_product_verification_agent'
);

create index if not exists idx_pvr_product on public.product_verification_reports(product_id, created_at desc);
create index if not exists idx_pvr_status on public.product_verification_reports(status);
create index if not exists idx_pvr_score on public.product_verification_reports(overall_score);

alter table public.product_verification_reports enable row level security;
drop policy if exists "product_verification_reports_admin" on public.product_verification_reports;
create policy "product_verification_reports_admin" on public.product_verification_reports
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.products add column if not exists last_verification_score int;
alter table public.products add column if not exists last_verification_status text;

comment on table public.product_verification_reports is 'AI product verification section scores before publish';
