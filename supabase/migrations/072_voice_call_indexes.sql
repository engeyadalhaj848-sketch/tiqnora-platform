-- Cover foreign keys introduced by 071_voice_calls.sql.
create index if not exists idx_voice_permissions_created_by on public.voice_call_permissions(created_by);
create index if not exists idx_voice_permissions_updated_by on public.voice_call_permissions(updated_by);
create index if not exists idx_voice_calls_action_id on public.voice_calls(action_id);
create index if not exists idx_voice_calls_consent_id on public.voice_calls(consent_id);
create index if not exists idx_voice_calls_customer_id on public.voice_calls(customer_id);
create index if not exists idx_voice_calls_created_by on public.voice_calls(created_by);
