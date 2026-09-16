/** Public Sales AI — limited to sales agent only, no admin required. */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

async function callGemini(system, message, model) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Gemini not configured'), { status: 503 });
  const m = model?.startsWith('gemini-') ? model : (process.env.GEMINI_MODEL || 'gemini-3.6-flash');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1200 }
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'Gemini failed'), { status: 502 });
  return (payload.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > 4000) return json(res, 400, { error: 'رسالة غير صالحة' });

  const key = SERVICE || ANON;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?slug=eq.sales&is_enabled=eq.true&select=system_prompt_ar,system_prompt_en,model,temperature&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const agents = await r.json();
    const agent = Array.isArray(agents) ? agents[0] : null;
    const system = agent?.system_prompt_ar || agent?.system_prompt_en ||
      'أنت مساعد مبيعات Tiqnora AI. اشرح الخدمات والباقات بالعربية واقترح التسجيل في /customer أو ترك بيانات التواصل.';
    const reply = await callGemini(system, message, agent?.model);
    if (!reply) return json(res, 502, { error: 'رد فارغ' });
    return json(res, 200, { reply, model: agent?.model || 'gemini' });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'خطأ' });
  }
}
