-- Image Designer production jobs log
-- Run in Supabase SQL Editor. Safe / additive.

create table if not exists public.image_jobs (
  id uuid primary key default gen_random_uuid(),
  image_job_id text not null unique,
  organization_id uuid,
  agent_id text not null default 'image-designer',
  campaign_name text,
  platform text,
  format_key text,
  width int,
  height int,
  provider text,
  model text,
  prompt_version text,
  generation_status text not null default 'pending',
  output_url text,
  output_storage_path text,
  telegram_message_id bigint,
  telegram_chat_id text,
  approval_status text not null default 'pending_approval',
  revision_count int not null default 0,
  quality_gate jsonb default '{}'::jsonb,
  art_direction jsonb default '{}'::jsonb,
  error_message text,
  error_code text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists image_jobs_status_idx on public.image_jobs (generation_status, approval_status);
create index if not exists image_jobs_created_idx on public.image_jobs (created_at desc);
create index if not exists image_jobs_org_idx on public.image_jobs (organization_id);

comment on table public.image_jobs is 'Tiqnora Image Designer production log — never auto-publish social.';
