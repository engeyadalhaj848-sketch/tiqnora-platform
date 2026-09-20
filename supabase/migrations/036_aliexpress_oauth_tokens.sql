-- TIQNORA 036 — AliExpress OAuth token storage on supplier_connections
-- Tokens are server-side only. Public/anon must never read these columns via RLS.
-- Secrets (APP_KEY / APP_SECRET) stay in Vercel env — never in this table.

alter table public.supplier_connections
  add column if not exists account_id text,
  add column if not exists seller_id text,
  add column if not exists user_id text,
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists expires_at timestamptz,
  add column if not exists refresh_expires_at timestamptz,
  add column if not exists oauth_meta jsonb not null default '{}'::jsonb;

comment on column public.supplier_connections.access_token is 'OAuth access token — service role / admin only; never expose to anon';
comment on column public.supplier_connections.refresh_token is 'OAuth refresh token — service role / admin only';

-- Ensure aliexpress row exists with correct env key refs (no secret values)
insert into public.supplier_connections (provider, status, env_key_refs)
select 'aliexpress', 'not_configured',
  '{"app_key":"ALIEXPRESS_APP_KEY","app_secret":"ALIEXPRESS_APP_SECRET","redirect_uri":"ALIEXPRESS_REDIRECT_URI"}'::jsonb
where not exists (select 1 from public.supplier_connections c where c.provider = 'aliexpress');

update public.supplier_connections
set env_key_refs = coalesce(env_key_refs, '{}'::jsonb) ||
  '{"app_key":"ALIEXPRESS_APP_KEY","app_secret":"ALIEXPRESS_APP_SECRET","redirect_uri":"ALIEXPRESS_REDIRECT_URI"}'::jsonb,
  updated_at = now()
where provider = 'aliexpress';
