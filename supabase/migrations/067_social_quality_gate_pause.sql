-- Tiqnora social quality reset.
-- Freeze organic autopilot until Gold Standard visuals are explicitly approved.
-- This migration is intentionally fail-closed: publishing can only be re-enabled
-- after approved_assets are configured and the owner/manager review gate is satisfied.

update public.organizations
set settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(settings,'{}'::jsonb),
        '{social_autopilot,enabled}',
        'false'::jsonb,
        true
      ),
      '{social_autopilot,quality_gate_mode}',
      '"gold_standard"'::jsonb,
      true
    ),
    '{social_autopilot,require_approved_asset}',
    'true'::jsonb,
    true
  ),
  '{social_autopilot,legacy_placeholder_assets_blocked}',
  'true'::jsonb,
  true
)
where slug='tiqnora';

do $$
begin
  if exists (select 1 from cron.job where jobname='tiqnora-social-autopilot-every-2h') then
    perform cron.unschedule('tiqnora-social-autopilot-every-2h');
  end if;
end $$;
