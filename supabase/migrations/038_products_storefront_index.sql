-- Storefront performance: active products ordered by sort_order
create index if not exists idx_products_active_sort
  on public.products (sort_order asc)
  where is_active = true;

create index if not exists idx_products_slug_active
  on public.products (slug)
  where is_active = true;
