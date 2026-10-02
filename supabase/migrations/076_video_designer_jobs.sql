-- Tiqnora Video Designer production jobs + private video storage
-- Internal service-role writes only. All generated media remains approval-gated.

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  video_job_id text not null unique,
  organization_id uuid references public.organizations(id) on delete set null,
  agent_id text not null default 'video-designer',
  campaign_name text,
  provider text,
  model text,
  operation_name text,
  generation_status text not null default 'pending'
    check (generation_status in ('pending','running','processing','succeeded','failed')),
  aspect_ratio text not null default '9:16',
  resolution text not null default '720p',
  duration_seconds int not null default 8 check (duration_seconds in (4,6,8)),
  output_url text,
  output_storage_path text,
  telegram_message_id bigint,
  telegram_chat_id text,
  approval_status text not null default 'pending_approval'
    check (approval_status in ('pending_approval','approved','needs_revision','rejected','failed')),
  error_message text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_jobs_status_idx on public.video_jobs (generation_status, approval_status);
create index if not exists video_jobs_created_idx on public.video_jobs (created_at desc);
create index if not exists video_jobs_org_idx on public.video_jobs (organization_id);

alter table public.video_jobs enable row level security;
revoke all on public.video_jobs from anon, authenticated;
grant select on public.video_jobs to authenticated;

drop policy if exists video_jobs_admin_select on public.video_jobs;
create policy video_jobs_admin_select
  on public.video_jobs
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
        select 1 from public.organization_members m
        where m.user_id = (select auth.uid())
          and m.organization_id = video_jobs.organization_id
      )
    )
  );

comment on table public.video_jobs is
  'Tiqnora Video Designer generation log. Generated videos are draft-only until owner approval.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  false,
  104857600,
  array['video/mp4','video/webm']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
