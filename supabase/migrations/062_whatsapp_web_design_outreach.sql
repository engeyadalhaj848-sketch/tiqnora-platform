-- Enable the website-design WhatsApp campaign while preserving opt-in gating.
update public.organizations o
set settings = coalesce(o.settings,'{}'::jsonb)
  || jsonb_build_object(
    'whatsapp_outreach',
    coalesce(o.settings->'whatsapp_outreach','{}'::jsonb)
      || jsonb_build_object(
        'enabled', true,
        'timezone', 'Asia/Riyadh',
        'daily_time', '08:00',
        'max_per_day', 10,
        'require_opt_in', true,
        'campaign', 'web_design',
        'templates', jsonb_build_array('tiqnora_web_design_intro_ar'),
        'message_goal', 'Explain the value of a professional website and invite the lead to request a sector-specific concept.'
      )
  ),
  updated_at = now()
where o.slug='tiqnora';
