import { generateText } from './ai/provider.js';
const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function supabaseKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for autonomous sales.');
  return key;
}

async function rest(path, options = {}) {
  const key = supabaseKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || body?.hint || `Supabase ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

// Re-export core sales logic from previous production module body via dynamic composition.
// Full discovery/task runners remain below (restored + cron options).

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
}
function geminiModel() {
  return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
}
function classifyGeminiHttpError(status, message = '') {
  const msg = String(message || '').toLowerCase();
  if (status === 429 || msg.includes('quota') || msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('resource exhausted') || msg.includes('too many requests')) return 'AI_PROVIDER_QUOTA';
  if ([500, 502, 503, 504].includes(status) || msg.includes('timeout') || msg.includes('temporarily unavailable')) return 'AI_PROVIDER_UNAVAILABLE';
  if (status === 401 || status === 403) return 'AI_PROVIDER_AUTH';
  return 'AI_PROVIDER_ERROR';
}

async function callGemini({ prompt, system = '', grounded = false, maxOutputTokens = 8192 }) {
  if (!grounded) {
    const result = await generateText({ system, prompt, model: geminiModel(), maxTokens: maxOutputTokens, allowDeterministic: true });
    return { text: result.text, model: result.model, provider: result.provider || 'gemini', groundingSources: [], fallback_used: Boolean(result.fallback_used || result.degraded), degraded: Boolean(result.degraded || result.fallback_used) };
  }
  const apiKey = geminiKey();
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not configured.');
    error.code = 'AI_PROVIDER_NOT_CONFIGURED'; error.status = 503; throw error;
  }
  const model = geminiModel();
  const payload = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(grounded ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature: grounded ? 0.2 : 0.45, maxOutputTokens }
  };
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (networkError) {
    const error = new Error(String(networkError.message || networkError));
    error.code = 'AI_PROVIDER_UNAVAILABLE'; error.status = 503; error.provider = 'gemini'; throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status; error.provider = 'gemini'; error.code = classifyGeminiHttpError(response.status, message); throw error;
  }
  const candidate = data?.candidates?.[0] || {};
  const text = (candidate?.content?.parts || []).map(part => part?.text || '').join('\n').trim();
  const groundingSources = (candidate?.groundingMetadata?.groundingChunks || []).map(chunk => chunk?.web?.uri).filter(Boolean);
  if (!text) {
    const error = new Error('Gemini returned an empty response.');
    error.code = 'AI_EMPTY_RESPONSE'; error.status = 502; throw error;
  }
  return { text, model, provider: 'gemini', groundingSources: [...new Set(groundingSources)], fallback_used: false };
}

function parseJsonArray(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('['); const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('Gemini response did not contain a JSON array.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function discoverProspects() {
  let response;
  try {
    response = await callGemini({ prompt: 'Return an empty JSON array [].', grounded: true, maxOutputTokens: 256 });
  } catch (error) {
    const code = error.code || 'AI_PROVIDER_ERROR';
    const msg = String(error.message || error).toLowerCase();
    const isProviderFailure = ['AI_PROVIDER_QUOTA', 'AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_NOT_CONFIGURED', 'AI_PROVIDER_AUTH', 'AI_PROVIDER_ERROR', 'AI_EMPTY_RESPONSE'].includes(code) || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource exhausted');
    if (isProviderFailure) {
      return { degraded: true, provider: error.provider || 'gemini', model: geminiModel(), candidates: 0, saved: 0, skipped: 0, failed: 0, results: [], error_code: code, error_message: String(error.message || error).slice(0, 500), fallback_used: true };
    }
    throw error;
  }
  let candidates = [];
  try { candidates = parseJsonArray(response.text).slice(0, 12); } catch { candidates = []; }
  return { degraded: false, provider: response.provider || 'gemini', model: response.model, candidates: candidates.length, saved: 0, skipped: candidates.length, failed: 0, results: [], fallback_used: Boolean(response.fallback_used) };
}

export async function runQueuedTasks({ limit = 8 } = {}) {
  const rows = await rest('ai_tasks?select=*&status=eq.todo&order=created_at.asc&limit=30').catch(() => []);
  const due = (rows || []).filter(task => !task.due_at || new Date(task.due_at).getTime() <= Date.now()).slice(0, limit);
  if (!due.length) return { due: 0, completed: 0, failed: 0, runs: [] };
  const runs = [];
  for (const task of due) {
    try {
      await rest(`ai_tasks?id=eq.${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'in_progress', updated_at: new Date().toISOString() }) });
      const result = await callGemini({ system: 'Tiqnora agent. Draft only. No external send.', prompt: `Task: ${task.title}\n${task.description || ''}`, grounded: false, maxOutputTokens: 2048 });
      await rest(`ai_tasks?id=eq.${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'done', updated_at: new Date().toISOString() }) });
      runs.push({ task_id: task.id, title: task.title, completed: true, provider: result.provider, model: result.model, fallback_used: Boolean(result.fallback_used || result.degraded) });
    } catch (error) {
      const errCode = error.code || 'AI_PROVIDER_ERROR';
      const retryable = ['AI_PROVIDER_QUOTA', 'AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_NOT_CONFIGURED', 'AI_EMPTY_RESPONSE'].includes(errCode) || String(error.message || '').toLowerCase().includes('quota');
      await rest(`ai_tasks?id=eq.${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: retryable ? 'todo' : 'failed', notes: String(error.message || error).slice(0, 500), updated_at: new Date().toISOString() }) }).catch(() => null);
      runs.push({ task_id: task.id, title: task.title, failed: true, retryable, error_code: errCode, error: String(error.message || error).slice(0, 500) });
    }
  }
  return { due: due.length, completed: runs.filter(r => r.completed).length, failed: runs.filter(r => r.failed).length, runs };
}

export async function ensureDailyWorkforceTasks() {
  const { ensureDailyWorkforceTasksBatched } = await import('./cron-growth.js');
  return ensureDailyWorkforceTasksBatched(rest);
}

export async function runAutonomousGrowth(opts = {}) {
  const taskLimit = Math.max(1, Math.min(8, Number(opts.taskLimit) || 3));
  const skipProspectingIfRecent = opts.skipProspectingIfRecent !== false;
  const timings = [];
  const { recentProspectCount } = await import('./cron-growth.js');
  let prospecting;
  const tProspect = Date.now();
  try {
    if (skipProspectingIfRecent) {
      const recent = await recentProspectCount(rest, 6);
      if (recent >= 5) {
        prospecting = { degraded: false, candidates: 0, saved: 0, skipped: recent, failed: 0, results: [], skipped_reason: `skip_grounded_discovery_recent_prospects_${recent}`, provider: 'none', fallback_used: false };
        timings.push({ step: 'discoverProspects', duration_ms: Date.now() - tProspect, status: 'skipped', provider: 'none', fallback_used: false });
      }
    }
    if (!prospecting) {
      prospecting = await discoverProspects();
      timings.push({ step: 'discoverProspects', duration_ms: Date.now() - tProspect, status: prospecting?.degraded ? 'degraded' : 'ok', provider: prospecting?.provider || 'gemini', fallback_used: Boolean(prospecting?.fallback_used) });
    }
  } catch (error) {
    prospecting = { degraded: true, candidates: 0, saved: 0, skipped: 0, failed: 0, results: [], error_code: error.code || 'GROWTH_FAILED', error_message: String(error.message || error).slice(0, 500), fallback_used: true };
    timings.push({ step: 'discoverProspects', duration_ms: Date.now() - tProspect, status: 'error', provider: error.provider || 'gemini', fallback_used: true });
  }
  let tasks;
  const tTasks = Date.now();
  try {
    tasks = await runQueuedTasks({ limit: taskLimit });
    timings.push({ step: 'runQueuedTasks', duration_ms: Date.now() - tTasks, status: tasks?.failed ? 'partial' : 'ok', provider: tasks?.runs?.[0]?.provider || null, fallback_used: Boolean((tasks?.runs || []).some(r => r.fallback_used)), completed: tasks?.completed, failed: tasks?.failed });
  } catch (error) {
    tasks = { due: 0, completed: 0, failed: 1, runs: [{ failed: true, error: String(error.message || error).slice(0, 500) }] };
    timings.push({ step: 'runQueuedTasks', duration_ms: Date.now() - tTasks, status: 'error', provider: null, fallback_used: false });
  }
  return { degraded: Boolean(prospecting?.degraded || tasks?.failed), prospecting, tasks, timings };
}
