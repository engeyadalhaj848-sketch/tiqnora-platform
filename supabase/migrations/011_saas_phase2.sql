-- ============================================================
-- TIQNORA AI — Phase 2 SaaS foundation (idempotent)
-- Customer orgs, subscription plans, usage, service requests
-- ============================================================

-- Plans catalog (SaaS tiers)
create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  price_monthly numeric(12,2) not null default 0,
  price_yearly numeric(12,2) not null default 0,
  currency text not null default 'SAR',
  ai_requests_monthly int not null default 20,
  max_projects int not null default 1,
  max_agents int not null default 1,
  max_team_members int not null default 1,
  features jsonb not null default '[]'::jsonb,
  is_public boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Organization subscription
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id),
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled','expired')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  cancel_at_period_end boolean not null default false,
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

-- Monthly AI usage meter per org
create table if not exists public.usage_meters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_ym text not null, -- YYYY-MM
  ai_requests int not null default 0,
  projects_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, period_ym)
);

-- Customer projects workspace
create table if not exists public.customer_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active','archived','completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Service requests from customers
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in (
    'ai_solutions','digital_marketing','seo','website_development',
    'automation','social_media','it_services','other'
  )),
  title text not null,
  details text,
  status text not null default 'new' check (status in ('new','reviewing','quoted','in_progress','done','canceled')),
  budget_hint numeric(12,2),
  contact_phone text,
  contact_email text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profiles: optional default organization for customer
alter table public.profiles add column if not exists default_organization_id uuid references public.organizations(id) on delete set null;

-- Expand organization_members roles for SaaS tenants
-- existing check may block; drop and recreate carefully
do $$ begin
  alter table public.organization_members drop constraint if exists organization_members_role_check;
exception when undefined_object then null;
end $$;
alter table public.organization_members
  drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner','admin','member','billing'));

-- Seed SaaS plans
insert into public.saas_plans (slug, name_ar, name_en, description_ar, description_en, price_monthly, price_yearly,
  ai_requests_monthly, max_projects, max_agents, max_team_members, features, sort_order)
values
  ('free', 'مجاني', 'Free', 'تجربة محدودة للمنصة', 'Limited trial access',
   0, 0, 20, 1, 1, 1,
   '["basic_ai","service_requests"]'::jsonb, 10),
  ('basic', 'أساسي', 'Basic', 'للأفراد والمشاريع الصغيرة', 'For individuals and small projects',
   149, 1490, 200, 5, 3, 3,
   '["basic_ai","service_requests","projects"]'::jsonb, 20),
  ('professional', 'احترافي', 'Professional', 'لفرق النمو والتسويق', 'For growth and marketing teams',
   499, 4990, 1500, 25, 8, 10,
   '["all_agents","projects","priority_support"]'::jsonb, 30),
  ('enterprise', 'مؤسسات', 'Enterprise', 'حدود مرنة ودعم مخصص', 'Flexible limits and dedicated support',
   1499, 14990, 10000, 200, 50, 100,
   '["all_agents","projects","sla","dedicated"]'::jsonb, 40)
on conflict (slug) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  ai_requests_monthly = excluded.ai_requests_monthly,
  max_projects = excluded.max_projects,
  max_agents = excluded.max_agents,
  max_team_members = excluded.max_team_members,
  features = excluded.features,
  updated_at = now();

-- Ensure Tiqnora org has enterprise subscription (owner platform)
insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, current_period_end)
select o.id, p.id, 'active', 'yearly', now() + interval '1 year'
from public.organizations o
cross join public.saas_plans p
where o.slug = 'tiqnora' and p.slug = 'enterprise'
on conflict (organization_id) do update set
  plan_id = excluded.plan_id,
  status = 'active',
  updated_at = now();

-- Helper: is member of org
create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = org_id and m.user_id = auth.uid()
    );
$$;

-- Helper: current period key
create or replace function public.current_period_ym()
returns text language sql stable as $$
  select to_char(timezone('Asia/Riyadh', now()), 'YYYY-MM');
$$;

-- Increment AI usage (security definer)
create or replace function public.increment_ai_usage(org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_meters (organization_id, period_ym, ai_requests)
  values (org_id, public.current_period_ym(), 1)
  on conflict (organization_id, period_ym)
  do update set ai_requests = public.usage_meters.ai_requests + 1, updated_at = now();
end;
$$;

-- Auto-provision customer organization on first login (optional RPC)
create or replace function public.ensure_customer_organization(org_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  oid uuid;
  free_plan uuid;
  base_slug text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if public.is_admin() then
    select id into oid from public.organizations where slug = 'tiqnora' limit 1;
    return oid;
  end if;
  select default_organization_id into oid from public.profiles where id = uid;
  if oid is not null then return oid; end if;
  select m.organization_id into oid from public.organization_members m where m.user_id = uid limit 1;
  if oid is not null then
    update public.profiles set default_organization_id = oid where id = uid;
    return oid;
  end if;
  base_slug := 'cust-' || substr(replace(uid::text, '-', ''), 1, 12);
  insert into public.organizations (slug, name, status)
  values (base_slug, coalesce(nullif(trim(org_name), ''), 'مساحة العميل'), 'active')
  returning id into oid;
  insert into public.organization_members (organization_id, user_id, role)
  values (oid, uid, 'owner');
  select id into free_plan from public.saas_plans where slug = 'free';
  if free_plan is not null then
    insert into public.subscriptions (organization_id, plan_id, status)
    values (oid, free_plan, 'active')
    on conflict (organization_id) do nothing;
  end if;
  update public.profiles set default_organization_id = oid where id = uid;
  return oid;
end;
$$;

grant execute on function public.ensure_customer_organization(text) to authenticated;
grant execute on function public.increment_ai_usage(uuid) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;

-- RLS
alter table public.saas_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_meters enable row level security;
alter table public.customer_projects enable row level security;
alter table public.service_requests enable row level security;

drop policy if exists "saas_plans_public_read" on public.saas_plans;
create policy "saas_plans_public_read" on public.saas_plans for select
  using (is_public = true or public.is_admin());

drop policy if exists "saas_plans_admin" on public.saas_plans;
create policy "saas_plans_admin" on public.saas_plans for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "subscriptions_member_read" on public.subscriptions;
create policy "subscriptions_member_read" on public.subscriptions for select
  using (public.is_org_member(organization_id));

drop policy if exists "subscriptions_admin" on public.subscriptions;
create policy "subscriptions_admin" on public.subscriptions for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "usage_member_read" on public.usage_meters;
create policy "usage_member_read" on public.usage_meters for select
  using (public.is_org_member(organization_id));

drop policy if exists "usage_admin" on public.usage_meters;
create policy "usage_admin" on public.usage_meters for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "projects_member" on public.customer_projects;
create policy "projects_member" on public.customer_projects for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "service_requests_own" on public.service_requests;
create policy "service_requests_own" on public.service_requests for select
  using (public.is_admin() or user_id = auth.uid());
drop policy if exists "service_requests_insert" on public.service_requests;
create policy "service_requests_insert" on public.service_requests for insert
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "service_requests_admin_upd" on public.service_requests;
create policy "service_requests_admin_upd" on public.service_requests for update
  using (public.is_admin() or user_id = auth.uid());

-- Allow org members to read shared Tiqnora public agents when subscribed (customer AI uses dedicated API)
-- Keep ai_agents admin-only for now; customer chat API uses service role path via server after auth check.

comment on table public.saas_plans is 'Phase 2 SaaS plan catalog';
comment on table public.subscriptions is 'Org-level subscription; billing gateway later';
comment on table public.usage_meters is 'Monthly AI usage counters per organization';
