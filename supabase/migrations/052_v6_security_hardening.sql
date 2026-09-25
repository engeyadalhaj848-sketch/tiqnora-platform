-- Tiqnora V6 — Security hardening follow-up
-- Keeps intentional public RPCs public, narrows privileged SECURITY DEFINER RPCs,
-- and makes internal Telegram tables explicitly deny client roles.

-- 1) Trigger-only function: never callable directly through PostgREST.
revoke execute on function public.trg_social_event_notify_admins() from public, anon, authenticated;

-- 2) Authenticated-only privileged RPCs.
-- Revoke inherited PUBLIC/anon access, then preserve the intended authenticated surface.
revoke execute on function public.admin_change_subscription_plan(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_change_subscription_plan(uuid, text, text) to authenticated;

revoke execute on function public.deactivate_device_token(text) from public, anon, authenticated;
grant execute on function public.deactivate_device_token(text) to authenticated;

revoke execute on function public.ensure_customer_organization(text) from public, anon, authenticated;
grant execute on function public.ensure_customer_organization(text) to authenticated;

revoke execute on function public.increment_ai_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_ai_usage(uuid) to authenticated;

revoke execute on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.is_org_member(uuid) from public, anon, authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;

revoke execute on function public.mobile_foundation_status() from public, anon, authenticated;
grant execute on function public.mobile_foundation_status() to authenticated;

revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_user(uuid, uuid, text, text, text, text, text) to authenticated;

revoke execute on function public.queue_push_notification(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.queue_push_notification(uuid, text, text, text, text, jsonb) to authenticated;

revoke execute on function public.record_mobile_session(jsonb, text) from public, anon, authenticated;
grant execute on function public.record_mobile_session(jsonb, text) to authenticated;

revoke execute on function public.register_device_token(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.register_device_token(text, text, jsonb) to authenticated;

revoke execute on function public.request_plan_change(text, text) from public, anon, authenticated;
grant execute on function public.request_plan_change(text, text) to authenticated;

-- 3) Internal Telegram tables are service-role only.
-- Keep RLS enabled and add explicit deny policies for client roles so intent is auditable.
drop policy if exists telegram_bot_sessions_client_deny on public.telegram_bot_sessions;
create policy telegram_bot_sessions_client_deny
  on public.telegram_bot_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists telegram_processed_updates_client_deny on public.telegram_processed_updates;
create policy telegram_processed_updates_client_deny
  on public.telegram_processed_updates
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.telegram_bot_sessions from anon, authenticated;
revoke all on public.telegram_processed_updates from anon, authenticated;

-- Intentional public SECURITY DEFINER RPCs left unchanged:
-- public.get_app_version(text)
-- public.track_order(text)
-- public.validate_coupon(text, numeric)
