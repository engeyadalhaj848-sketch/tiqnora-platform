-- TikTok Content Posting support: long-lived OAuth + publish job tracking.

alter table public.social_provider_tokens
  add column if not exists refresh_ciphertext text,
  add column if not exists refresh_iv text,
  add column if not exists refresh_tag text,
  add column if not exists refresh_expires_at timestamptz,
  add column if not exists open_id text;

create table if not exists public.social_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.social_connections(id) on delete set null,
  platform text not null,
  media_type text not null default 'video',
  source_type text not null default 'file_upload',
  file_name text,
  media_url text,
  mime_type text,
  media_size bigint,
  external_publish_id text,
  status text not null default 'initialized',
  error_message text,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_social_publish_jobs_org_created
  on public.social_publish_jobs(organization_id, created_at desc);

create index if not exists idx_social_publish_jobs_external
  on public.social_publish_jobs(platform, external_publish_id);

alter table public.social_publish_jobs enable row level security;

drop policy if exists "social_publish_jobs_admin" on public.social_publish_jobs;
create policy "social_publish_jobs_admin"
  on public.social_publish_jobs
  for all
  using (public.is_admin())
  with check (public.is_admin());
