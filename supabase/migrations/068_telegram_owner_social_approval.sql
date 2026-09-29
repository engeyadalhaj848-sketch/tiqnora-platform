-- Tiqnora: every social post must be approved by the owner in the Telegram collaboration group.
-- Manager/agent review is quality control only and never grants publish authority.

update public.organizations
set settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(settings,'{}'::jsonb),
      '{social_autopilot,owner_approval_required}',
      'true'::jsonb,
      true
    ),
    '{social_autopilot,approval_channel}',
    '"telegram_group"'::jsonb,
    true
  ),
  '{social_autopilot,manager_auto_publish_after_approval}',
  'false'::jsonb,
  true
)
where slug='tiqnora';

-- Fail closed for any Tiqnora job that somehow remains queued without the owner's Telegram approval.
update public.publishing_queue q
set status='waiting_approval',
    requires_approval=true,
    updated_at=now()
from public.organizations o
where q.organization_id=o.id
  and o.slug='tiqnora'
  and q.status in ('queued','waiting_provider')
  and coalesce(q.metadata->>'owner_approved_via','') <> 'telegram_group';
