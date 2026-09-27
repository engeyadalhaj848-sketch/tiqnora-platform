-- Morning WhatsApp outreach + TikTok Accounts API readiness.

update public.organizations o
set settings = coalesce(o.settings,'{}'::jsonb)
  || jsonb_build_object(
    'whatsapp_outreach',
    jsonb_build_object(
      'enabled', true,
      'timezone', 'Asia/Riyadh',
      'daily_time', '08:00',
      'max_per_day', 10,
      'require_opt_in', true,
      'templates', jsonb_build_array('tiqnora_building_intro_ar','tiqnora_electrical_intro_ar'),
      'authorized_at', now()::text,
      'authorized_scope', 'approved WhatsApp marketing templates to opted-in leads only'
    )
  )
where o.slug='tiqnora';

update public.social_connections
set capabilities = coalesce(capabilities,'{}'::jsonb)
  || jsonb_build_object(
    'direct_post', true,
    'draft_upload', true,
    'comment_moderation', false,
    'accounts_api_required', true
  ),
  settings = coalesce(settings,'{}'::jsonb)
  || jsonb_build_object(
    'accounts_api_status','needs_authorization',
    'accounts_api_use_cases',jsonb_build_array('publish','comments','replies','insights')
  ),
  updated_at=now()
where platform='tiktok' and status='active';

insert into public.integration_connections(
  provider,display_name,enabled,mode,status,metadata,last_checked_at,updated_at
) values (
  'tiktok_business',
  'TikTok API for Business / Accounts API',
  false,
  'production',
  'needs_authorization',
  jsonb_build_object(
    'purpose','Organic publishing, comment moderation/replies, account insights and future business messaging',
    'required_application','TikTok Accounts API Access Application',
    'required_product','Accounts API',
    'required_credentials',jsonb_build_array('TIKTOK_BUSINESS_APP_ID','TIKTOK_BUSINESS_APP_SECRET','TIKTOK_BUSINESS_ACCESS_TOKEN','TIKTOK_BUSINESS_ACCOUNT_ID'),
    'status_note','Existing TikTok Content Posting API remains connected for Direct Post. Accounts API authorization is additionally required for comment moderation.'
  ),
  now(),
  now()
)
on conflict (provider) do update set
  display_name=excluded.display_name,
  status=excluded.status,
  metadata=excluded.metadata,
  last_checked_at=excluded.last_checked_at,
  updated_at=excluded.updated_at;
