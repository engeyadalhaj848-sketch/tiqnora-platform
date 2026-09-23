-- Deduplicate Telegram webhook deliveries before AI execution.
create table if not exists public.telegram_processed_updates (
  update_id bigint primary key,
  chat_id text,
  received_at timestamptz not null default now()
);

create index if not exists idx_telegram_processed_updates_received
  on public.telegram_processed_updates (received_at desc);

alter table public.telegram_processed_updates enable row level security;
revoke all on table public.telegram_processed_updates from anon, authenticated;
grant all on table public.telegram_processed_updates to service_role;
