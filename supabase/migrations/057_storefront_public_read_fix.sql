-- ============================================================
-- 057: Storefront public read fix
-- Root cause: anon SELECT on products fails with
--   "permission denied for function is_admin"
-- because RLS policies call is_admin() while EXECUTE was not
-- granted to anon / authenticated.
-- Also ensures active products/categories/brands are readable.
-- Safe to re-run.
-- ============================================================

-- 1) Allow policy evaluation to call is_admin() without error
do $$
begin
  grant execute on function public.is_admin() to anon, authenticated;
exception
  when undefined_function then null;
  when others then
    begin
      execute 'grant execute on function public.is_admin() to anon, authenticated';
    exception when others then null;
    end;
end $$;

-- 2) Public SELECT for active products
alter table public.products enable row level security;

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select
  to anon, authenticated
  using (is_active is true);

-- 3) Categories / brands for shop filters and card embeds
alter table public.categories enable row level security;
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select
  to anon, authenticated
  using (true);

alter table public.brands enable row level security;
drop policy if exists "brands_public_read" on public.brands;
create policy "brands_public_read" on public.brands
  for select
  to anon, authenticated
  using (true);

-- 4) SECURITY DEFINER RPC
create or replace function public.get_storefront_products(
  p_limit int default 24,
  p_offset int default 0,
  p_cat text default null,
  p_brand text default null,
  p_q text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int := least(greatest(coalesce(p_limit, 24), 1), 48);
  off int := greatest(coalesce(p_offset, 0), 0);
  q text := nullif(trim(both from coalesce(p_q, '')), '');
  total_count int;
  items jsonb;
begin
  select count(*)::int into total_count
  from public.products p
  left join public.categories c on c.id = p.category_id
  left join public.brands b on b.id = p.brand_id
  where p.is_active is true
    and (p_cat is null or p_cat = '' or c.slug = p_cat)
    and (p_brand is null or p_brand = '' or b.slug = p_brand)
    and (
      q is null
      or p.name_ar ilike '%' || q || '%'
      or p.name_en ilike '%' || q || '%'
      or coalesce(p.sku, '') ilike '%' || q || '%'
    );

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb) into items
  from (
    select
      p.id, p.slug, p.sku, p.name_ar, p.name_en, p.price, p.discount_percent,
      p.stock_quantity, p.track_stock, p.images, p.is_active, p.featured, p.sort_order,
      case when c.id is null then null else jsonb_build_object('slug', c.slug, 'name_ar', c.name_ar) end as categories,
      case when b.id is null then null else jsonb_build_object('slug', b.slug, 'name', b.name) end as brands
    from public.products p
    left join public.categories c on c.id = p.category_id
    left join public.brands b on b.id = p.brand_id
    where p.is_active is true
      and (p_cat is null or p_cat = '' or c.slug = p_cat)
      and (p_brand is null or p_brand = '' or b.slug = p_brand)
      and (
        q is null
        or p.name_ar ilike '%' || q || '%'
        or p.name_en ilike '%' || q || '%'
        or coalesce(p.sku, '') ilike '%' || q || '%'
      )
    order by p.sort_order asc nulls last, p.created_at desc nulls last
    limit lim offset off
  ) x;

  return jsonb_build_object(
    'items', items,
    'total', total_count,
    'hasMore', (off + lim) < total_count
  );
end;
$$;

grant execute on function public.get_storefront_products(int, int, text, text, text) to anon, authenticated;
