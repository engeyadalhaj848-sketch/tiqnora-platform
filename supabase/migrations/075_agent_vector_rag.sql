-- Agent RAG v2: pgvector hybrid retrieval.
-- Additive only; lexical search remains available as fallback.

create extension if not exists vector with schema extensions;

alter table public.ai_knowledge_chunks
  add column if not exists embedding extensions.vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz;

create index if not exists idx_ai_knowledge_chunks_embedding_hnsw
  on public.ai_knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create or replace function public.match_agent_knowledge_vector(
  p_organization_id uuid,
  p_query_embedding extensions.vector(768),
  p_query text default null,
  p_match_count int default 8,
  p_min_similarity real default 0.20
)
returns table (
  id uuid,
  document_id uuid,
  title text,
  source_uri text,
  content text,
  similarity real,
  lexical_rank real,
  rank real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select
      case
        when trim(coalesce(p_query, '')) = '' then null
        else websearch_to_tsquery('simple', p_query)
      end as tsq
  ),
  scored as (
    select
      c.id,
      c.document_id,
      d.title,
      d.source_uri,
      c.content,
      greatest(0::real, (1 - (c.embedding <=> p_query_embedding))::real) as similarity,
      case
        when q.tsq is null then 0::real
        else greatest(
          ts_rank_cd(c.search_vector, q.tsq),
          case when c.content ilike '%' || p_query || '%' then 0.5 else 0 end,
          case when d.title ilike '%' || p_query || '%' then 0.4 else 0 end
        )::real
      end as lexical_rank
    from public.ai_knowledge_chunks c
    join public.ai_knowledge_documents d on d.id = c.document_id
    cross join q
    where c.organization_id = p_organization_id
      and d.is_active = true
      and c.embedding is not null
  )
  select
    s.id,
    s.document_id,
    s.title,
    s.source_uri,
    s.content,
    s.similarity,
    s.lexical_rank,
    ((s.similarity * 0.80) + (least(1::real, s.lexical_rank) * 0.20))::real as rank
  from scored s
  where s.similarity >= greatest(0::real, least(coalesce(p_min_similarity, 0.20), 1::real))
  order by rank desc, similarity desc
  limit greatest(1, least(coalesce(p_match_count, 8), 20));
$$;

revoke all on function public.match_agent_knowledge_vector(uuid, extensions.vector, text, int, real) from public, anon;
grant execute on function public.match_agent_knowledge_vector(uuid, extensions.vector, text, int, real) to authenticated;

comment on column public.ai_knowledge_chunks.embedding is
  '768-dimension retrieval embedding. Null means lexical-only fallback.';
comment on function public.match_agent_knowledge_vector(uuid, extensions.vector, text, int, real) is
  'Org-scoped hybrid vector + lexical RAG search. SECURITY INVOKER so table RLS still applies.';
