/**
 * Tiqnora V6 — AI Provider Abstraction
 * Feature code should use this module instead of calling model APIs directly.
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

function modelFallbackEligible(status, payload) {
  const message = String(payload?.error?.message || '').toLowerCase();
  if (status === 404) return true;

  // Temporary provider/model capacity failures: try the next configured Gemini model.
  if ([500, 502, 503, 504].includes(status)) return true;
  if (message.includes('high demand') || message.includes('temporarily unavailable')) return true;

  return status === 400 &&
    message.includes('model') &&
    (message.includes('not found') || message.includes('unsupported') || message.includes('not supported') || message.includes('unavailable'));
}

async function callGeminiOnce({ system, user, model, temperature, maxOutputTokens, jsonMode }) {
  const apiKey = geminiKey();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'AI_PROVIDER_NOT_CONFIGURED';
    err.status = 503;
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
    const err = new Error(data?.error?.message || `Gemini failed (${res.status})`);
    err.code = 'AI_PROVIDER_ERROR';
    err.status = res.status >= 500 ? 502 : res.status;
    err.providerStatus = res.status;
    err.fallbackEligible = modelFallbackEligible(res.status, data);
    throw err;
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => part?.text || '')
    .join('\n')
    .trim();

  return { text, model, provider: 'gemini', raw: data };
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
    status: 502
  });
}

export async function generateText(opts) {
  const { system = '', prompt, model, temperature, maxTokens } = opts || {};
  if (!prompt || !String(prompt).trim()) {
    throw Object.assign(new Error('prompt is required'), { code: 'INVALID_INPUT', status: 400 });
  }
  return callGemini({
    system,
    user: String(prompt),
    model,
    temperature,
    maxOutputTokens: maxTokens || 2048,
    jsonMode: false
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
  const { system = '', prompt, schemaHint = '', model } = opts || {};
  if (!prompt || !String(prompt).trim()) {
    throw Object.assign(new Error('prompt is required'), { code: 'INVALID_INPUT', status: 400 });
  }

  const sys = [
    system,
    'Respond with valid JSON only. Do not use markdown fences or commentary.',
    schemaHint ? `Expected shape: ${schemaHint}` : ''
  ].filter(Boolean).join('\n');

  let result = await callGemini({
    system: sys,
    user: String(prompt),
    model,
    temperature: 0.2,
    maxOutputTokens: 2048,
    jsonMode: true
  });

  try {
    return { data: parseJsonText(result.text), model: result.model, provider: result.provider };
  } catch {
    result = await callGemini({
      system: `${sys}\nThe previous response was invalid JSON. Return exactly one valid JSON object.`,
      user: String(prompt),
      model: result.model,
      temperature: 0.1,
      maxOutputTokens: 2048,
      jsonMode: true
    });
    try {
      return { data: parseJsonText(result.text), model: result.model, provider: result.provider };
    } catch {
      const err = new Error('AI returned non-JSON structured output');
      err.code = 'AI_INVALID_JSON';
      err.status = 502;
      throw err;
    }
  }
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
    schemaHint
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
    schemaHint
  });

  return { ...data, model, provider };
}

export function aiProviderHealth() {
  return {
    configured: Boolean(geminiKey()),
    preferredModel: process.env.GEMINI_MODEL || GEMINI_FALLBACKS[0],
    fallbacks: modelCandidates(null)
  };
}

export default {
  generateText,
  generateStructured,
  classifyIntent,
  generateSalesReply,
  aiProviderHealth
};
