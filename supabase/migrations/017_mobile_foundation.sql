-- ============================================================
-- TIQNORA AI — Mobile Foundation (017)
-- Prepares database for Flutter mobile app (Customer + Admin)
-- Idempotent. Safe to re-run. Does NOT drop data.
-- ============================================================

-- ------------------------------------------------------------
-- 1) device_tokens — FCM / APNs tokens per user device
-- ------------------------------------------------------------
create table if not exists public.device_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  device_type     text not null check (device_type in ('android', 'ios', 'web')),
  token           text not null,
  device_info     jsonb not null default '{}'::jsonb,  -- model, os_version, app_version, etc.
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  last_active     timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists idx_device_tokens_user
  on public.device_tokens (user_id) where is_active = true;

create index if not exists idx_device_tokens_token
  on public.device_tokens (token) where is_active = true;

alter table public.device_tokens enable row level security;

drop policy if exists "device_tokens_own" on public.device_tokens;
create policy "device_tokens_own" on public.device_tokens
  for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- 2) app_versions — Force-update & minimum supported version
-- ------------------------------------------------------------
create table if not exists public.app_versions (
  id                        uuid primary key default gen_random_uuid(),
  platform                  text not null check (platform in ('android', 'ios')),
  version                   text not null,                    -- e.g. 1.0.0
  minimum_supported_version text not null,                    -- force update below this
  force_update              boolean not null default false,
  release_notes_ar          text,
  release_notes_en          text,
  store_url                 text,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  unique (platform, version)
);

alter table public.app_versions enable row level security;

-- Public read (app checks version without auth)
drop policy if exists "app_versions_public_read" on public.app_versions;
create policy "app_versions_public_read" on public.app_versions
  for select using (true);

drop policy if exists "app_versions_admin_write" on public.app_versions;
create policy "app_versions_admin_write" on public.app_versions
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed initial versions (no force update yet)
insert into public.app_versions (platform, version, minimum_supported_version, force_update, release_notes_ar)
values
  ('android', '1.0.0', '1.0.0', false, 'الإصدار الأول لتطبيق Tiqnora AI'),
  ('ios',     '1.0.0', '1.0.0', false, 'الإصدار الأول لتطبيق Tiqnora AI')
on conflict (platform, version) do nothing;

-- ------------------------------------------------------------
-- 3) mobile_sessions — lightweight device login tracking
-- ------------------------------------------------------------
create table if not exists public.mobile_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  device_info   jsonb not null default '{}'::jsonb,   -- device_id, model, os, app_version
  ip_hint       text,                                 -- optional coarse IP / country
  last_login    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_mobile_sessions_user
  on public.mobile_sessions (user_id, last_login desc);

alter table public.mobile_sessions enable row level security;

drop policy if exists "mobile_sessions_own" on public.mobile_sessions;
create policy "mobile_sessions_own" on public.mobile_sessions
  for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- 4) Helper RPCs for mobile
-- ------------------------------------------------------------

-- Register / refresh a device token (upsert)
create or replace function public.register_device_token(
  p_token       text,
  p_device_type text,
  p_device_info jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_device_type not in ('android', 'ios', 'web') then
    raise exception 'invalid device_type';
  end if;

  insert into public.device_tokens (user_id, device_type, token, device_info, last_active, is_active)
  values (auth.uid(), p_device_type, p_token, coalesce(p_device_info, '{}'::jsonb), now(), true)
  on conflict (user_id, token) do update set
    device_type = excluded.device_type,
    device_info = excluded.device_info,
    last_active = now(),
    is_active   = true
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.register_device_token(text, text, jsonb) to authenticated;

-- Record a mobile session login
create or replace function public.record_mobile_session(
  p_device_info jsonb default '{}'::jsonb,
  p_ip_hint     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.mobile_sessions (user_id, device_info, ip_hint, last_login)
  values (auth.uid(), coalesce(p_device_info, '{}'::jsonb), p_ip_hint, now())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_mobile_session(jsonb, text) to authenticated;

-- Get latest app version for a platform (public)
create or replace function public.get_app_version(p_platform text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'platform', platform,
    'version', version,
    'minimum_supported_version', minimum_supported_version,
    'force_update', force_update,
    'release_notes_ar', release_notes_ar,
    'release_notes_en', release_notes_en,
    'store_url', store_url
  )
  from public.app_versions
  where platform = p_platform and is_active = true
  order by created_at desc
  limit 1;
$$;

grant execute on function public.get_app_version(text) to anon, authenticated;

-- Deactivate a device token (logout from device)
create or replace function public.deactivate_device_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.device_tokens
  set is_active = false, last_active = now()
  where user_id = auth.uid() and token = p_token;

  return found;
end;
$$;

grant execute on function public.deactivate_device_token(text) to authenticated;

-- ------------------------------------------------------------
-- 5) Push notification helper (foundation only — no FCM call yet)
--    Inserts into notifications table + can later be picked by a worker
-- ------------------------------------------------------------
create or replace function public.queue_push_notification(
  p_user_id   uuid,
  p_title     text,
  p_body      text default null,
  p_type      text default 'general',
  p_link      text default null,
  p_data      jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notif_id uuid;
  v_org_id   uuid;
begin
  -- Resolve org if possible
  select default_organization_id into v_org_id
  from public.profiles where id = p_user_id;

  insert into public.notifications (
    user_id, organization_id, audience, type, title_ar, body_ar, link, metadata
  ) values (
    p_user_id, v_org_id, 'user', p_type, p_title, p_body, p_link,
    coalesce(p_data, '{}'::jsonb) || jsonb_build_object('push', true, 'queued_at', now())
  )
  returning id into v_notif_id;

  return v_notif_id;
end;
$$;

grant execute on function public.queue_push_notification(uuid, text, text, text, text, jsonb) to authenticated;

-- Admin helper: queue push to all active tokens of a user (metadata only for now)
comment on function public.queue_push_notification is
  'Foundation for mobile push. Inserts notification with push=true flag. Actual FCM/APNs delivery will be added later via worker or Edge Function.';

-- ------------------------------------------------------------
-- 6) Status helper for mobile readiness
-- ------------------------------------------------------------
create or replace function public.mobile_foundation_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'device_tokens_table',   exists (select 1 from information_schema.tables where table_schema='public' and table_name='device_tokens'),
    'app_versions_table',    exists (select 1 from information_schema.tables where table_schema='public' and table_name='app_versions'),
    'mobile_sessions_table', exists (select 1 from information_schema.tables where table_schema='public' and table_name='mobile_sessions'),
    'active_android_version', (select version from public.app_versions where platform='android' and is_active order by created_at desc limit 1),
    'active_ios_version',     (select version from public.app_versions where platform='ios' and is_active order by created_at desc limit 1),
    'device_tokens_count',    (select count(*) from public.device_tokens where is_active),
    'mobile_sessions_count',  (select count(*) from public.mobile_sessions)
  );
$$;

grant execute on function public.mobile_foundation_status() to authenticated;

-- ============================================================
-- End of 017_mobile_foundation.sql
-- ============================================================
