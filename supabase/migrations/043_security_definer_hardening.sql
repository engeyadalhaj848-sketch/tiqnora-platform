-- ============================================================
-- 043: SECURITY DEFINER audit hardening (no bulk REVOKE)
-- - Trigger-only: revoke direct EXECUTE from anon/authenticated
-- - Harden risky RPCs with explicit auth checks
-- - Keep intentional public RPCs callable
-- ============================================================

-- ------------------------------------------------------------
-- A) TRIGGER-ONLY: prevent direct RPC invocation
-- ------------------------------------------------------------
do $$
declare
  fn text;
  trigger_fns text[] := array[
    'handle_new_user',
    'protect_profile_security_fields',
    'sanitize_public_order_insert',
    'trg_service_request_notify',
    'trg_subscription_event_notify',
    'trg_lead_welcome'
  ];
begin
  foreach fn in array trigger_fns loop
    begin
      execute format('revoke execute on function public.%I from public, anon, authenticated', fn);
    exception when undefined_function then
      null;
    when others then
      -- Signature-specific fallbacks handled below
      null;
    end;
  end loop;
end $$;

-- Explicit signature-safe revokes (trigger functions take no args)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_security_fields() from public, anon, authenticated;
revoke execute on function public.sanitize_public_order_insert() from public, anon, authenticated;
revoke execute on function public.trg_service_request_notify() from public, anon, authenticated;
revoke execute on function public.trg_subscription_event_notify() from public, anon, authenticated;
revoke execute on function public.trg_lead_welcome() from public, anon, authenticated;

-- ------------------------------------------------------------
-- B) Harden increment_ai_usage — require org membership or admin
-- ------------------------------------------------------------
create or replace function public.increment_ai_usage(org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_org_member(org_id) then
    raise exception 'not authorized for organization';
  end if;
  insert into public.usage_meters (organization_id, period_ym, ai_requests)
  values (org_id, public.current_period_ym(), 1)
  on conflict (organization_id, period_ym)
  do update set ai_requests = public.usage_meters.ai_requests + 1, updated_at = now();
end;
$$;

-- ------------------------------------------------------------
-- C) Harden notify_user — admin or self only
-- ------------------------------------------------------------
create or replace function public.notify_user(
  p_user_id uuid,
  p_org_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_audience text default 'user'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not (public.is_admin() or auth.uid() = p_user_id) then
    raise exception 'not authorized to notify user';
  end if;
  insert into public.notifications (user_id, organization_id, audience, type, title_ar, body_ar, link)
  values (p_user_id, p_org_id, coalesce(p_audience, 'user'), p_type, p_title, p_body, p_link)
  returning id into nid;
  return nid;
end;
$$;

-- ------------------------------------------------------------
-- D) Harden queue_push_notification — admin or self only
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
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not (public.is_admin() or auth.uid() = p_user_id) then
    raise exception 'not authorized to queue push';
  end if;

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

-- ------------------------------------------------------------
-- E) mobile_foundation_status — admin only (was exposing counts)
-- ------------------------------------------------------------
create or replace function public.mobile_foundation_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  return jsonb_build_object(
    'device_tokens_table',   exists (select 1 from information_schema.tables where table_schema='public' and table_name='device_tokens'),
    'app_versions_table',    exists (select 1 from information_schema.tables where table_schema='public' and table_name='app_versions'),
    'mobile_sessions_table', exists (select 1 from information_schema.tables where table_schema='public' and table_name='mobile_sessions'),
    'active_android_version', (select version from public.app_versions where platform='android' and is_active order by created_at desc limit 1),
    'active_ios_version',     (select version from public.app_versions where platform='ios' and is_active order by created_at desc limit 1),
    'device_tokens_count',    (select count(*) from public.device_tokens where is_active),
    'mobile_sessions_count',  (select count(*) from public.mobile_sessions)
  );
end;
$$;

-- Intentionally unchanged (public / authenticated product RPCs):
--   track_order, validate_coupon, get_app_version
--   is_admin, is_org_member (RLS helpers)
--   ensure_customer_organization, request_plan_change (auth.uid checks)
--   admin_change_subscription_plan (is_admin check)
--   phase1_status (is_admin check)
--   register_device_token, record_mobile_session, deactivate_device_token (auth.uid)
--   current_period_ym (pure helper)
