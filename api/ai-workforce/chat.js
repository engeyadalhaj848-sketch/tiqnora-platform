const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function supabase(path, token, options = {}) {
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || `Database request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function memoryContext(rows) {
  if (!rows?.length) return 'No saved company memory is available for this agent.';
  return `Saved Tiqnora company memory:\n${rows.map(row => `- ${row.memory_key}: ${row.memory_value}`).join('\n')}`;
}

async function callOpenAI(agent, messages) {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('لم يتم إعداد OPENAI_API_KEY في Vercel بعد.'), { status: 503 });
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: agent.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: Number(agent.temperature ?? 0.7),
      messages
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `OpenAI request failed (${response.status})`), { status: 502 });
  return { text: payload.choices?.[0]?.message?.content || '', model: payload.model || agent.model };
}

async function callAnthropic(agent, messages) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('لم يتم إعداد ANTHROPIC_API_KEY في Vercel بعد.'), { status: 503 });
  const system = messages.find(m => m.role === 'system')?.content || '';
  const conversation = messages.filter(m => m.role !== 'system');
  const model = agent.model?.startsWith('claude-') ? agent.model : (process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, system, messages: conversation, max_tokens: 2048, temperature: Number(agent.temperature ?? 0.7) })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `Anthropic request failed (${response.status})`), { status: 502 });
  return { text: (payload.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n'), model: payload.model || model };
}

async function callGemini(agent, messages) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) throw Object.assign(new Error('لم يتم إعداد GEMINI_API_KEY في Vercel بعد.'), { status: 503 });
  const model = agent.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const system = messages.find(m => m.role === 'system')?.content || '';
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }]
  }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: Number(agent.temperature ?? 0.7) } })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `Gemini request failed (${response.status})`), { status: 502 });
  return { text: payload.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '', model: payload.modelVersion || model };
}

async function saveConversation(token, row) {
  const data = await supabase('/rest/v1/ai_conversations?select=*', token, {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
  });
  return data?.[0];
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const token = bearer(req);
  if (!token) return json(res, 401, { error: 'يلزم تسجيل الدخول.' });
  const agentId = String(req.body?.agentId || '');
  const message = String(req.body?.message || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) return json(res, 400, { error: 'معرّف الموظف غير صالح.' });
  if (!message || message.length > 20000) return json(res, 400, { error: 'يجب أن تكون الرسالة بين 1 و20000 حرف.' });

  let user, agent;
  try {
    user = await supabase('/auth/v1/user', token);
    const profiles = await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active`, token);
    const profile = profiles?.[0];
    if (!profile || !profile.is_active || !['admin','super_admin'].includes(profile.role)) return json(res, 403, { error: 'لا تملك صلاحية استخدام فريق العمل الذكي.' });
    const agents = await supabase(`/rest/v1/ai_agents?id=eq.${encodeURIComponent(agentId)}&select=*`, token);
    agent = agents?.[0];
    if (!agent || agent.status !== 'active' || !agent.is_enabled) return json(res, 404, { error: 'الموظف غير موجود أو غير نشط.' });

    const [memory, recent] = await Promise.all([
      supabase(`/rest/v1/ai_memory?agent_id=eq.${encodeURIComponent(agentId)}&select=memory_key,memory_value&order=created_at.desc&limit=30`, token),
      supabase(`/rest/v1/ai_conversations?agent_id=eq.${encodeURIComponent(agentId)}&select=message,response&status=eq.completed&order=created_at.desc&limit=8`, token)
    ]);
    const history = (recent || []).reverse().flatMap(row => [
      { role: 'user', content: row.message },
      ...(row.response ? [{ role: 'assistant', content: row.response }] : [])
    ]);
    const messages = [
      { role: 'system', content: `${agent.system_prompt || agent.description || ''}\n\n${memoryContext(memory)}` },
      ...history,
      { role: 'user', content: message }
    ];
    const requestedProvider = String(agent.provider || 'openai').toLowerCase();
    const provider = ['google_ai', 'gemini', 'google'].includes(requestedProvider)
      ? 'google_ai'
      : requestedProvider === 'anthropic' ? 'anthropic' : (requestedProvider === 'openai' && !process.env.OPENAI_API_KEY && (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) ? 'google_ai' : 'openai');
    const result = provider === 'anthropic' ? await callAnthropic(agent, messages) : provider === 'google_ai' ? await callGemini(agent, messages) : await callOpenAI(agent, messages);
    if (!result.text) throw Object.assign(new Error('عاد المزود برد فارغ.'), { status: 502 });
    const conversation = await saveConversation(token, {
      organization_id: agent.organization_id, agent_id: agent.id, user_id: user.id,
      message, response: result.text, provider, model: result.model, status: 'completed'
    });
    return json(res, 200, { conversation });
  } catch (error) {
    if (agent && user) {
      await saveConversation(token, {
        organization_id: agent.organization_id, agent_id: agent.id, user_id: user.id,
        message, response: null, provider: agent.provider, model: agent.model,
        status: 'failed', error_message: String(error.message).slice(0, 1000)
      }).catch(() => {});
    }
    return json(res, error.status && error.status < 600 ? error.status : 500, { error: error.message || 'حدث خطأ غير متوقع.' });
  }
}
