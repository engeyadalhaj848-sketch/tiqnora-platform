-- Tiqnora organic social autopilot: every 2 hours in Asia/Riyadh.
-- Uses the existing Vault secret "tiqnora_social_scheduler_token"; no plaintext token is stored here.

update public.organizations
set settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(settings,'{}'::jsonb),
          '{social_autopilot,mode}',
          '"organic_every_2h"'::jsonb,
          true
        ),
        '{social_autopilot,interval_hours}',
        '2'::jsonb,
        true
      ),
      '{social_autopilot,schedule_utc}',
      '"0 1-23/2 * * *"'::jsonb,
      true
    ),
    '{social_autopilot,schedule_local}',
    '"00:00,02:00,04:00,06:00,08:00,10:00,12:00,14:00,16:00,18:00,20:00,22:00 Asia/Riyadh"'::jsonb,
    true
  ),
  '{social_autopilot,tiktok_accounts_api_status}',
  '"needs_authorization"'::jsonb,
  true
)
where slug='tiqnora';

do $$
begin
  if exists (select 1 from cron.job where jobname='tiqnora-social-autopilot-every-2h') then
    perform cron.unschedule('tiqnora-social-autopilot-every-2h');
  end if;

  perform cron.schedule(
    'tiqnora-social-autopilot-every-2h',
    '0 1-23/2 * * *',
    $cron$
      select net.http_post(
        url := 'https://tiqnora.com/api/reports/telegram?route=social_autopilot_tick',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-tiqnora-scheduler-token',
          (select decrypted_secret from vault.decrypted_secrets where name='tiqnora_social_scheduler_token')
        ),
        body := jsonb_build_object(
          'source','supabase_cron',
          'scheduled_at',now()
        ),
        timeout_milliseconds := 300000
      ) as request_id;
    $cron$
  );
end $$;
