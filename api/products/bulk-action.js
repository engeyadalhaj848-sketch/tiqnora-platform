/** Bulk product actions for Admin — Hobby-safe single endpoint */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.end(JSON.stringify(payload));
}

async function verifyAdmin(authHeader) {
  if (!SERVICE) return { ok: false, status: 503, error: 'server_not_configured' };
  const match = String(authHeader || '').match(/^Bearer\s+(.+)$/i);
  const token = match?.[1] || '';
  if (!token) return { ok: false, status: 401, error: 'admin_auth_required' };

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE },
    });
    const user = await r.json().catch(() => null);
    if (!r.ok || !user?.id) return { ok: false, status: 401, error: 'invalid_admin_session' };

    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,is_active&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    if (!pr.ok) return { ok: false, status: 503, error: 'admin_profile_unavailable' };
    const rows = await pr.json().catch(() => []);
    const profile = Array.isArray(rows) ? rows[0] : null;
    const role = String(profile?.role || '');
    if (!profile || profile.is_active === false || !['admin', 'super_admin'].includes(role)) {
      return { ok: false, status: 403, error: 'admin_permission_required' };
    }
    return { ok: true, user, role };
  } catch {
    return { ok: false, status: 503, error: 'admin_auth_unavailable' };
  }
}

async function sbPatch(ids, body) {
  if (!SERVICE) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY missing'), { status: 503 });
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/products?id=in.(${ids.map(encodeURIComponent).join(',')})`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    }
  );
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw Object.assign(new Error((data && data.message) || data || 'update failed'), { status: r.status });
  return Array.isArray(data) ? data : [];
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const action = String(body.action || '').toLowerCase();
  const productIds = Array.isArray(body.product_ids) ? body.product_ids.filter(Boolean) : [];

  if (!productIds.length) return json(res, 400, { error: 'product_ids required' });
  if (productIds.length > 200) return json(res, 400, { error: 'max 200 products per request' });

  const allowed = ['publish', 'unpublish', 'update_category', 'assign_supplier', 'add_tags', 'change_status'];
  if (!allowed.includes(action)) return json(res, 400, { error: 'invalid action', allowed });

  try {
    const admin = await verifyAdmin(req.headers.authorization || '');
    if (!admin.ok) return json(res, admin.status, { error: admin.error });

    let patch = null;
    if (action === 'publish') patch = { is_active: true };
    else if (action === 'unpublish') patch = { is_active: false };
    else if (action === 'update_category') {
      if (!body.category_id) return json(res, 400, { error: 'category_id required' });
      patch = { category_id: body.category_id };
    } else if (action === 'assign_supplier') {
      if (body.supplier_name == null || String(body.supplier_name).trim() === '') {
        return json(res, 400, { error: 'supplier_name required' });
      }
      patch = { supplier_name: String(body.supplier_name).trim() };
    } else if (action === 'add_tags') {
      if (!Array.isArray(body.campaign_tags)) return json(res, 400, { error: 'campaign_tags array required' });
      patch = { campaign_tags: body.campaign_tags.map(String) };
    } else if (action === 'change_status') {
      const st = String(body.status || '').toLowerCase();
      if (st === 'published' || st === 'live' || st === 'active') patch = { is_active: true };
      else if (st === 'draft' || st === 'hidden' || st === 'inactive') patch = { is_active: false };
      else return json(res, 400, { error: 'status must be published or draft' });
    }

    const updated = await sbPatch(productIds, patch);
    return json(res, 200, {
      ok: true,
      action,
      requested: productIds.length,
      updated: updated.length,
      ids: updated.map((r) => r.id),
      disclaimer: 'Bulk admin action — no auto-purchase.',
    });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
  }
}
