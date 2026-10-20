-- Keep private WhatsApp threads out of the admin Social Inbox without deleting
-- provider events or affecting conversations in the original WhatsApp app.
-- Mark a conversation with metadata.private_excluded = true to opt it out.
DROP POLICY IF EXISTS social_events_hide_private_whatsapp ON public.social_events;

CREATE POLICY social_events_hide_private_whatsapp
ON public.social_events
AS RESTRICTIVE
FOR SELECT TO authenticated
USING (
  NOT EXISTS (
    SELECT 1
    FROM public.conversations AS private_thread
    WHERE private_thread.organization_id = social_events.organization_id
      AND private_thread.platform = 'whatsapp'
      AND private_thread.metadata @> '{"private_excluded":true}'::jsonb
      AND (
        private_thread.id = social_events.conversation_id
        OR (
          social_events.platform = 'whatsapp'
          AND (
            NULLIF(regexp_replace(COALESCE(social_events.author_external_id,''), '[^0-9]', '', 'g'), '')
              = NULLIF(regexp_replace(COALESCE(private_thread.metadata->>'external_user_id',''), '[^0-9]', '', 'g'), '')
            OR
            NULLIF(regexp_replace(COALESCE(social_events.raw_payload #>> '{message,to}',''), '[^0-9]', '', 'g'), '')
              = NULLIF(regexp_replace(COALESCE(private_thread.metadata->>'external_user_id',''), '[^0-9]', '', 'g'), '')
          )
        )
      )
  )
);
