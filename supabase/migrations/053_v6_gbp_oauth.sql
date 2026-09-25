-- Tiqnora V6 — Google Business Profile OAuth provider registration
-- Extends existing provider constraints without changing token vault behavior.

alter table public.social_provider_tokens
  drop constraint if exists social_provider_tokens_provider_check;

alter table public.social_provider_tokens
  add constraint social_provider_tokens_provider_check
  check (provider = any (array[
    'meta'::text,
    'whatsapp'::text,
    'tiktok'::text,
    'linkedin'::text,
    'google_business_profile'::text
  ]));

alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider = any (array[
    'openai'::text,
    'anthropic'::text,
    'google_ai'::text,
    'resend'::text,
    'stripe'::text,
    'whop'::text,
    'smsa'::text,
    'saudi_post'::text,
    'meta'::text,
    'whatsapp'::text,
    'linkedin'::text,
    'tiktok'::text,
    'vapi'::text,
    'retell'::text,
    'telegram'::text,
    'google_business_profile'::text
  ]));
