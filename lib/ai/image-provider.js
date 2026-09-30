/**
 * Tiqnora — Image Generation Provider Abstraction
 * Primary: OpenAI Images API (gpt-image / dall-e-3)
 * Fallback: Google Gemini Imagen
 */

function openaiKey() {
  return process.env.OPENAI_API_KEY || '';
}

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
}

export function imageProviderStatus() {
  return {
    openai: {
      configured: Boolean(openaiKey()),
      models: [process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', 'dall-e-3'],
      env: ['OPENAI_API_KEY', 'OPENAI_IMAGE_MODEL']
    },
    gemini: {
      configured: Boolean(geminiKey()),
      models: [process.env.GEMINI_IMAGE_MODEL || 'imagen-3.0-generate-002'],
      env: ['GEMINI_API_KEY', 'GEMINI_IMAGE_MODEL']
    }
  };
}

function classifyError(status, message = '') {
  const msg = String(message || '').toLowerCase();
  if (status === 429 || msg.includes('quota') || msg.includes('rate limit')) {
    return { code: 'IMAGE_PROVIDER_QUOTA', fallbackEligible: true, status: status || 429 };
  }
  if ([500, 502, 503, 504].includes(status) || msg.includes('timeout')) {
    return { code: 'IMAGE_PROVIDER_UNAVAILABLE', fallbackEligible: true, status: status || 503 };
  }
  if (status === 401 || status === 403 || msg.includes('api key')) {
    return { code: 'IMAGE_PROVIDER_AUTH', fallbackEligible: true, status: status || 401 };
  }
  return { code: 'IMAGE_PROVIDER_ERROR', fallbackEligible: true, status: status || 502 };
}

export function normalizeImageSize(width, height) {
  const w = Number(width) || 1080;
  const h = Number(height) || 1080;
  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.15) return { width: 1024, height: 1024, label: '1:1', openai: '1024x1024' };
  if (ratio < 0.7) return { width: 1024, height: 1792, label: '9:16', openai: '1024x1792' };
  if (ratio > 1.4) return { width: 1792, height: 1024, label: '16:9', openai: '1792x1024' };
  return { width: 1024, height: 1536, label: '4:5', openai: '1024x1536' };
}

async function callOpenAIImage({ prompt, size, quality }) {
  const key = openaiKey();
  if (!key) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.code = 'IMAGE_PROVIDER_NOT_CONFIGURED';
    err.fallbackEligible = true;
    throw err;
  }
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const sizeSpec = size?.openai || '1024x1024';
  const body = { model, prompt: String(prompt).slice(0, 4000), n: 1, size: sizeSpec };
  if (model.includes('dall-e')) {
    body.quality = quality === 'hd' ? 'hd' : 'standard';
    body.response_format = 'b64_json';
  } else {
    body.quality = quality === 'low' ? 'low' : quality === 'hd' || quality === 'high' ? 'high' : 'medium';
  }
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const classified = classifyError(response.status, payload?.error?.message);
    const err = new Error(payload?.error?.message || `OpenAI image failed (${response.status})`);
    Object.assign(err, classified);
    throw err;
  }
  const item = payload.data?.[0];
  if (!item) {
    const err = new Error('OpenAI returned empty image payload');
    err.fallbackEligible = true;
    throw err;
  }
  return {
    provider: 'openai',
    model: payload.model || model,
    b64: item.b64_json || null,
    url: item.url || null,
    revised_prompt: item.revised_prompt || null,
    size: sizeSpec
  };
}

async function callGeminiImage({ prompt, size }) {
  const key = geminiKey();
  if (!key) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'IMAGE_PROVIDER_NOT_CONFIGURED';
    err.fallbackEligible = true;
    throw err;
  }
  const models = [
    process.env.GEMINI_IMAGE_MODEL,
    'imagen-3.0-generate-002',
    'imagen-3.0-generate-001',
    'gemini-2.0-flash-preview-image-generation'
  ].filter(Boolean);
  const aspectRatio = size?.label === '9:16' ? '9:16' : size?.label === '16:9' ? '16:9' : size?.label === '4:5' ? '3:4' : '1:1';
  let lastError = null;
  for (const model of models) {
    try {
      if (model.startsWith('imagen-')) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(key)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt: String(prompt).slice(0, 4000) }],
            parameters: { sampleCount: 1, aspectRatio, personGeneration: 'dont_allow' }
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastError = new Error(payload?.error?.message || `Gemini Imagen ${model} failed`);
          Object.assign(lastError, classifyError(response.status, payload?.error?.message));
          continue;
        }
        const bytes = payload?.predictions?.[0]?.bytesBase64Encoded || null;
        if (bytes) return { provider: 'gemini', model, b64: bytes, url: null, size: size?.openai || '1024x1024' };
        lastError = new Error(`Gemini Imagen ${model} empty`);
        lastError.fallbackEligible = true;
        continue;
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: String(prompt).slice(0, 4000) }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.4 }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(payload?.error?.message || `Gemini image ${model} failed`);
        Object.assign(lastError, classifyError(response.status, payload?.error?.message));
        continue;
      }
      for (const part of payload?.candidates?.[0]?.content?.parts || []) {
        const inline = part.inlineData || part.inline_data;
        if (inline?.data) return { provider: 'gemini', model, b64: inline.data, url: null, size: size?.openai || '1024x1024' };
      }
      lastError = new Error(`Gemini ${model} no image part`);
      lastError.fallbackEligible = true;
    } catch (err) {
      lastError = err;
      lastError.fallbackEligible = true;
    }
  }
  throw lastError || Object.assign(new Error('All Gemini image models failed'), { fallbackEligible: false });
}

export async function generateImage(options = {}) {
  const prompt = String(options.prompt || '').trim();
  if (!prompt) {
    const err = new Error('Image prompt is required');
    err.code = 'IMAGE_PROMPT_REQUIRED';
    throw err;
  }
  const size = normalizeImageSize(options.width || 1080, options.height || 1080);
  const quality = options.quality || 'high';
  const attempts = [];
  const chain = [];
  const preferred = String(options.preferredProvider || process.env.IMAGE_PROVIDER_PRIMARY || 'openai').toLowerCase();
  if (preferred === 'gemini') {
    if (geminiKey()) chain.push({ id: 'gemini', call: callGeminiImage });
    if (openaiKey()) chain.push({ id: 'openai', call: callOpenAIImage });
  } else {
    if (openaiKey()) chain.push({ id: 'openai', call: callOpenAIImage });
    if (geminiKey()) chain.push({ id: 'gemini', call: callGeminiImage });
  }
  if (!chain.length) {
    const err = new Error('No image provider configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY.');
    err.code = 'IMAGE_PROVIDER_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }
  let lastError = null;
  for (const candidate of chain) {
    try {
      const result = await candidate.call({ prompt, size, quality });
      attempts.push({ provider: candidate.id, ok: true, model: result.model });
      return { ...result, prompt_version: options.prompt_version || 'v1', attempts, width: size.width, height: size.height };
    } catch (err) {
      attempts.push({ provider: candidate.id, ok: false, code: err.code || 'ERROR', message: String(err.message || '').slice(0, 300) });
      lastError = err;
      if (err.fallbackEligible === false) break;
    }
  }
  const err = new Error(`All image providers failed: ${attempts.map((a) => `${a.provider}:${a.message || a.code}`).join(' | ')}`);
  err.code = lastError?.code || 'IMAGE_GENERATION_FAILED';
  err.status = lastError?.status || 502;
  err.attempts = attempts;
  throw err;
}

export default { generateImage, normalizeImageSize, imageProviderStatus };
