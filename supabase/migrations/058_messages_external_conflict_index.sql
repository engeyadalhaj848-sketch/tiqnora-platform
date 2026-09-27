-- Allow PostgREST ON CONFLICT (organization_id, external_message_id)
-- to infer a non-partial unique index. PostgreSQL unique indexes still allow
-- multiple NULL external_message_id values, so this preserves current behavior.
create unique index if not exists idx_messages_external_conflict
  on public.messages(organization_id, external_message_id);
