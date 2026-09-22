/**
 * Mobile endpoints — single function: /api/mobile/app-version | /api/mobile/register-device
 */
const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

function json(res, status, payload, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', cache || 'no-store');
  return res.end(JSON.stringify(payload));
}

function bearer(req) {
  const v = req.headers.authorization || '';
  return v.startsWith('Bearer ') ? v.slice(7) : '';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(204).end();
  }

  const action = String(req.query?.action || '').toLowerCase();
  const supabaseUrl = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  // GET health (merged to stay under Hobby 12-function limit)
  if (action === 'health') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method' });
    const checks = { api: true, supabase: false, gemini: !!process.env.GEMINI_API_KEY, telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) };
    let latencyMs = null;
    try {
      const t0 = Date.now();
      const r = await fetch(`${supabaseUrl}/rest/v1/saas_plans?select=slug&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` }
      });
      latencyMs = Date.now() - t0;
      checks.supabase = r.ok || r.status === 401 || r.status === 200;
      if (r.status >= 500) checks.supabase = false;
    } catch {
      checks.supabase = false;
    }
    const ok = checks.api && checks.supabase;
    return json(res, ok ? 200 : 503, {
      ok,
      service: 'tiqnora-ai',
      time: new Date().toISOString(),
      checks,
      latencyMs,
      version: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      deploy_probe: true,
      whop_fix: true
    });
  }

  // GET app-version
  if (action === 'app-version' || (req.method === 'GET' && !action)) {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const platform = String(req.query?.platform || '').toLowerCase();
    if (!['android', 'ios'].includes(platform)) {
      return json(res, 400, { error: 'platform يجب أن يكون android أو ios' });
    }
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/get_app_version`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_platform: platform }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) return json(res, 404, { error: 'لا توجد معلومات إصدار' });
      return json(res, 200, { ok: true, ...data }, 'public, max-age=300');
    } catch {
      return json(res, 500, { error: 'خطأ في الخادم' });
    }
  }

  // POST register-device
  if (action === 'register-device' || req.method === 'POST') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const token = bearer(req);
    if (!token) return json(res, 401, { error: 'مطلوب تسجيل الدخول' });
    let body = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
      return json(res, 400, { error: 'JSON غير صالح' });
    }
    const deviceToken = (body.token || '').trim();
    const deviceType = (body.device_type || '').toLowerCase();
    const deviceInfo = body.device_info && typeof body.device_info === 'object' ? body.device_info : {};
    if (!deviceToken || deviceToken.length < 20) return json(res, 400, { error: 'رمز الجهاز غير صالح' });
    if (!['android', 'ios', 'web'].includes(deviceType)) {
      return json(res, 400, { error: 'device_type يجب أن يكون android أو ios أو web' });
    }
    try {
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/register_device_token`, {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ p_token: deviceToken, p_device_type: deviceType, p_device_info: deviceInfo }),
      });
      const data = await rpcRes.json().catch(() => null);
      if (!rpcRes.ok) {
        return json(res, rpcRes.status === 401 ? 401 : 400, { error: data?.message || data?.error || 'RPC error' });
      }
      return json(res, 200, { ok: true, id: data, message: 'تم تسجيل الجهاز بنجاح' });
    } catch (err) {
      return json(res, 500, { error: 'خطأ في الخادم', detail: String(err.message || err) });
    }
  }

  return json(res, 404, { error: 'Unknown mobile action' });
}
