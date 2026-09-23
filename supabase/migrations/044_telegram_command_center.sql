-- Telegram Command Center for Tiqnora AI
-- Private owner-only bot control plane + daily reports.

alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider = any (array[
    'openai'::text,
    'anthropic'::text,
    'google_ai'::text,
    'resend'::text,
    'stripe'::text,
    'whop'::text,
    'smsa'::text,
    'saudi_post'::text,
    'meta'::text,
    'whatsapp'::text,
    'linkedin'::text,
    'tiktok'::text,
    'vapi'::text,
    'retell'::text,
    'telegram'::text
  ]));

insert into public.integration_connections
  (provider, display_name, enabled, mode, status, metadata, updated_at)
values
  (
    'telegram',
    'Telegram Command Center',
    false,
    'production',
    'not_configured',
    '{"purpose":"owner_command_center","daily_reports":true}'::jsonb,
    now()
  )
on conflict (provider) do update
set display_name = excluded.display_name,
    metadata = coalesce(public.integration_connections.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

create table if not exists public.telegram_bot_sessions (
  chat_id text primary key,
  telegram_user_id text,
  username text,
  first_name text,
  default_agent_slug text not null default 'auto',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_bot_sessions_default_agent_slug_check
    check (char_length(default_agent_slug) between 1 and 80)
);

create index if not exists idx_telegram_bot_sessions_last_message
  on public.telegram_bot_sessions (last_message_at desc);

alter table public.telegram_bot_sessions enable row level security;

revoke all on table public.telegram_bot_sessions from anon, authenticated;
grant all on table public.telegram_bot_sessions to service_role;
