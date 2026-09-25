-- Tiqnora V6 — Reputation Management + Google Business Profile
-- Additive / idempotent. RLS enabled. No anon access.

create table if not exists public.reputation_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'google_business_profile',
  external_account_id text,
  external_location_id text not null,
  name text,
  title text,
  address text,
  phone text,
  website text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_location_id)
);
create index if not exists idx_reputation_locations_org on public.reputation_locations(organization_id, provider);

create table if not exists public.reputation_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.reputation_locations(id) on delete cascade,
  provider text not null default 'google_business_profile',
  external_review_id text not null,
  rating int,
  comment text,
  reviewer_display_name text,
  created_at_external timestamptz,
  updated_at_external timestamptz,
  existing_reply text,
  existing_reply_updated_at timestamptz,
  reply_status text not null default 'unanswered',
  sentiment text,
  topics jsonb not null default '[]'::jsonb,
  priority text not null default 'normal',
  analysis jsonb not null default '{}'::jsonb,
  sync_status text not null default 'synced',
  payload_minimal jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_review_id)
);
create index if not exists idx_reputation_reviews_org on public.reputation_reviews(organization_id, reply_status, created_at_external desc);
create index if not exists idx_reputation_reviews_location on public.reputation_reviews(location_id);
create index if not exists idx_reputation_reviews_priority on public.reputation_reviews(priority);

create table if not exists public.reputation_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  review_id uuid not null references public.reputation_reviews(id) on delete cascade,
  draft_reply text not null,
  language text not null default 'ar',
  tone text,
  reasoning_summary text,
  warnings jsonb not null default '[]'::jsonb,
  brand_validation jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  action_id uuid,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  external_reply text,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reputation_reply_drafts_review on public.reputation_reply_drafts(review_id, status);

create table if not exists public.reputation_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'google_business_profile',
  location_id uuid references public.reputation_locations(id) on delete set null,
  status text not null default 'queued',
  reviews_fetched int not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_reputation_sync_jobs_org on public.reputation_sync_jobs(organization_id, created_at desc);

alter table public.reputation_locations enable row level security;
alter table public.reputation_reviews enable row level security;
alter table public.reputation_reply_drafts enable row level security;
alter table public.reputation_sync_jobs enable row level security;

-- Org scope via default_organization_id OR organization_members
drop policy if exists reputation_locations_org_access on public.reputation_locations;
create policy reputation_locations_org_access on public.reputation_locations
  for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid() and m.organization_id = reputation_locations.organization_id
    )
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid() and m.organization_id = reputation_locations.organization_id
    )
  );

drop policy if exists reputation_reviews_org_access on public.reputation_reviews;
create policy reputation_reviews_org_access on public.reputation_reviews
  for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid() and m.organization_id = reputation_reviews.organization_id
    )
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid() and m.organization_id = reputation_reviews.organization_id
    )
  );

drop policy if exists reputation_reply_drafts_org_access on public.reputation_reply_drafts;
create policy reputation_reply_drafts_org_access on public.reputation_reply_drafts
  for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid() and m.organization_id = reputation_reply_drafts.organization_id
    )
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid() and m.organization_id = reputation_reply_drafts.organization_id
    )
  );

drop policy if exists reputation_sync_jobs_org_access on public.reputation_sync_jobs;
create policy reputation_sync_jobs_org_access on public.reputation_sync_jobs
  for all
  using (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid() and m.organization_id = reputation_sync_jobs.organization_id
    )
  )
  with check (
    organization_id = (select p.default_organization_id from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.organization_members m
      where m.user_id = auth.uid() and m.organization_id = reputation_sync_jobs.organization_id
    )
  );

grant select, insert, update on public.reputation_locations to authenticated;
grant select, insert, update on public.reputation_reviews to authenticated;
grant select, insert, update on public.reputation_reply_drafts to authenticated;
grant select, insert, update on public.reputation_sync_jobs to authenticated;
