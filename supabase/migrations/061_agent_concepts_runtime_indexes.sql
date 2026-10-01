-- Cover foreign keys introduced by Agent Concepts Runtime v1.
create index if not exists idx_ai_agent_learning_events_org
  on public.ai_agent_learning_events(organization_id, created_at desc);
create index if not exists idx_ai_agent_learning_events_source_eval
  on public.ai_agent_learning_events(source_eval_id)
  where source_eval_id is not null;
create index if not exists idx_ai_agent_learning_events_reviewer
  on public.ai_agent_learning_events(reviewed_by)
  where reviewed_by is not null;
create index if not exists idx_ai_agent_messages_from
  on public.ai_agent_messages(from_agent_id, created_at desc)
  where from_agent_id is not null;
