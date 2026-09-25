/**
 * GET /api/actions/:id
 * POST /api/actions/:id  body: { op: 'approve'|'reject'|'execute', reason? }
 * Requires admin session (Bearer Supabase JWT).
 */
import {
  getAction,
  approveAction,
  rejectAction,
  executeAction
} from '../../lib/actions/engine.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

async function requireAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON }
  });
  if (!r.ok) return null;
  const user = await r.json();
  const pr = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role,is_active&limit=1`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }
  );
  const profiles = await pr.json().catch(() => []);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile || !profile.is_active || !['admin', 'super_admin'].includes(profile.role)) return null;
  return profile;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const profile = await requireAdmin(req);
  if (!profile) return json(res, 401, { error: 'Unauthorized' });

  const id = req.query?.id || req.query?.actionId;
  if (!id) return json(res, 400, { error: 'id required' });

  try {
    if (req.method === 'GET') {
      const action = await getAction(id);
      if (!action) return json(res, 404, { error: 'Not found' });
      return json(res, 200, { action });
    }

    if (req.method === 'POST') {
      const op = String(req.body?.op || '').toLowerCase();
      if (op === 'approve') {
        const action = await approveAction({
          actionId: id,
          approvedBy: profile.id,
          autoExecute: Boolean(req.body?.autoExecute)
        });
        return json(res, 200, { action });
      }
      if (op === 'reject') {
        const action = await rejectAction({
          actionId: id,
          approvedBy: profile.id,
          reason: req.body?.reason || ''
        });
        return json(res, 200, { action });
      }
      if (op === 'execute') {
        const action = await executeAction({ actionId: id });
        return json(res, 200, { action });
      }
      return json(res, 400, { error: 'op must be approve|reject|execute' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'Error', code: e.code });
  }
}
