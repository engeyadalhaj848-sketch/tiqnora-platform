-- Persist WhatsApp Business app echoes without treating them as inbound sales.
-- Invoker rights preserve existing RLS; no client-callable privileged RPC.
CREATE OR REPLACE FUNCTION public.sync_whatsapp_app_echo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  peer text;
  digits text;
  thread public.conversations%ROWTYPE;
  sent_at timestamptz;
BEGIN
  IF NEW.platform <> 'whatsapp'
    OR NEW.event_type <> 'message.sent'
    OR NEW.raw_payload->>'adapter' IS DISTINCT FROM 'ycloud'
    OR NEW.raw_payload->>'kind' IS DISTINCT FROM 'app_echo'
    OR NULLIF(NEW.external_event_id, '') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only the verified connection for this organization may create a thread.
  IF NOT EXISTS (
    SELECT 1 FROM public.social_connections c
    WHERE c.id = NEW.connection_id AND c.organization_id = NEW.organization_id
      AND c.platform = 'whatsapp' AND c.settings->>'provider' = 'ycloud'
      AND c.settings->>'ycloud_verified' = 'true'
  ) THEN RETURN NEW; END IF;

  digits := pg_catalog.regexp_replace(COALESCE(NEW.raw_payload #>> '{message,to}', ''), '[^0-9]', '', 'g');
  IF digits ~ '^[1-9][0-9]{6,14}$' THEN
    peer := '+' || digits;
  ELSE
    peer := NULLIF(NEW.raw_payload #>> '{message,toUserId}', '');
    IF peer IS NULL THEN RETURN NEW; END IF;
  END IF;
  sent_at := COALESCE(NEW.occurred_at, NEW.received_at, pg_catalog.now());

  -- Respect historical privacy exclusions, including alternate phone formats.
  IF EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.organization_id = NEW.organization_id AND c.platform = 'whatsapp'
      AND c.metadata @> '{"private_excluded":true}'::jsonb
      AND (c.external_thread_id = 'dm:' || peer
        OR c.metadata->>'external_user_id' = peer
        OR (digits <> '' AND digits = pg_catalog.regexp_replace(
          COALESCE(c.metadata->>'external_user_id', ''), '[^0-9]', '', 'g')))
  ) THEN RETURN NEW; END IF;

  IF TG_WHEN = 'BEFORE' THEN
    INSERT INTO public.conversations
      (organization_id, platform, external_thread_id, last_message_at, unread_count, metadata)
    VALUES (NEW.organization_id, 'whatsapp', 'dm:' || peer, sent_at, 0,
      pg_catalog.jsonb_build_object('external_user_id', peer, 'source', 'whatsapp_app_echo'))
    ON CONFLICT (organization_id, platform, external_thread_id)
      WHERE external_thread_id IS NOT NULL DO NOTHING;

    SELECT * INTO thread FROM public.conversations c
    WHERE c.organization_id = NEW.organization_id AND c.platform = 'whatsapp'
      AND c.external_thread_id = 'dm:' || peer FOR UPDATE;
    IF thread.id IS NULL OR thread.metadata @> '{"private_excluded":true}'::jsonb THEN
      RETURN NEW;
    END IF;
    NEW.conversation_id := thread.id;
    NEW.contact_id := thread.contact_id;
    NEW.lead_id := thread.lead_id;
    NEW.processing_status := 'processed';
  ELSE
    -- The event now exists, so its FK can safely be written to messages.
    SELECT * INTO thread FROM public.conversations c
    WHERE c.id = NEW.conversation_id AND c.organization_id = NEW.organization_id
      AND c.platform = 'whatsapp' AND c.external_thread_id = 'dm:' || peer;
    IF thread.id IS NULL OR thread.metadata @> '{"private_excluded":true}'::jsonb THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.messages
      (organization_id, conversation_id, direction, body, external_message_id,
       sender_name, social_event_id, created_at, ai_meta)
    VALUES (NEW.organization_id, thread.id, 'outbound', NEW.content,
      'whatsapp:' || NEW.external_event_id, COALESCE(NEW.author_name, 'Tiqnora'),
      NEW.id, sent_at, pg_catalog.jsonb_build_object(
        'source', 'whatsapp_app_echo',
        'provider_message_id', COALESCE(NEW.raw_payload #>> '{message,id}', NEW.external_event_id),
        'delivery_status', COALESCE(NEW.raw_payload->>'delivery_status',
          NEW.raw_payload #>> '{message,status}', 'sent')))
    ON CONFLICT (organization_id, external_message_id) DO NOTHING;

    -- Backfilled messages must never move a thread backwards or add unread items.
    UPDATE public.conversations SET last_message_at = sent_at, updated_at = pg_catalog.now()
    WHERE id = thread.id AND (last_message_at IS NULL OR last_message_at < sent_at);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_whatsapp_app_echo() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER whatsapp_app_echo_link
BEFORE INSERT OR UPDATE OF content, raw_payload ON public.social_events
FOR EACH ROW WHEN (NEW.platform = 'whatsapp' AND NEW.event_type = 'message.sent'
  AND NEW.raw_payload->>'kind' = 'app_echo')
EXECUTE FUNCTION public.sync_whatsapp_app_echo();

CREATE TRIGGER whatsapp_app_echo_message
AFTER INSERT OR UPDATE OF content, raw_payload ON public.social_events
FOR EACH ROW WHEN (NEW.platform = 'whatsapp' AND NEW.event_type = 'message.sent'
  AND NEW.raw_payload->>'kind' = 'app_echo')
EXECUTE FUNCTION public.sync_whatsapp_app_echo();

-- Reuse the same idempotent path for received-but-unlinked historical echoes.
UPDATE public.social_events SET content = content
WHERE platform = 'whatsapp' AND event_type = 'message.sent'
  AND raw_payload->>'adapter' = 'ycloud' AND raw_payload->>'kind' = 'app_echo'
  AND conversation_id IS NULL;

