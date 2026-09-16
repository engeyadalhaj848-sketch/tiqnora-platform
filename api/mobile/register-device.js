/**
 * Mobile: register / refresh FCM or APNs device token.
 * Requires Authorization: Bearer <supabase_jwt>
 * Body: { token: string, device_type: 'android'|'ios'|'web', device_info?: object }
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(204).end();
  }

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

  if (!deviceToken || deviceToken.length < 20) {
    return json(res, 400, { error: 'رمز الجهاز غير صالح' });
  }
  if (!['android', 'ios', 'web'].includes(deviceType)) {
    return json(res, 400, { error: 'device_type يجب أن يكون android أو ios أو web' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  try {
    const rpcRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/register_device_token`,
      {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          p_token: deviceToken,
          p_device_type: deviceType,
          p_device_info: deviceInfo
        })
      }
    );

    const data = await rpcRes.json().catch(() => null);

    if (!rpcRes.ok) {
      const msg = data?.message || data?.error || `RPC ${rpcRes.status}`;
      return json(res, rpcRes.status === 401 ? 401 : 400, { error: msg });
    }

    return json(res, 200, {
      ok: true,
      id: data,
      message: 'تم تسجيل الجهاز بنجاح'
    });
  } catch (err) {
    return json(res, 500, { error: 'خطأ في الخادم', detail: String(err.message || err) });
  }
}
