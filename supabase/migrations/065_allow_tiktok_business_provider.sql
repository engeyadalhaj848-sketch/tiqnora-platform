-- Allow TikTok for Business Accounts API tokens alongside TikTok Content Posting tokens.

alter table public.social_provider_tokens
  drop constraint if exists social_provider_tokens_provider_check;

alter table public.social_provider_tokens
  add constraint social_provider_tokens_provider_check
  check (provider = any (array[
    'meta'::text,
    'whatsapp'::text,
    'tiktok'::text,
    'tiktok_business'::text,
    'linkedin'::text,
    'google_business_profile'::text
  ]));
