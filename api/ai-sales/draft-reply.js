/**
 * POST /api/ai-sales/draft-reply
 * Body: { lead_id?, conversation_id?, message? }
 * Loads lead + recent messages, runs Sales Agent, creates pending_approval action with draft.
 * Never sends to customer.
 */
import { generateSalesReply, classifyIntent } from '../../lib/ai/provider.js';
import { createAction } from '../../lib/actions/engine.js';

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
  return { profile, token };
}

function key() {
  return SERVICE || ANON;
}

async function sbGet(path, token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: key(),
      Authorization: `Bearer ${SERVICE || token}`
    }
  });
  return r.json().catch(() => null);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await requireAdmin(req);
  if (!auth) return json(res, 401, { error: 'Unauthorized' });

  try {
    const { lead_id, conversation_id, message, language = 'ar' } = req.body || {};
    let lead = null;
    let messages = [];
    let organizationId = null;

    if (lead_id) {
      const rows = await sbGet(`leads?id=eq.${lead_id}&select=*&limit=1`, auth.token);
      lead = Array.isArray(rows) ? rows[0] : null;
      if (lead?.organization_id) organizationId = lead.organization_id;
    }

    if (conversation_id) {
      const convRows = await sbGet(`conversations?id=eq.${conversation_id}&select=*&limit=1`, auth.token);
      const conv = Array.isArray(convRows) ? convRows[0] : null;
      if (conv) {
        organizationId = organizationId || conv.organization_id;
        if (!lead && conv.lead_id) {
          const lr = await sbGet(`leads?id=eq.${conv.lead_id}&select=*&limit=1`, auth.token);
          lead = Array.isArray(lr) ? lr[0] : null;
        }
        const msgRows = await sbGet(
          `messages?conversation_id=eq.${conversation_id}&select=direction,body,created_at&order=created_at.asc&limit=20`,
          auth.token
        );
        messages = Array.isArray(msgRows) ? msgRows : [];
      }
    }

    if (message && String(message).trim()) {
      messages = [...messages, { direction: 'inbound', body: String(message).trim() }];
    }

    if (!organizationId) {
      const orgs = await sbGet('organizations?slug=eq.tiqnora&select=id&limit=1', auth.token);
      organizationId = orgs?.[0]?.id;
    }
    if (!organizationId) return json(res, 500, { error: 'Organization missing' });

    // Optional intent on last inbound
    let intentResult = null;
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');
    if (lastInbound?.body) {
      try {
        intentResult = await classifyIntent({ text: lastInbound.body, language });
      } catch {
        intentResult = null;
      }
    }

    const sales = await generateSalesReply({
      lead: lead || {},
      messages,
      language
    });

    // Create pending approval action — never auto-send
    const platformHint = req.body?.platform || 'whatsapp';
    const actionType =
      platformHint === 'instagram' ? 'send_instagram_dm' :
      platformHint === 'facebook' ? 'send_facebook_message' :
      'send_whatsapp';

    const action = await createAction({
      organizationId,
      actionType,
      payload: {
        reply_draft: sales.reply_draft,
        qualification: sales.qualification,
        next_best_action: sales.next_best_action,
        suggested_stage: sales.suggested_stage,
        internal_summary: sales.internal_summary,
        intent: intentResult,
        model: sales.model,
        provider: sales.provider
      },
      relatedEntityType: lead ? 'lead' : conversation_id ? 'conversation' : null,
      relatedEntityId: lead?.id || conversation_id || null,
      leadId: lead?.id || null,
      conversationId: conversation_id || null,
      createdBy: auth.profile.id,
      requiresApproval: true
    });

    return json(res, 200, {
      action,
      draft: sales.reply_draft,
      qualification: sales.qualification,
      next_best_action: sales.next_best_action,
      suggested_stage: sales.suggested_stage,
      internal_summary: sales.internal_summary,
      intent: intentResult,
      model: sales.model
    });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'Error', code: e.code });
  }
}
