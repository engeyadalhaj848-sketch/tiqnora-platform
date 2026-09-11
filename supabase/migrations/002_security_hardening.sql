-- Tiqnora AI security hardening
-- Safe to run after schema.sql and safe to re-run.

-- Do not expose every customer profile to anonymous visitors.
drop policy if exists "profiles_read" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_secure_read" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles_secure_self_update" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Prevent a customer from promoting their own role or reactivating an account.
create or replace function public.protect_profile_security_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.email := old.email;
  end if;
  return new;
end; $$;
drop trigger if exists protect_profile_security_fields on public.profiles;
create trigger protect_profile_security_fields
  before update on public.profiles
  for each row execute function public.protect_profile_security_fields();

-- Never expose AI prompts/configuration or API-key settings through the anon client.
drop policy if exists "ai_agents_read" on public.ai_agents;
drop policy if exists "settings_read" on public.site_settings;
create policy "settings_public_safe_read" on public.site_settings
  for select using (key not in ('ai') or public.is_admin());
update public.site_settings
  set value = value - 'api_keys'
  where key = 'ai';

-- Payment records must be created by a trusted webhook/server or an admin,
-- never directly by an anonymous browser.
drop policy if exists "payments_insert" on public.payments;

-- Guest checkout is a quote request. Force server-controlled security fields.
create or replace function public.sanitize_public_order_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.user_id := auth.uid();
    new.status := 'pending';
    new.payment_status := 'unpaid';
    new.admin_notes := null;
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end; $$;
drop trigger if exists sanitize_public_order_insert on public.orders;
create trigger sanitize_public_order_insert
  before insert on public.orders
  for each row execute function public.sanitize_public_order_insert();

-- Basic data-integrity constraints for browser-submitted carts.
do $$ begin
  alter table public.orders add constraint orders_nonnegative_totals
    check (subtotal >= 0 and discount_amount >= 0 and shipping_cost >= 0 and total >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.order_items add constraint order_items_positive_values
    check (unit_price >= 0 and quantity > 0 and line_total >= 0);
exception when duplicate_object then null; end $$;
