-- Tiqnora V6 — Brand Brain + Social AI Studio (additive, idempotent)
-- No destructive changes. Org-scoped. RLS enabled. No anon write.

-- Brand profiles (flexible jsonb for guidelines)
create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'Tiqnora AI',
  is_default boolean not null default false,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_brand_profiles_org on public.brand_profiles(organization_id);
create unique index if not exists idx_brand_profiles_org_default
  on public.brand_profiles(organization_id) where is_default = true;

-- Marketing campaigns
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  name text not null,
  objective text not null default 'awareness',
  status text not null default 'draft',
  target_audience text,
  industry text,
  location text,
  platforms text[] not null default '{}',
  offer text,
  cta text,
  campaign_brief text,
  start_date date,
  end_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_marketing_campaigns_org on public.marketing_campaigns(organization_id, created_at desc);
create index if not exists idx_marketing_campaigns_status on public.marketing_campaigns(status);

-- Content items (ideas → drafts → scheduled)
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  status text not null default 'idea',
  content_type text not null default 'social_post',
  title text,
  hook text,
  body text,
  cta text,
  hashtags text[] not null default '{}',
  keywords text[] not null default '{}',
  language text not null default 'ar',
  tone text,
  platform text,
  funnel_stage text,
  angle text,
  reason text,
  recommended_asset text,
  creative_brief jsonb not null default '{}'::jsonb,
  brand_validation jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  published_at timestamptz,
  parent_content_id uuid,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_content_items_org on public.content_items(organization_id, status, created_at desc);
create index if not exists idx_content_items_campaign on public.content_items(campaign_id);
create index if not exists idx_content_items_scheduled on public.content_items(scheduled_at) where scheduled_at is not null;

-- Platform variants of a content item
create table if not exists public.content_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  platform text not null,
  headline text,
  hook text,
  body text,
  cta text,
  hashtags text[] not null default '{}',
  caption_limit int,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, platform)
);
create index if not exists idx_content_variants_content on public.content_variants(content_id);

-- Publishing queue
create table if not exists public.publishing_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_id uuid references public.content_items(id) on delete cascade,
  variant_id uuid references public.content_variants(id) on delete set null,
  platform text not null,
  status text not null default 'queued',
  scheduled_at timestamptz,
  attempts int not null default 0,
  external_id text,
  published_at timestamptz,
  error_code text,
  error_message text,
  requires_approval boolean not null default true,
  action_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_publishing_queue_org on public.publishing_queue(organization_id, status, scheduled_at);

-- Optional metrics (null when unknown — never invent)
create table if not exists public.content_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_id uuid references public.content_items(id) on delete cascade,
  platform text,
  impressions bigint,
  reach bigint,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  leads bigint,
  conversions bigint,
  captured_at timestamptz not null default now(),
  source text default 'manual',
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_content_metrics_content on public.content_metrics(content_id, captured_at desc);

-- RLS
alter table public.brand_profiles enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.content_items enable row level security;
alter table public.content_variants enable row level security;
alter table public.publishing_queue enable row level security;
alter table public.content_metrics enable row level security;

-- Admin-oriented policies (authenticated members of org) — service_role bypasses RLS
do $$ begin
  if not exists (select 1 from pg_policies where tablename='brand_profiles' and policyname='brand_profiles_org_access') then
    create policy brand_profiles_org_access on public.brand_profiles
      for all using (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      ) with check (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      );
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='marketing_campaigns' and policyname='marketing_campaigns_org_access') then
    create policy marketing_campaigns_org_access on public.marketing_campaigns
      for all using (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      ) with check (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      );
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='content_items' and policyname='content_items_org_access') then
    create policy content_items_org_access on public.content_items
      for all using (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      ) with check (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      );
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='content_variants' and policyname='content_variants_org_access') then
    create policy content_variants_org_access on public.content_variants
      for all using (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      ) with check (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      );
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='publishing_queue' and policyname='publishing_queue_org_access') then
    create policy publishing_queue_org_access on public.publishing_queue
      for all using (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      ) with check (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      );
  end if;
exception when others then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='content_metrics' and policyname='content_metrics_org_access') then
    create policy content_metrics_org_access on public.content_metrics
      for all using (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      ) with check (
        organization_id in (select organization_id from public.profiles where id = auth.uid())
      );
  end if;
exception when others then null;
end $$;

grant select, insert, update, delete on public.brand_profiles to authenticated;
grant select, insert, update, delete on public.marketing_campaigns to authenticated;
grant select, insert, update, delete on public.content_items to authenticated;
grant select, insert, update, delete on public.content_variants to authenticated;
grant select, insert, update, delete on public.publishing_queue to authenticated;
grant select, insert, update, delete on public.content_metrics to authenticated;
