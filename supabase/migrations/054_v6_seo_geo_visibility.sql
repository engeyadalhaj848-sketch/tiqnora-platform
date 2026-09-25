-- Tiqnora V6 — SEO + GEO / AI Visibility (additive)
-- Org-scoped, RLS, least privilege.

create table if not exists public.seo_entity_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_name text not null default 'Tiqnora AI',
  canonical_domain text not null default 'https://www.tiqnora.com',
  profile jsonb not null default '{}'::jsonb,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_seo_entity_profiles_org on public.seo_entity_profiles(organization_id);

create table if not exists public.seo_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'queued',
  pages_checked int not null default 0,
  issues_found int not null default 0,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_seo_audits_org on public.seo_audits(organization_id, created_at desc);

create table if not exists public.seo_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  audit_id uuid references public.seo_audits(id) on delete set null,
  url text not null,
  path text not null,
  status_code int,
  title text,
  description text,
  canonical text,
  robots text,
  h1 text,
  indexable boolean,
  metadata jsonb not null default '{}'::jsonb,
  last_audited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, path)
);
create index if not exists idx_seo_pages_org on public.seo_pages(organization_id, indexable);

create table if not exists public.seo_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  audit_id uuid references public.seo_audits(id) on delete cascade,
  page_path text,
  severity text not null default 'medium',
  code text not null,
  problem text not null,
  why_it_matters text,
  recommended_fix text,
  auto_fix_supported boolean not null default false,
  approval_required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_seo_issues_org on public.seo_issues(organization_id, severity);

create table if not exists public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  keyword text not null,
  intent text,
  category text,
  location text,
  target_page text,
  status text not null default 'mapped',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, keyword)
);
create index if not exists idx_seo_keywords_org on public.seo_keywords(organization_id);

create table if not exists public.seo_content_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  primary_topic text,
  search_intent text,
  target_audience text,
  local_context text,
  outline jsonb not null default '[]'::jsonb,
  status text not null default 'idea',
  requires_approval boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_seo_opportunities_org on public.seo_content_opportunities(organization_id, status);

alter table public.seo_entity_profiles enable row level security;
alter table public.seo_audits enable row level security;
alter table public.seo_pages enable row level security;
alter table public.seo_issues enable row level security;
alter table public.seo_keywords enable row level security;
alter table public.seo_content_opportunities enable row level security;

-- helper expression reused in policies
-- org membership via default_organization_id OR organization_members

drop policy if exists seo_entity_profiles_org on public.seo_entity_profiles;
create policy seo_entity_profiles_org on public.seo_entity_profiles for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_entity_profiles.organization_id)
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_entity_profiles.organization_id)
  );

drop policy if exists seo_audits_org on public.seo_audits;
create policy seo_audits_org on public.seo_audits for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_audits.organization_id)
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_audits.organization_id)
  );

drop policy if exists seo_pages_org on public.seo_pages;
create policy seo_pages_org on public.seo_pages for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_pages.organization_id)
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_pages.organization_id)
  );

drop policy if exists seo_issues_org on public.seo_issues;
create policy seo_issues_org on public.seo_issues for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_issues.organization_id)
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_issues.organization_id)
  );

drop policy if exists seo_keywords_org on public.seo_keywords;
create policy seo_keywords_org on public.seo_keywords for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_keywords.organization_id)
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_keywords.organization_id)
  );

drop policy if exists seo_content_opportunities_org on public.seo_content_opportunities;
create policy seo_content_opportunities_org on public.seo_content_opportunities for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_content_opportunities.organization_id)
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.organization_id = seo_content_opportunities.organization_id)
  );

revoke all on public.seo_entity_profiles from authenticated;
revoke all on public.seo_audits from authenticated;
revoke all on public.seo_pages from authenticated;
revoke all on public.seo_issues from authenticated;
revoke all on public.seo_keywords from authenticated;
revoke all on public.seo_content_opportunities from authenticated;

grant select, insert, update on public.seo_entity_profiles to authenticated;
grant select, insert, update on public.seo_audits to authenticated;
grant select, insert, update on public.seo_pages to authenticated;
grant select, insert, update on public.seo_issues to authenticated;
grant select, insert, update on public.seo_keywords to authenticated;
grant select, insert, update on public.seo_content_opportunities to authenticated;
