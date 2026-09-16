/** Returns which AI providers have server-side keys configured. Never returns key values. */
function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function requireAdmin(token) {
  const url = (process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  const profRes = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,is_active`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  const profiles = await profRes.json().catch(() => []);
  const profile = profiles?.[0];
  if (!profile || !profile.is_active || !['admin', 'super_admin'].includes(profile.role)) return null;
  return user;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const token = bearer(req);
  if (!token) return json(res, 401, { error: 'يلزم تسجيل الدخول.' });
  const user = await requireAdmin(token);
  if (!user) return json(res, 403, { error: 'صلاحية أدمن مطلوبة.' });

  const providers = [
    {
      id: 'google_ai',
      name: 'Google Gemini',
      configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
      defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      envVars: ['GEMINI_API_KEY', 'GEMINI_MODEL']
    },
    {
      id: 'openai',
      name: 'OpenAI',
      configured: Boolean(process.env.OPENAI_API_KEY),
      defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      envVars: ['OPENAI_API_KEY', 'OPENAI_MODEL']
    },
    {
      id: 'anthropic',
      name: 'Claude (Anthropic)',
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
      envVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL']
    },
    {
      id: 'xai',
      name: 'Grok (xAI)',
      configured: Boolean(process.env.XAI_API_KEY),
      defaultModel: process.env.XAI_MODEL || 'grok-3-mini',
      envVars: ['XAI_API_KEY', 'XAI_MODEL']
    }
  ];

  return json(res, 200, {
    providers,
    anyConfigured: providers.some(p => p.configured),
    note: 'المفاتيح تُدار فقط من Vercel Environment Variables ولا تُعرض هنا.'
  });
}
