/**
 * Tiqnora V6 — AI Provider Abstraction
 * Never call model SDKs directly from feature code.
 * All external AI goes through generateText / generateStructured / classifyIntent / etc.
 */

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
}

async function callGemini({ system, user, model, temperature = 0.4, maxOutputTokens = 2048, jsonMode = false }) {
  const apiKey = geminiKey();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'AI_PROVIDER_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }
  const m = (model && String(model).startsWith('gemini-')) ? model : DEFAULT_GEMINI_MODEL;
  const generationConfig = {
    temperature,
    maxOutputTokens
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
    throw err;
  }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(p => p?.text || '')
    .join('\n')
    .trim();
  return { text, model: m, provider: 'gemini', raw: data };
}

/**
 * @param {{ system?: string, prompt: string, model?: string, temperature?: number, maxTokens?: number }} opts
 */
export async function generateText(opts) {
  const { system = '', prompt, model, temperature, maxTokens } = opts || {};
  if (!prompt || !String(prompt).trim()) {
    throw Object.assign(new Error('prompt is required'), { code: 'INVALID_INPUT', status: 400 });
  }
  return callGemini({
    system,
    user: prompt,
    model,
    temperature,
    maxOutputTokens: maxTokens || 2048,
    jsonMode: false
  });
}

/**
 * Generate structured JSON. Validates that output parses as object.
 * @param {{ system?: string, prompt: string, schemaHint?: string, model?: string }} opts
 */
export async function generateStructured(opts) {
  const { system = '', prompt, schemaHint = '', model } = opts || {};
  const sys = [
    system,
    'You must respond with valid JSON only. No markdown fences. No commentary.',
    schemaHint ? `Expected shape: ${schemaHint}` : ''
  ].filter(Boolean).join('\n');
  const result = await callGemini({
    system: sys,
    user: prompt,
    model,
    temperature: 0.2,
    maxOutputTokens: 2048,
    jsonMode: true
  });
  let parsed;
  try {
    const cleaned = result.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    const err = new Error('AI returned non-JSON structured output');
    err.code = 'AI_INVALID_JSON';
    err.status = 502;
    err.rawText = result.text;
    throw err;
  }
  return { data: parsed, model: result.model, provider: result.provider };
}

/**
 * Classify a message into business intents.
 */
export async function classifyIntent({ text, language = 'ar' }) {
  const schemaHint = `{
    "intent": "sales|support|complaint|booking|quote_request|existing_customer|spam|other",
    "confidence": 0.0-1.0,
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

/**
 * Sales agent: draft a reply + qualification extraction. Never auto-sends.
 */
export async function generateSalesReply({
  lead = {},
  messages = [],
  brand = {},
  language = 'ar'
}) {
  const schemaHint = `{
    "reply_draft": "string — message ready for human approval",
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

export default {
  generateText,
  generateStructured,
  classifyIntent,
  generateSalesReply
};
