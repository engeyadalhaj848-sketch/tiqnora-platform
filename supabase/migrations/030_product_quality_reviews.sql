-- TIQNORA 030 — AI Product Quality Review Agent storage
-- Non-destructive. No auto-publish.

create table if not exists public.product_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  score int not null check (score >= 0 and score <= 100),
  status text not null default 'not_ready'
    check (status in ('ready_to_publish', 'needs_minor_review', 'needs_improvement', 'not_ready')),
  issues jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  checks jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewer_label text default 'ai_agent',
  override_publish boolean not null default false,
  override_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pqr_product on public.product_quality_reviews(product_id, reviewed_at desc);
create index if not exists idx_pqr_status on public.product_quality_reviews(status);

alter table public.product_quality_reviews enable row level security;
drop policy if exists "product_quality_reviews_admin" on public.product_quality_reviews;
create policy "product_quality_reviews_admin" on public.product_quality_reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- Latest review pointer on products (optional convenience)
alter table public.products add column if not exists last_review_score int;
alter table public.products add column if not exists last_review_status text;
alter table public.products add column if not exists last_reviewed_at timestamptz;

comment on table public.product_quality_reviews is 'AI/admin quality reviews before publish; score <75 blocks publish unless override';
