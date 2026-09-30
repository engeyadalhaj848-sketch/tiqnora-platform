-- Tiqnora Image Designer production jobs + private design storage
-- Additive and production-safe. Internal jobs are written with the server-side service role.

create table if not exists public.image_jobs (
  id uuid primary key default gen_random_uuid(),
  image_job_id text not null unique,
  organization_id uuid references public.organizations(id) on delete set null,
  agent_id text not null default 'image-designer',
  campaign_name text,
  platform text,
  format_key text,
  width int,
  height int,
  provider text,
  model text,
  prompt_version text,
  generation_status text not null default 'pending'
    check (generation_status in ('pending','running','succeeded','failed','failed_quality')),
  output_url text,
  output_storage_path text,
  telegram_message_id bigint,
  telegram_chat_id text,
  approval_status text not null default 'pending_approval'
    check (approval_status in ('pending_approval','approved','needs_revision','rejected','failed')),
  revision_count int not null default 0 check (revision_count >= 0),
  quality_gate jsonb not null default '{}'::jsonb,
  art_direction jsonb not null default '{}'::jsonb,
  error_message text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists image_jobs_status_idx
  on public.image_jobs (generation_status, approval_status);
create index if not exists image_jobs_created_idx
  on public.image_jobs (created_at desc);
create index if not exists image_jobs_org_idx
  on public.image_jobs (organization_id);

alter table public.image_jobs enable row level security;

revoke all on public.image_jobs from anon, authenticated;
grant select on public.image_jobs to authenticated;

drop policy if exists image_jobs_admin_select on public.image_jobs;
create policy image_jobs_admin_select
  on public.image_jobs
  for select
  to authenticated
  using (
    (select public.is_admin())
    and (
      organization_id = (
        select p.default_organization_id
        from public.profiles p
        where p.id = (select auth.uid())
      )
      or exists (
        select 1
        from public.organization_members m
        where m.user_id = (select auth.uid())
          and m.organization_id = image_jobs.organization_id
      )
    )
  );

comment on table public.image_jobs is
  'Tiqnora Image Designer production log. Internal service-role writes; owner approval required before publishing.';

-- Keep unapproved creative previews private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'designs',
  'designs',
  false,
  10485760,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
