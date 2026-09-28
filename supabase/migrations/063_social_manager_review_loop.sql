-- Tiqnora: Chief of Staff review gate for organic social autopilot.
-- Owner-authorized scope: organic Facebook + Instagram only.
update public.organizations
set settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(settings, '{}'::jsonb),
      '{social_autopilot,manager_review_enabled}',
      'true'::jsonb,
      true
    ),
    '{social_autopilot,manager_revision_limit}',
    '2'::jsonb,
    true
  ),
  '{social_autopilot,manager_auto_publish_after_approval}',
  'true'::jsonb,
  true
)
where slug = 'tiqnora';
