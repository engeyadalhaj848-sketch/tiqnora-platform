-- Run with execute_sql against the migrated database. All fixtures roll back.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  conn public.social_connections%ROWTYPE;
  ev public.social_events%ROWTYPE;
  conv public.conversations%ROWTYPE;
  token text := 'echo-sync-test-' || gen_random_uuid()::text;
  peer text := 'US.test.' || gen_random_uuid()::text;
  payload jsonb;
  n integer;
BEGIN
  SELECT * INTO STRICT conn FROM public.social_connections
  WHERE platform = 'whatsapp' AND settings->>'provider' = 'ycloud'
    AND settings->>'ycloud_verified' = 'true' LIMIT 1;
  payload := jsonb_build_object('adapter', 'ycloud', 'kind', 'app_echo',
    'message', jsonb_build_object('id', token, 'toUserId', peer, 'status', 'sent'));

  INSERT INTO public.social_events
    (organization_id, connection_id, platform, event_type, external_event_id,
     author_external_id, content, occurred_at, processing_status, raw_payload)
  VALUES (conn.organization_id, conn.id, 'whatsapp', 'message.sent', token,
    'tiqnora', 'test outbound', '2026-10-20T10:00:00Z', 'ignored', payload)
  RETURNING * INTO ev;
  IF ev.conversation_id IS NULL OR ev.processing_status <> 'processed' THEN
    RAISE EXCEPTION 'echo was not linked';
  END IF;
  SELECT * INTO STRICT conv FROM public.conversations WHERE id = ev.conversation_id;
  IF conv.external_thread_id <> 'dm:' || peer OR conv.unread_count <> 0 THEN
    RAISE EXCEPTION 'wrong recipient thread or unread count';
  END IF;
  SELECT count(*) INTO n FROM public.messages WHERE social_event_id = ev.id
    AND direction = 'outbound' AND body = 'test outbound'
    AND created_at = '2026-10-20T10:00:00Z';
  IF n <> 1 THEN RAISE EXCEPTION 'outbound message missing'; END IF;

  -- A repeated provider event and repeated processing must be idempotent.
  INSERT INTO public.social_events
    (organization_id, connection_id, platform, event_type, external_event_id,
     author_external_id, content, raw_payload)
  VALUES (conn.organization_id, conn.id, 'whatsapp', 'message.sent', token,
    'tiqnora', 'test outbound', payload)
  ON CONFLICT (platform, external_event_id) DO NOTHING;
  UPDATE public.social_events SET content = content WHERE id = ev.id;
  SELECT count(*) INTO n FROM public.messages
    WHERE organization_id = conn.organization_id AND external_message_id = 'whatsapp:' || token;
  IF n <> 1 THEN RAISE EXCEPTION 'duplicate message'; END IF;

  UPDATE public.conversations SET status = 'resolved', unread_count = 3 WHERE id = conv.id;
  INSERT INTO public.social_events
    (organization_id, connection_id, platform, event_type, external_event_id,
     author_external_id, content, occurred_at, raw_payload)
  VALUES (conn.organization_id, conn.id, 'whatsapp', 'message.sent', token || '-old',
    'tiqnora', 'older outbound', '2026-10-19T10:00:00Z', payload);
  SELECT * INTO STRICT conv FROM public.conversations WHERE id = conv.id;
  IF conv.last_message_at <> '2026-10-20T10:00:00Z'
    OR conv.unread_count <> 3 OR conv.status <> 'resolved' THEN
    RAISE EXCEPTION 'history changed latest activity, unread count, or status';
  END IF;

  UPDATE public.conversations SET metadata = metadata || '{"private_excluded":true}'::jsonb
    WHERE id = conv.id;
  INSERT INTO public.social_events
    (organization_id, connection_id, platform, event_type, external_event_id,
     author_external_id, content, raw_payload)
  VALUES (conn.organization_id, conn.id, 'whatsapp', 'message.sent', token || '-private',
    'tiqnora', 'private outbound', payload) RETURNING * INTO ev;
  IF ev.conversation_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.messages WHERE social_event_id = ev.id
  ) THEN RAISE EXCEPTION 'private conversation was exposed'; END IF;

  INSERT INTO public.social_events
    (organization_id, platform, event_type, external_event_id,
     author_external_id, content, raw_payload)
  VALUES (conn.organization_id, 'whatsapp', 'message.sent', token || '-unverified',
    'tiqnora', 'unverified outbound', payload) RETURNING * INTO ev;
  IF ev.conversation_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.messages WHERE social_event_id = ev.id
  ) THEN RAISE EXCEPTION 'unverified connection was accepted'; END IF;
END;
$$;
ROLLBACK;

