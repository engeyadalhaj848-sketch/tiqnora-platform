-- Tiqnora V6 — Lead Research jobs + candidates (additive, idempotent)
create table if not exists public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  query text not null default '',
  city text,
  industry text,
  target_count int not null default 20,
  source text not null default 'manual',
  status text not null default 'draft',
  filters jsonb not null default '{}'::jsonb,
  discovered_count int not null default 0,
  qualified_count int not null default 0,
  duplicate_count int not null default 0,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_jobs_org on public.research_jobs(organization_id, created_at desc);
create index if not exists idx_research_jobs_status on public.research_jobs(status);

create table if not exists public.research_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  job_id uuid references public.research_jobs(id) on delete cascade,
  lead_id uuid,
  status text not null default 'discovered',
  business_name text,
  industry text,
  city text,
  country text default 'SA',
  website text,
  domain text,
  phone text,
  whatsapp text,
  email text,
  source text,
  source_url text,
  address text,
  rating numeric(4,2),
  reviews_count int,
  description text,
  social_links jsonb not null default '{}'::jsonb,
  opportunity_score numeric(5,2),
  grade text,
  reasons jsonb not null default '[]'::jsonb,
  missing_data jsonb not null default '[]'::jsonb,
  recommended_services jsonb not null default '[]'::jsonb,
  next_best_action text,
  vertical text,
  match_on text,
  payload jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_candidates_job on public.research_candidates(job_id);
create index if not exists idx_research_candidates_org on public.research_candidates(organization_id, status);
create index if not exists idx_research_candidates_phone on public.research_candidates(phone);
create index if not exists idx_research_candidates_domain on public.research_candidates(domain);
