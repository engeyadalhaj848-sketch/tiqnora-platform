-- Activate WhatsApp in the integration registry without changing existing data.
alter table public.integration_connections drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check
  check (provider in ('openai','anthropic','google_ai','resend','stripe','whop','smsa','saudi_post','meta','linkedin','tiktok','whatsapp','vapi','retell'));
insert into public.integration_connections (provider, display_name)
values ('whatsapp', 'WhatsApp Cloud API') on conflict (provider) do nothing;
