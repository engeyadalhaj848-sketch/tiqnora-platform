-- TIQNORA 029 — Product media manager + quality score
-- Non-destructive. No auto-publish.

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  image_type text not null default 'gallery'
    check (image_type in ('main', 'gallery', 'detail', 'lifestyle')),
  sort_order int not null default 0,
  source text not null default 'admin'
    check (source in ('admin', 'manufacturer', 'supplier', 'placeholder', 'import')),
  approval_status text not null default 'pending_review'
    check (approval_status in ('approved', 'pending_review', 'rejected')),
  alt_ar text,
  alt_en text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_images_product on public.product_images(product_id, sort_order);
create index if not exists idx_product_images_status on public.product_images(approval_status);

alter table public.product_images enable row level security;
drop policy if exists "product_images_admin" on public.product_images;
create policy "product_images_admin" on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());
-- Public can read approved images for storefront if needed via products.images array

-- Product quality + media meta on products (safe add)
alter table public.products add column if not exists quality_score int;
alter table public.products add column if not exists quality_notes jsonb default '{}'::jsonb;
alter table public.products add column if not exists image_source text;
alter table public.products add column if not exists media_status text default 'unknown';
-- media_status: unknown | needs_images | pending_review | ready

comment on table public.product_images is 'PIM product media — approval required before treating as official';
comment on column public.products.quality_score is 'AI/admin product quality 0-100; null = not scored';
