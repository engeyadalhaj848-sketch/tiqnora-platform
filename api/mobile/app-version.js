/**
 * Public: get latest app version + force-update flag for a platform.
 * Query: ?platform=android|ios
 */
const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const platform = String(req.query?.platform || '').toLowerCase();
  if (!['android', 'ios'].includes(platform)) {
    return json(res, 400, { error: 'platform يجب أن يكون android أو ios' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_app_version`,
      {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_platform: platform })
      }
    );
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) {
      return json(res, 404, { error: 'لا توجد معلومات إصدار' });
    }
    return json(res, 200, { ok: true, ...data });
  } catch (err) {
    return json(res, 500, { error: 'خطأ في الخادم' });
  }
}
