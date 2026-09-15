-- OAuth token vault. Values are encrypted by the server with SOCIAL_TOKEN_ENCRYPTION_KEY.
create table if not exists public.social_provider_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('meta','whatsapp','tiktok','linkedin')),
  ciphertext text not null,
  iv text not null,
  tag text not null,
  scopes text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);
alter table public.social_provider_tokens enable row level security;
drop policy if exists "social token vault denied" on public.social_provider_tokens;
create policy "social token vault denied" on public.social_provider_tokens for all using (false) with check (false);
