-- Enable TikTok alongside Facebook and Instagram in the owner-authorized two-hour organic social autopilot.

update public.organizations
set settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(settings,'{}'::jsonb),
      '{social_autopilot,platforms}',
      '["facebook","instagram","tiktok"]'::jsonb,
      true
    ),
    '{social_autopilot,target_platforms}',
    '["facebook","instagram","tiktok"]'::jsonb,
    true
  ),
  '{social_autopilot,authorized_scope}',
  '"organic Facebook, Instagram and TikTok every two hours after Chief of Staff approval"'::jsonb,
  true
)
where slug='tiqnora';
