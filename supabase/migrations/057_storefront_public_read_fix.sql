-- ============================================================
-- 057: Storefront public read fix (hardened)
-- Fixes storefront 401/404 without exposing is_admin() to anon.
-- Safe to re-run.
-- ============================================================

-- Keep admin checks private to authenticated users.
revoke execute on function public.is_admin() from anon;

alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;

-- Remove legacy policies whose PUBLIC role forces anon to evaluate is_admin().
drop policy if exists "products_admin" on public.products;
drop policy if exists "products_read" on public.products;
drop policy if exists "products_public_read" on public.products;
drop policy if exists "products_authenticated_read" on public.products;

create policy "products_public_read" on public.products
  for select
  to anon
  using (is_active is true);

create policy "products_authenticated_read" on public.products
  for select
  to authenticated
  using (is_active is true or public.is_admin());

create policy "products_admin" on public.products
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "categories_admin" on public.categories;
drop policy if exists "categories_read" on public.categories;
drop policy if exists "categories_public_read" on public.categories;
drop policy if exists "categories_authenticated_read" on public.categories;

create policy "categories_public_read" on public.categories
  for select
  to anon
  using (status = 'published'::public.content_status);

create policy "categories_authenticated_read" on public.categories
  for select
  to authenticated
  using (status = 'published'::public.content_status or public.is_admin());

create policy "categories_admin" on public.categories
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "brands_admin" on public.brands;
drop policy if exists "brands_read" on public.brands;
drop policy if exists "brands_public_read" on public.brands;
drop policy if exists "brands_authenticated_read" on public.brands;

create policy "brands_public_read" on public.brands
  for select
  to anon
  using (status = 'published'::public.content_status);

create policy "brands_authenticated_read" on public.brands
  for select
  to authenticated
  using (status = 'published'::public.content_status or public.is_admin());

create policy "brands_admin" on public.brands
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Public storefront RPC runs with caller privileges, so RLS remains enforced.
create or replace function public.get_storefront_products(
  p_limit int default 24,
  p_offset int default 0,
  p_cat text default null,
  p_brand text default null,
  p_q text default null
)
returns jsonb
language plpgsql
stable
security invoker
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
      or coalesce(p.name_en, '') ilike '%' || q || '%'
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
        or coalesce(p.name_en, '') ilike '%' || q || '%'
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

revoke all on function public.get_storefront_products(int, int, text, text, text) from public;
grant execute on function public.get_storefront_products(int, int, text, text, text) to anon, authenticated;

comment on function public.get_storefront_products is
  'Storefront catalog RPC. SECURITY INVOKER; RLS remains enforced.';
