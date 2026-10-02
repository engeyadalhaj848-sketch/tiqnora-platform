const DEFAULT_DIMENSIONS = 768;

function geminiKey(env) {
  return env.GEMINI_API_KEY || env.GOOGLE_GEMINI_API_KEY || env.GOOGLE_AI_API_KEY || '';
}

function chooseProvider(env = process.env) {
  const preferred = String(env.RAG_EMBEDDING_PROVIDER || '').toLowerCase();
  if (preferred === 'openai' && env.OPENAI_API_KEY) return 'openai';
  if (preferred === 'google_ai' && geminiKey(env)) return 'google_ai';
  if (geminiKey(env)) return 'google_ai';
  if (env.OPENAI_API_KEY) return 'openai';
  return null;
}

function validateVector(values, dimensions = DEFAULT_DIMENSIONS) {
  if (!Array.isArray(values) || values.length !== dimensions) {
    throw new Error(`embedding_dimension_mismatch:${values?.length || 0}:${dimensions}`);
  }
  const vector = values.map(Number);
  if (vector.some((v) => !Number.isFinite(v))) throw new Error('embedding_contains_non_finite_value');
  return vector;
}

async function embedGemini(text, { env, fetchImpl, dimensions, taskType }) {
  const apiKey = geminiKey(env);
  if (!apiKey) throw new Error('gemini_embedding_key_missing');
  const model = env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: dimensions
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `gemini_embedding_failed:${response.status}`);
  return {
    provider: 'google_ai',
    model,
    vector: validateVector(payload?.embedding?.values, dimensions)
  };
}

async function embedOpenAI(text, { env, fetchImpl, dimensions }) {
  if (!env.OPENAI_API_KEY) throw new Error('openai_embedding_key_missing');
  const model = env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  const response = await fetchImpl('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, input: text, dimensions })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `openai_embedding_failed:${response.status}`);
  return {
    provider: 'openai',
    model,
    vector: validateVector(payload?.data?.[0]?.embedding, dimensions)
  };
}

export function embeddingStatus(env = process.env) {
  const provider = chooseProvider(env);
  return {
    configured: Boolean(provider),
    provider,
    dimensions: DEFAULT_DIMENSIONS,
    model: provider === 'google_ai'
      ? (env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001')
      : provider === 'openai'
        ? (env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small')
        : null
  };
}

export async function embedText(
  text,
  {
    env = process.env,
    fetchImpl = fetch,
    dimensions = DEFAULT_DIMENSIONS,
    taskType = 'RETRIEVAL_QUERY'
  } = {}
) {
  const input = String(text || '').trim();
  if (!input) throw new Error('embedding_text_required');
  const provider = chooseProvider(env);
  if (!provider) throw new Error('embedding_provider_not_configured');
  if (provider === 'google_ai') {
    return embedGemini(input, { env, fetchImpl, dimensions, taskType });
  }
  return embedOpenAI(input, { env, fetchImpl, dimensions, taskType });
}

export function toPgVectorLiteral(vector) {
  const values = validateVector(vector, vector.length);
  return `[${values.join(',')}]`;
}

export { DEFAULT_DIMENSIONS };
