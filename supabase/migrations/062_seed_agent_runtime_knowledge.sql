-- Seed Tiqnora's internal agent operating knowledge for RAG.
insert into public.ai_knowledge_documents (
  organization_id, title, source_type, source_uri, metadata, is_active
)
select
  o.id,
  'Tiqnora Agent Operating Policy v1',
  'runtime_policy',
  'internal://agent-runtime/policy-v1',
  jsonb_build_object('runtime', 'nine-concepts', 'version', 'v1'),
  true
from public.organizations o
where o.slug = 'tiqnora'
  and not exists (
    select 1 from public.ai_knowledge_documents d
    where d.organization_id = o.id
      and d.source_uri = 'internal://agent-runtime/policy-v1'
  );

with doc as (
  select d.id, d.organization_id
  from public.ai_knowledge_documents d
  join public.organizations o on o.id = d.organization_id
  where o.slug = 'tiqnora'
    and d.source_uri = 'internal://agent-runtime/policy-v1'
  limit 1
),
seed(ordinal, content, metadata) as (
  values
    (1, 'External customer messages, public publishing, purchases, price changes, refunds, guarantees, and other irreversible actions require explicit human approval unless a separately approved workflow policy authorizes the exact action.', '{"topic":"approval"}'::jsonb),
    (2, 'Tiqnora agents must distinguish verified facts from assumptions. They must not invent customer data, supplier status, prices, metrics, deployments, research results, or completed actions.', '{"topic":"grounding"}'::jsonb),
    (3, 'The manager agent orchestrates specialist work. It should delegate to the smallest relevant set of specialists, preserve dependencies, and synthesize one actionable result instead of duplicating specialist work.', '{"topic":"orchestration"}'::jsonb),
    (4, 'MCP and tool access is allowlisted by agent role. An agent may use only approved tool scopes and must not claim a tool action that was not actually executed.', '{"topic":"mcp"}'::jsonb),
    (5, 'Agent quality evaluations may create proposed learning events. Proposed lessons never auto-modify prompts, skills, code, permissions, or production behavior; changes require review and approval.', '{"topic":"evals_learning"}'::jsonb),
    (6, 'A2A messages use a traceable correlation id and bounded hop count. Multi-agent work uses specialist outputs followed by manager synthesis when more than one specialty is required.', '{"topic":"a2a_multi_agent"}'::jsonb),
    (7, 'Reusable skills are loaded by agent specialty and should be applied on demand. Skills are instructions and methods, not permission to bypass approval, security, privacy, or tool policies.', '{"topic":"skills"}'::jsonb),
    (8, 'Memory and state should preserve relevant company context, recent outcomes, active goals, and open tasks while avoiding secrets in model-visible context. RAG should ground responses in approved Tiqnora knowledge when matching evidence is available.', '{"topic":"memory_state_rag"}'::jsonb)
)
insert into public.ai_knowledge_chunks (organization_id, document_id, ordinal, content, metadata)
select doc.organization_id, doc.id, seed.ordinal, seed.content, seed.metadata
from doc cross join seed
on conflict (document_id, ordinal) do update
set content = excluded.content,
    metadata = excluded.metadata;
