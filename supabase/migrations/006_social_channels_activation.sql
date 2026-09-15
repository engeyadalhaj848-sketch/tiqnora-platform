-- Tiqnora Social Inbox: WhatsApp Cloud + TikTok activation registry.
-- Apply after 005_integrations_registry.sql.

alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider in ('openai','anthropic','google_ai','resend','stripe','whop','smsa','saudi_post','meta','whatsapp','linkedin','tiktok','vapi','retell'));

insert into public.integration_connections (provider, display_name)
values
  ('whatsapp', 'WhatsApp Cloud API')
on conflict (provider) do nothing;

-- A received, verified webhook automatically creates the corresponding active
-- row in social_connections. The existing (organization_id, platform,
-- external_account_id) constraint makes retries safe.
