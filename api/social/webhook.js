import { createHmac, timingSafeEqual } from 'node:crypto';

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function validMetaSignature(req, rawBody) {
  if (!process.env.META_APP_SECRET) return false;
  const supplied = String(req.headers['x-hub-signature-256'] || '');
  const expected = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex')}`;
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function normalizeMeta(payload) {
  const events = [];
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    if (!['comments', 'feed'].includes(change.field)) continue;
    const item = value.comment_id ? value : (value.item === 'comment' ? value : null);
    if (!item) continue;
    events.push({
      platform: payload.object === 'instagram' ? 'instagram' : 'facebook',
      event_type: item.verb === 'remove' ? 'comment.deleted' : 'comment.created',
      external_event_id: String(item.comment_id || item.id || `${entry.id}:${entry.time}`),
      external_parent_id: String(item.media_id || item.post_id || item.parent_id || ''),
      author_external_id: String(item.from?.id || item.sender_id || ''),
      author_name: item.from?.name || item.from?.username || item.sender_name || null,
      content: item.message || item.text || null,
      permalink: item.permalink_url || null,
      occurred_at: entry.time ? new Date(entry.time * 1000).toISOString() : new Date().toISOString(),
      raw_payload: { entry_id: entry.id, field: change.field, value }
    });
  }
  return events;
}

async function rest(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || `Supabase ${response.status}`);
  return body;
}

export default async function handler(req, res) {
  const platform = String(req.query?.platform || 'meta').toLowerCase();
  if (req.method === 'GET' && platform === 'meta') {
    const ok = req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN;
    return ok ? res.status(200).send(req.query['hub.challenge']) : send(res, 403, { error: 'Verification failed' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);
  if (platform === 'meta' && !validMetaSignature(req, rawBody)) return send(res, 401, { error: 'Invalid signature' });

  try {
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const organizations = await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
    const organizationId = organizations?.[0]?.id;
    if (!organizationId) throw new Error('Tiqnora organization is missing');
    const normalized = platform === 'meta' ? normalizeMeta(payload) : [];
    if (normalized.length) await rest('social_events?on_conflict=platform,external_event_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(normalized.map(event => ({ ...event, organization_id: organizationId })))
    });
    return send(res, 200, { received: true, events: normalized.length });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}
