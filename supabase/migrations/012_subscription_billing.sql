-- ============================================================
-- TIQNORA AI — Phase 2.3 Subscription & Billing Architecture
-- Extends 011 without breaking existing saas_plans/subscriptions
-- ============================================================

-- Optional plan limit rows (normalized view of limits; plans still store primary limits)
create table if not exists public.plan_feature_limits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.saas_plans(id) on delete cascade,
  feature text not null check (feature in (
    'ai_requests','max_agents','max_projects','max_team_members',
    'service_requests','storage_mb'
  )),
  limit_value int not null default 0,
  unique (plan_id, feature)
);

-- Subscription lifecycle events
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'created','upgraded','downgraded','canceled','renewed','reactivated',
    'plan_changed','trial_started','payment_pending','payment_failed','payment_succeeded'
  )),
  from_plan_id uuid references public.saas_plans(id) on delete set null,
  to_plan_id uuid references public.saas_plans(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Billing history (invoices / payment attempts) — gateway-agnostic
create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid references public.saas_plans(id) on delete set null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'SAR',
  status text not null default 'draft' check (status in (
    'draft','pending','paid','failed','void','refunded'
  )),
  billing_period text check (billing_period in ('monthly','yearly')),
  provider text, -- stripe | hyperpay | tap | mada | manual
  provider_ref text,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Payment provider registry (config only — no live charges)
create table if not exists public.payment_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('stripe','hyperpay','tap','mada','manual')),
  display_name text not null,
  enabled boolean not null default false,
  mode text not null default 'sandbox' check (mode in ('sandbox','live')),
  config jsonb not null default '{}'::jsonb, -- non-secret flags only; secrets stay in Vercel env
  updated_at timestamptz not null default now()
);

insert into public.payment_providers (slug, display_name, enabled, mode, config) values
  ('manual', 'Manual / Admin', true, 'sandbox', '{"note":"Owner changes plan from Admin"}'::jsonb),
  ('stripe', 'Stripe', false, 'sandbox', '{"ready":true}'::jsonb),
  ('hyperpay', 'HyperPay', false, 'sandbox', '{"ready":true,"region":"SA"}'::jsonb),
  ('tap', 'Tap Payments', false, 'sandbox', '{"ready":true}'::jsonb),
  ('mada', 'Mada', false, 'sandbox', '{"ready":true,"via":"hyperpay_or_tap"}'::jsonb)
on conflict (slug) do nothing;

-- Seed feature limits from existing saas_plans
insert into public.plan_feature_limits (plan_id, feature, limit_value)
select p.id, f.feature, f.val
from public.saas_plans p
cross join lateral (values
  ('ai_requests', p.ai_requests_monthly),
  ('max_agents', p.max_agents),
  ('max_projects', p.max_projects),
  ('max_team_members', p.max_team_members),
  ('service_requests', case when p.slug = 'free' then 5 when p.slug = 'basic' then 30 when p.slug = 'professional' then 100 else 1000 end),
  ('storage_mb', case when p.slug = 'free' then 100 when p.slug = 'basic' then 1024 when p.slug = 'professional' then 10240 else 102400 end)
) as f(feature, val)
on conflict (plan_id, feature) do update set limit_value = excluded.limit_value;

-- Add storage + service request counters to usage_meters
alter table public.usage_meters add column if not exists service_requests int not null default 0;
alter table public.usage_meters add column if not exists storage_mb_used int not null default 0;

-- Admin/manual plan change (no payment)
create or replace function public.admin_change_subscription_plan(
  p_organization_id uuid,
  p_plan_slug text,
  p_note text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.subscriptions;
  old_plan uuid;
  new_plan uuid;
  old_price numeric;
  new_price numeric;
  ev text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  select id, price_monthly into new_plan, new_price from public.saas_plans where slug = p_plan_slug;
  if new_plan is null then raise exception 'unknown plan'; end if;

  select * into sub from public.subscriptions where organization_id = p_organization_id for update;
  if not found then
    insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
    values (p_organization_id, new_plan, 'active', 'monthly', now(), now() + interval '30 days')
    returning * into sub;
    insert into public.subscription_events (subscription_id, organization_id, actor_user_id, event_type, to_plan_id, note)
    values (sub.id, p_organization_id, auth.uid(), 'created', new_plan, coalesce(p_note, 'Created by admin'));
    return sub;
  end if;

  old_plan := sub.plan_id;
  select price_monthly into old_price from public.saas_plans where id = old_plan;
  if old_plan = new_plan then
    return sub;
  end if;
  if coalesce(new_price,0) > coalesce(old_price,0) then ev := 'upgraded';
  elsif coalesce(new_price,0) < coalesce(old_price,0) then ev := 'downgraded';
  else ev := 'plan_changed'; end if;

  update public.subscriptions
  set plan_id = new_plan,
      status = 'active',
      updated_at = now(),
      current_period_start = case when ev = 'upgraded' then now() else current_period_start end,
      current_period_end = case when ev = 'upgraded' then now() + interval '30 days' else current_period_end end
  where id = sub.id
  returning * into sub;

  insert into public.subscription_events (subscription_id, organization_id, actor_user_id, event_type, from_plan_id, to_plan_id, note, metadata)
  values (sub.id, p_organization_id, auth.uid(), ev, old_plan, new_plan, p_note,
    jsonb_build_object('source','admin','provider','manual'));
  return sub;
end;
$$;

grant execute on function public.admin_change_subscription_plan(uuid, text, text) to authenticated;

-- Customer requests upgrade (creates pending invoice + event; no charge)
create or replace function public.request_plan_change(
  p_plan_slug text,
  p_billing_cycle text default 'monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  oid uuid;
  sub public.subscriptions;
  new_plan public.saas_plans;
  amount numeric;
  inv public.billing_invoices;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  oid := public.ensure_customer_organization(null);
  select * into new_plan from public.saas_plans where slug = p_plan_slug and is_public = true;
  if not found then raise exception 'plan not available'; end if;
  select * into sub from public.subscriptions where organization_id = oid for update;
  if not found then raise exception 'no subscription'; end if;
  if sub.plan_id = new_plan.id then
    return jsonb_build_object('ok', true, 'status', 'unchanged');
  end if;
  amount := case when p_billing_cycle = 'yearly' then new_plan.price_yearly else new_plan.price_monthly end;
  insert into public.billing_invoices (organization_id, subscription_id, plan_id, amount, currency, status, billing_period, provider, metadata)
  values (oid, sub.id, new_plan.id, amount, new_plan.currency, case when amount = 0 then 'paid' else 'pending' end,
    coalesce(p_billing_cycle,'monthly'), 'manual',
    jsonb_build_object('requested_by', auth.uid(), 'from_plan', sub.plan_id))
  returning * into inv;

  insert into public.subscription_events (subscription_id, organization_id, actor_user_id, event_type, from_plan_id, to_plan_id, note, metadata)
  values (sub.id, oid, auth.uid(), 'payment_pending', sub.plan_id, new_plan.id, 'Customer requested plan change',
    jsonb_build_object('invoice_id', inv.id, 'amount', amount));

  -- Free plan apply immediately
  if amount = 0 then
    perform public.admin_change_subscription_plan(oid, p_plan_slug, 'Self-serve free plan');
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', inv.id, 'status', inv.status, 'amount', amount, 'provider_ready', false,
    'message', case when amount = 0 then 'Plan applied' else 'Upgrade request recorded — payment gateway not enabled yet' end);
end;
$$;

grant execute on function public.request_plan_change(text, text) to authenticated;

-- RLS
alter table public.plan_feature_limits enable row level security;
alter table public.subscription_events enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.payment_providers enable row level security;

drop policy if exists "plan_limits_read" on public.plan_feature_limits;
create policy "plan_limits_read" on public.plan_feature_limits for select using (true);
drop policy if exists "plan_limits_admin" on public.plan_feature_limits;
create policy "plan_limits_admin" on public.plan_feature_limits for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sub_events_member" on public.subscription_events;
create policy "sub_events_member" on public.subscription_events for select
  using (public.is_admin() or public.is_org_member(organization_id));
drop policy if exists "sub_events_admin" on public.subscription_events;
create policy "sub_events_admin" on public.subscription_events for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invoices_member" on public.billing_invoices;
create policy "invoices_member" on public.billing_invoices for select
  using (public.is_admin() or public.is_org_member(organization_id));
drop policy if exists "invoices_admin" on public.billing_invoices;
create policy "invoices_admin" on public.billing_invoices for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pay_providers_read" on public.payment_providers;
create policy "pay_providers_read" on public.payment_providers for select using (public.is_admin() or enabled);
drop policy if exists "pay_providers_admin" on public.payment_providers;
create policy "pay_providers_admin" on public.payment_providers for all using (public.is_admin()) with check (public.is_admin());

-- Allow admin full CRUD on saas_plans already exists from 011
