/**
 * GET  /api/actions?status=pending_approval&limit=50
 * POST /api/actions  — create draft/pending action
 */
import { createAction, listActions } from '../../lib/actions/engine.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

async function tiqnoraOrgId() {
  const key = SERVICE || ANON;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/organizations?slug=eq.tiqnora&select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.id || null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const profile = await requireAdmin(req);
  if (!profile) return json(res, 401, { error: 'Unauthorized' });

  try {
    const organizationId = req.body?.organization_id || req.query?.organization_id || (await tiqnoraOrgId());
    if (!organizationId) return json(res, 500, { error: 'Organization missing' });

    if (req.method === 'GET') {
      const status = req.query?.status || null;
      const limit = Math.min(parseInt(req.query?.limit || '50', 10) || 50, 200);
      const actions = await listActions({ organizationId, status, limit });
      return json(res, 200, { actions: actions || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.action_type) return json(res, 400, { error: 'action_type required' });
      const action = await createAction({
        organizationId,
        actionType: body.action_type,
        payload: body.payload || {},
        relatedEntityType: body.related_entity_type || null,
        relatedEntityId: body.related_entity_id || null,
        leadId: body.lead_id || null,
        conversationId: body.conversation_id || null,
        createdBy: profile.id,
        requiresApproval: body.requires_approval !== false,
        status: body.status || null
      });
      return json(res, 201, { action });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'Error', code: e.code });
  }
}
