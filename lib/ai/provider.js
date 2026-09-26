/**
 * Tiqnora V6 — AI Provider Abstraction
 * Feature code should use this module instead of calling model APIs directly.
 *
 * Provider chain:
 *   1. Gemini (primary, model fallbacks inside)
 *   2. OpenAI
 *   3. xAI (Grok)
 *   4. Anthropic (Claude)
 *   5. Deterministic template fallback when allowDeterministic=true
 *
 * Errors are classified so quota / rate-limit / 5xx / timeout are fallback-eligible.
 */

const GEMINI_FALLBACKS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite'
];

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
}

function openaiKey() {
  return process.env.OPENAI_API_KEY || '';
}

function xaiKey() {
  return process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
}

function anthropicKey() {
  return process.env.ANTHROPIC_API_KEY || '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function modelCandidates(model) {
  return unique([
    model && String(model).startsWith('gemini-') ? String(model) : null,
    process.env.GEMINI_MODEL,
    ...GEMINI_FALLBACKS
  ]);
}

/**
 * Classify provider HTTP/error into a stable code and whether the next provider may be tried.
 */
function classifyProviderError(status, message = '') {
  const msg = String(message || '').toLowerCase();
  const quota =
    status === 429 ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests');
  if (quota) {
    return { code: 'AI_PROVIDER_QUOTA', status: status === 429 ? 429 : status || 429, fallbackEligible: true };
  }
  if ([500, 502, 503, 504].includes(status) || msg.includes('timeout') || msg.includes('temporarily unavailable') || msg.includes('high demand')) {
    return { code: 'AI_PROVIDER_UNAVAILABLE', status: status || 503, fallbackEligible: true };
  }
  if (status === 401 || status === 403 || msg.includes('api key') || msg.includes('unauthorized') || msg.includes('permission')) {
    return { code: 'AI_PROVIDER_AUTH', status: status || 401, fallbackEligible: true };
  }
  if (status === 404 || (msg.includes('model') && (msg.includes('not found') || msg.includes('unsupported') || msg.includes('not supported')))) {
    return { code: 'AI_PROVIDER_MODEL', status: status || 404, fallbackEligible: true };
  }
  return { code: 'AI_PROVIDER_ERROR', status: status || 502, fallbackEligible: false };
}

function modelFallbackEligible(status, payload) {
  const message = String(payload?.error?.message || '');
  return classifyProviderError(status, message).fallbackEligible;
}

async function callGeminiOnce({ system, user, model, temperature, maxOutputTokens, jsonMode }) {
  const apiKey = geminiKey();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'AI_PROVIDER_NOT_CONFIGURED';
    err.status = 503;
    err.fallbackEligible = true;
    throw err;
  }

  const generationConfig = {
    temperature: temperature ?? 0.4,
    maxOutputTokens: maxOutputTokens || 2048
  };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';

  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Gemini failed (${res.status})`;
    const classified = classifyProviderError(res.status, message);
    const err = new Error(message);
    err.code = classified.code;
    err.status = classified.status >= 500 ? 502 : classified.status;
    err.providerStatus = res.status;
    err.fallbackEligible = classified.fallbackEligible;
    err.provider = 'gemini';
    throw err;
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => part?.text || '')
    .join('\n')
    .trim();

  return { text, model, provider: 'gemini', raw: data, fallback_used: false };
}

async function callGemini(options) {
  const models = modelCandidates(options.model);
  let lastError = null;

  for (let i = 0; i < models.length; i += 1) {
    try {
      return await callGeminiOnce({ ...options, model: models[i] });
    } catch (error) {
      lastError = error;
      if (!error.fallbackEligible || i === models.length - 1) throw error;
    }
  }

  throw lastError || Object.assign(new Error('No Gemini model available'), {
    code: 'AI_PROVIDER_ERROR',
    status: 502,
    fallbackEligible: true
  });
}

async function callOpenAI({ system, user, temperature, maxOutputTokens, jsonMode }) {
  const apiKey = openaiKey();
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.code = 'AI_PROVIDER_NOT_CONFIGURED';
    err.status = 503;
    err.fallbackEligible = true;
    throw err;
  }

  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: temperature ?? 0.4,
    max_tokens: maxOutputTokens || 2048,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user }
    ]
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `OpenAI failed (${res.status})`;
    const classified = classifyProviderError(res.status, message);
    const err = new Error(message);
    err.code = classified.code;
    err.status = classified.status >= 500 ? 502 : classified.status;
    err.providerStatus = res.status;
    err.fallbackEligible = classified.fallbackEligible;
    err.provider = 'openai';
    throw err;
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || '';
  return {
    text,
    model: data?.model || body.model,
    provider: 'openai',
    raw: data,
    fallback_used: false
  };
}

async function callXai({ system, user, temperature, maxOutputTokens }) {
  const apiKey = xaiKey();
  if (!apiKey) {
    const err = new Error('XAI_API_KEY is not configured');
    err.code = 'AI_PROVIDER_NOT_CONFIGURED';
    err.status = 503;
    err.fallbackEligible = true;
    throw err;
  }

  const body = {
    model: process.env.XAI_MODEL || 'grok-3-mini',
    temperature: temperature ?? 0.4,
    max_tokens: maxOutputTokens || 2048,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user }
    ]
  };

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `xAI failed (${res.status})`;
    const classified = classifyProviderError(res.status, message);
    const err = new Error(message);
    err.code = classified.code;
    err.status = classified.status >= 500 ? 502 : classified.status;
    err.providerStatus = res.status;
    err.fallbackEligible = classified.fallbackEligible;
    err.provider = 'xai';
    throw err;
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || '';
  return {
    text,
    model: data?.model || body.model,
    provider: 'xai',
    raw: data,
    fallback_used: false
  };
}

async function callAnthropic({ system, user, temperature, maxOutputTokens }) {
  const apiKey = anthropicKey();
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY is not configured');
    err.code = 'AI_PROVIDER_NOT_CONFIGURED';
    err.status = 503;
    err.fallbackEligible = true;
    throw err;
  }

  const body = {
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
    max_tokens: maxOutputTokens || 2048,
    temperature: temperature ?? 0.4,
    system: system || undefined,
    messages: [{ role: 'user', content: user }]
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Anthropic failed (${res.status})`;
    const classified = classifyProviderError(res.status, message);
    const err = new Error(message);
    err.code = classified.code;
    err.status = classified.status >= 500 ? 502 : classified.status;
    err.providerStatus = res.status;
    err.fallbackEligible = classified.fallbackEligible;
    err.provider = 'anthropic';
    throw err;
  }

  const text = (data?.content || [])
    .filter(part => part.type === 'text')
    .map(part => part.text || '')
    .join('\n')
    .trim();

  return {
    text,
    model: data?.model || body.model,
    provider: 'anthropic',
    raw: data,
    fallback_used: false
  };
}

function deterministicTextFallback({ system, user }) {
  const prompt = String(user || '').slice(0, 400);
  const sys = String(system || '').slice(0, 200);
  return {
    text: [
      '[Deterministic fallback — AI providers unavailable]',
      sys ? `Context: ${sys}` : null,
      '',
      'Manual review required. Suggested next steps:',
      '1. Confirm the lead/context is still valid.',
      '2. Prepare a short personalized outreach draft offline.',
      '3. Queue for human approval before any send.',
      '',
      `Original prompt excerpt: ${prompt || '(empty)'}`
    ].filter(Boolean).join('\n'),
    model: 'deterministic-template',
    provider: 'deterministic',
    fallback_used: true,
    degraded: true
  };
}

/**
 * Generate free-form text.
 * opts.allowDeterministic = true enables final template fallback (never throws for missing AI).
 */
export async function generateText(opts) {
  const {
    system = '',
    prompt,
    model,
    temperature,
    maxTokens,
    allowDeterministic = false
  } = opts || {};

  if (!prompt || !String(prompt).trim()) {
    throw Object.assign(new Error('prompt is required'), { code: 'INVALID_INPUT', status: 400 });
  }

  const user = String(prompt);
  const common = {
    system,
    user,
    model,
    temperature,
    maxOutputTokens: maxTokens || 2048,
    jsonMode: false
  };

  const providers = [];
  if (geminiKey()) providers.push({ name: 'gemini', fn: () => callGemini(common) });
  if (openaiKey()) providers.push({ name: 'openai', fn: () => callOpenAI(common) });
  if (xaiKey()) providers.push({ name: 'xai', fn: () => callXai(common) });
  if (anthropicKey()) providers.push({ name: 'anthropic', fn: () => callAnthropic(common) });

  if (!providers.length) {
    if (allowDeterministic) return deterministicTextFallback({ system, user });
    const err = new Error('No AI provider API key configured');
    err.code = 'AI_PROVIDER_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  let lastError = null;
  for (const p of providers) {
    try {
      return await p.fn();
    } catch (error) {
      lastError = error;
      if (error.fallbackEligible === false) break;
    }
  }

  if (allowDeterministic) {
    const det = deterministicTextFallback({ system, user });
    det.last_error = String(lastError?.message || lastError || '').slice(0, 300);
    det.last_error_code = lastError?.code || null;
    return det;
  }

  throw lastError || Object.assign(new Error('All AI providers failed'), {
    code: 'AI_PROVIDER_ERROR',
    status: 502
  });
}

function parseJsonText(text) {
  const cleaned = String(text || '')
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/\`\`\`\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

export async function generateStructured(opts) {
  const { system = '', prompt, schemaHint = '', model, allowDeterministic = false } = opts || {};
  if (!prompt || !String(prompt).trim()) {
    throw Object.assign(new Error('prompt is required'), { code: 'INVALID_INPUT', status: 400 });
  }

  const sys = [
    system,
    'Respond with valid JSON only. Do not use markdown fences or commentary.',
    schemaHint ? `Expected shape: ${schemaHint}` : ''
  ].filter(Boolean).join('\n');

  const user = String(prompt);
  const providers = [];
  if (geminiKey()) {
    providers.push({
      name: 'gemini',
      fn: () => callGemini({
        system: sys,
        user,
        model,
        temperature: 0.2,
        maxOutputTokens: 2048,
        jsonMode: true
      })
    });
  }
  if (openaiKey()) {
    providers.push({
      name: 'openai',
      fn: () => callOpenAI({ system: sys, user, temperature: 0.2, maxOutputTokens: 2048, jsonMode: true })
    });
  }
  if (xaiKey()) {
    providers.push({
      name: 'xai',
      fn: () => callXai({ system: sys, user, temperature: 0.2, maxOutputTokens: 2048 })
    });
  }
  if (anthropicKey()) {
    providers.push({
      name: 'anthropic',
      fn: () => callAnthropic({ system: sys, user, temperature: 0.2, maxOutputTokens: 2048 })
    });
  }

  let lastError = null;
  for (const p of providers) {
    try {
      const result = await p.fn();
      try {
        return { data: parseJsonText(result.text), model: result.model, provider: result.provider, fallback_used: false };
      } catch {
        // retry once with stricter instruction on same provider path via next iteration or throw
        lastError = Object.assign(new Error('AI returned non-JSON structured output'), {
          code: 'AI_INVALID_JSON',
          status: 502,
          fallbackEligible: true
        });
        continue;
      }
    } catch (error) {
      lastError = error;
      if (error.fallbackEligible === false) break;
    }
  }

  if (allowDeterministic) {
    return {
      data: {
        reply_draft: '[Deterministic fallback] Manual review required — AI providers unavailable.',
        note: 'Generated without live model.',
        degraded: true
      },
      model: 'deterministic-template',
      provider: 'deterministic',
      fallback_used: true
    };
  }

  throw lastError || Object.assign(new Error('AI returned non-JSON structured output'), {
    code: 'AI_INVALID_JSON',
    status: 502
  });
}

export async function classifyIntent({ text, language = 'ar' }) {
  const schemaHint = `{
    "intent": "sales|support|complaint|booking|quote_request|existing_customer|spam|other",
    "confidence": 0.0,
    "sentiment": "positive|neutral|negative",
    "priority": "low|normal|high|urgent",
    "summary": "short"
  }`;

  const { data, model, provider } = await generateStructured({
    system: `You are Tiqnora AI classifier for a Saudi B2B growth platform. Language preference: ${language}.`,
    prompt: `Classify this customer message:\n\n${text}`,
    schemaHint,
    allowDeterministic: true
  });

  const allowed = new Set(['sales', 'support', 'complaint', 'booking', 'quote_request', 'existing_customer', 'spam', 'other']);
  if (!allowed.has(data.intent)) data.intent = 'other';
  return { ...data, model, provider };
}

export async function generateSalesReply({
  lead = {},
  messages = [],
  brand = {},
  language = 'ar'
}) {
  const schemaHint = `{
    "reply_draft": "string",
    "qualification": {
      "temperature": "cold|warm|hot|qualified|unqualified",
      "budget": "string|null",
      "timeline": "string|null",
      "service_interest": "string|null",
      "decision_maker": "boolean|null",
      "pain_points": ["string"],
      "company_size": "string|null"
    },
    "next_best_action": "reply|ask_qualification|propose_meeting|create_opportunity|follow_up|escalate",
    "suggested_stage": "lead|contacted|qualified|proposal|negotiation|won|lost|null",
    "internal_summary": "string"
  }`;

  const history = (messages || []).slice(-12).map(m =>
    `${m.direction || 'unknown'}: ${(m.body || '').slice(0, 500)}`
  ).join('\n');

  const leadCtx = JSON.stringify({
    contact_name: lead.contact_name || lead.name,
    company_name: lead.company_name || lead.company,
    industry: lead.industry,
    city: lead.city,
    source: lead.source,
    status: lead.status,
    opportunity_score: lead.opportunity_score,
    interest: lead.interest
  });

  const brandCtx = brand?.tone_of_voice
    ? `Brand tone: ${brand.tone_of_voice}. Name: ${brand.brand_name || 'Tiqnora'}.`
    : 'Brand: Tiqnora AI — professional Saudi B2B, clear Arabic, respectful.';

  const { data, model, provider } = await generateStructured({
    system: [
      'You are Tiqnora Sales Agent.',
      brandCtx,
      'Never claim you already sent a message. Produce drafts only.',
      'Do not invent prices not provided. Prefer asking one clear next question.',
      `Respond in ${language === 'en' ? 'English' : 'Arabic'}.`
    ].join(' '),
    prompt: `Lead:\n${leadCtx}\n\nRecent messages:\n${history || '(none)'}\n\nProduce the JSON response.`,
    schemaHint,
    allowDeterministic: true
  });

  return { ...data, model, provider };
}

export function aiProviderHealth() {
  return {
    configured: Boolean(geminiKey() || openaiKey() || xaiKey() || anthropicKey()),
    preferredModel: process.env.GEMINI_MODEL || GEMINI_FALLBACKS[0],
    fallbacks: modelCandidates(null),
    providers: {
      gemini: Boolean(geminiKey()),
      openai: Boolean(openaiKey()),
      xai: Boolean(xaiKey()),
      anthropic: Boolean(anthropicKey())
    }
  };
}

export default {
  generateText,
  generateStructured,
  classifyIntent,
  generateSalesReply,
  aiProviderHealth
};
