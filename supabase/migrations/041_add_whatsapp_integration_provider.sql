-- Add WhatsApp Cloud as a first-class integration provider.

alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider = any (array[
    'openai'::text,'anthropic'::text,'google_ai'::text,'resend'::text,'stripe'::text,
    'whop'::text,'smsa'::text,'saudi_post'::text,'meta'::text,'whatsapp'::text,
    'linkedin'::text,'tiktok'::text,'vapi'::text,'retell'::text
  ]));

insert into public.integration_connections (provider,display_name,enabled,mode,status,metadata)
values ('whatsapp','WhatsApp Cloud',false,'production','not_configured','{}'::jsonb)
on conflict (provider) do update
set display_name=excluded.display_name,
    mode='production',
    updated_at=now();
