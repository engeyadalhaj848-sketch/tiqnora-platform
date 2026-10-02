import { embedText, embeddingStatus, toPgVectorLiteral } from './embeddings.js';
import { detectInjection, sanitizeExternalContent } from './rag.js';

function normalizeRows(rows = [], mode = 'lexical') {
  return (rows || []).map((row) => ({
    id: row.id,
    document_id: row.document_id || null,
    title: row.title || 'Tiqnora Knowledge',
    source_uri: row.source_uri || null,
    content: sanitizeExternalContent(row.content || '').slice(0, 2400),
    score: Number(row.rank ?? row.similarity ?? 0),
    similarity: row.similarity == null ? null : Number(row.similarity),
    lexical_rank: row.lexical_rank == null ? null : Number(row.lexical_rank),
    retrieval_mode: mode,
    injection_flagged: detectInjection(row.content || '')
  })).filter((row) => row.content);
}

export async function retrieveLiveKnowledge({
  query,
  organization_id,
  token,
  supabaseCall,
  env = process.env,
  limit = 8,
  fetchImpl = fetch
}) {
  if (!organization_id) throw new Error('organization_id_required');
  if (!token) throw new Error('supabase_token_required');
  if (typeof supabaseCall !== 'function') throw new Error('supabase_call_required');

  const diagnostics = {
    vector_attempted: false,
    vector_error: null,
    lexical_error: null,
    embedding: embeddingStatus(env)
  };

  if (diagnostics.embedding.configured) {
    diagnostics.vector_attempted = true;
    try {
      const embedded = await embedText(query, {
        env,
        fetchImpl,
        taskType: 'RETRIEVAL_QUERY'
      });
      const rows = await supabaseCall('/rest/v1/rpc/match_agent_knowledge_vector', token, {
        method: 'POST',
        body: JSON.stringify({
          p_organization_id: organization_id,
          p_query_embedding: toPgVectorLiteral(embedded.vector),
          p_query: String(query || ''),
          p_match_count: Math.max(1, Math.min(Number(limit) || 8, 20)),
          p_min_similarity: Number(env.RAG_MIN_VECTOR_SIMILARITY || 0.20)
        })
      });
      const normalized = normalizeRows(rows, 'vector_hybrid');
      if (normalized.length) {
        return {
          chunks: normalized,
          mode: 'vector_hybrid',
          diagnostics: {
            ...diagnostics,
            embedding: { configured: true, provider: embedded.provider, model: embedded.model, dimensions: embedded.vector.length }
          }
        };
      }
    } catch (error) {
      diagnostics.vector_error = String(error?.message || error);
    }
  }

  try {
    const rows = await supabaseCall('/rest/v1/rpc/search_agent_knowledge', token, {
      method: 'POST',
      body: JSON.stringify({
        p_organization_id: organization_id,
        p_query: String(query || ''),
        p_match_count: Math.max(1, Math.min(Number(limit) || 8, 8))
      })
    });
    return {
      chunks: normalizeRows(rows, 'lexical_rpc'),
      mode: 'lexical_rpc',
      diagnostics
    };
  } catch (error) {
    diagnostics.lexical_error = String(error?.message || error);
    return { chunks: [], mode: 'none', diagnostics };
  }
}

export default { retrieveLiveKnowledge };
