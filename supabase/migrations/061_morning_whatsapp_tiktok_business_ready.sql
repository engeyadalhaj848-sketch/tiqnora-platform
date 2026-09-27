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

update public.integration_connections
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'accounts_api_status','needs_authorization',
      'accounts_api_product','TikTok Accounts API',
      'accounts_api_use_cases',jsonb_build_array('publish','comments','replies','insights'),
      'accounts_api_required_application','TikTok Accounts API Access Application',
      'accounts_api_required_credentials',jsonb_build_array('TIKTOK_BUSINESS_APP_ID','TIKTOK_BUSINESS_APP_SECRET','TIKTOK_BUSINESS_ACCESS_TOKEN','TIKTOK_BUSINESS_ACCOUNT_ID'),
      'accounts_api_status_note','Existing Content Posting API remains connected. Accounts API authorization is additionally required for comment moderation and replies.'
    ),
    last_checked_at=now(),
    updated_at=now()
where provider='tiktok';
