/**
 * Customer AI chat — authenticated, plan-limited, uses same providers as workforce.
 * Does not expose admin-only agent tables to the client.
 */
const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function bearer(req) {
  const v = req.headers.authorization || '';
  return v.startsWith('Bearer ') ? v.slice(7) : '';
}

async function sb(path, token, options = {}) {
  const url = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.message || data?.error_description || data?.error || `DB ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function sbService(path, options = {}) {
  const url = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.message || `Service DB ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function callGemini(model, system, messages) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('مزود Gemini غير مُعد على الخادم.'), { status: 503 });
  const m = (model && model.startsWith('gemini-')) ? model : (process.env.GEMINI_MODEL || 'gemini-3.6-flash');
  const contents = messages.filter(x => x.role !== 'system').map(x => ({
    role: x.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: x.content }]
  }));
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `Gemini ${response.status}`), { status: 502 });
  const text = (payload.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
  return { text, model: m };
}

const AGENT_PROMPTS = {
  marketing: 'You are Tiqnora Marketing AI for a Saudi/GCC customer. Give practical marketing advice in Arabic unless asked otherwise.',
  content: 'You are Tiqnora Content AI. Write clear bilingual-capable marketing and web copy. Prefer Arabic for Saudi audiences.',
  'social-media': 'You are Tiqnora Social Media AI. Propose posts and calendars for Instagram, LinkedIn, TikTok, X for Saudi businesses.',
  developer: 'You are Tiqnora technical assistant. Explain tech clearly without claiming you executed server actions.',
  commerce: 'You are Tiqnora Commerce AI. Advise on product positioning and e-commerce — never place supplier orders.'
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const token = bearer(req);
  if (!token) return json(res, 401, { error: 'يلزم تسجيل الدخول.' });

  const message = String(req.body?.message || '').trim();
  const agentSlug = String(req.body?.agentSlug || 'marketing').trim();
  if (!message || message.length > 8000) return json(res, 400, { error: 'رسالة غير صالحة.' });
  if (!AGENT_PROMPTS[agentSlug]) return json(res, 400, { error: 'وكيل غير معروف.' });

  try {
    const userRows = await sb('/auth/v1/user', token).catch(() => null);
    // /auth/v1/user returns user object not array
    const userRes = await fetch(`${(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    });
    const user = await userRes.json();
    if (!userRes.ok || !user?.id) return json(res, 401, { error: 'جلسة غير صالحة.' });

    // Ensure org via RPC
    const orgId = (await sb('/rest/v1/rpc/ensure_customer_organization', token, {
      method: 'POST', body: JSON.stringify({ org_name: null })
    }));

    const subs = await sb(
      `/rest/v1/subscriptions?organization_id=eq.${encodeURIComponent(orgId)}&select=*,saas_plans(*)`,
      token
    );
    const sub = subs?.[0];
    const plan = sub?.saas_plans;
    const limit = plan?.ai_requests_monthly ?? 20;
    const maxAgents = plan?.max_agents ?? 1;
    const allowed = ['marketing', 'content', 'social-media', 'developer', 'commerce'].slice(0, Math.max(1, maxAgents));
    if (!allowed.includes(agentSlug)) return json(res, 403, { error: 'هذا الوكيل غير متاح في خطتك.' });

    const ym = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
    const period = `${ym.getFullYear()}-${String(ym.getMonth() + 1).padStart(2, '0')}`;
    const meters = await sb(
      `/rest/v1/usage_meters?organization_id=eq.${encodeURIComponent(orgId)}&period_ym=eq.${period}&select=ai_requests`,
      token
    );
    const used = meters?.[0]?.ai_requests || 0;
    if (used >= limit) return json(res, 429, { error: 'وصلت للحد الشهري لخطتك. رقِّ الاشتراك.' });

    const system = AGENT_PROMPTS[agentSlug];
    const { text, model } = await callGemini(process.env.GEMINI_MODEL || 'gemini-3.6-flash', system, [
      { role: 'user', content: message }
    ]);
    if (!text) return json(res, 502, { error: 'رد فارغ من المزود.' });

    await sb('/rest/v1/rpc/increment_ai_usage', token, {
      method: 'POST', body: JSON.stringify({ org_id: orgId })
    }).catch(() => {});

    // Optional: store conversation against Tiqnora agents if accessible
    try {
      const agents = await sbService(`/rest/v1/ai_agents?slug=eq.${encodeURIComponent(agentSlug)}&select=id,organization_id&limit=1`);
      const agent = agents?.[0];
      if (agent) {
        await sbService('/rest/v1/ai_conversations', {
          method: 'POST',
          body: JSON.stringify({
            organization_id: agent.organization_id,
            agent_id: agent.id,
            user_id: user.id,
            message,
            response: text,
            provider: 'google_ai',
            model,
            status: 'completed'
          })
        });
      }
    } catch (_) { /* non-fatal */ }

    return json(res, 200, { reply: text, model, usage: { used: used + 1, limit } });
  } catch (error) {
    return json(res, error.status && error.status < 600 ? error.status : 500, { error: error.message || 'خطأ غير متوقع' });
  }
}
