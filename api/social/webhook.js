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

function matchesRule(rule, content) {
  const text = String(content || '').trim().toLocaleLowerCase('ar');
  const words = Array.isArray(rule.keywords) ? rule.keywords.map(x => String(x).trim().toLocaleLowerCase('ar')).filter(Boolean) : [];
  if (!text || !words.length) return false;
  if (rule.match_mode === 'exact') return words.some(word => text === word);
  return words.some(word => rule.match_mode === 'contains' ? text.includes(word) : text.includes(word));
}

function platformAllowed(rule, platform) {
  return !Array.isArray(rule.platforms) || rule.platforms.length === 0 || rule.platforms.map(x => String(x).toLowerCase()).includes(platform);
}

async function processEvent(event, organizationId) {
  const rules = await rest(`social_automation_rules?organization_id=eq.${encodeURIComponent(organizationId)}&is_active=eq.true&select=*`);
  const rule = (rules || []).find(r =>
    platformAllowed(r, event.platform) &&
    (!Array.isArray(r.event_types) || r.event_types.length === 0 || r.event_types.includes(event.event_type)) &&
    matchesRule(r, event.content)
  );
  if (!rule) return { matched: false };

  const confidence = rule.match_mode === 'exact' ? 1 : 0.95;
  const updated = await rest(`social_events?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.${encodeURIComponent(event.platform)}&external_event_id=eq.${encodeURIComponent(event.external_event_id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ intent: rule.intent || null, intent_confidence: confidence, processing_status: 'matched' })
  });
  const eventId = updated?.[0]?.id;
  if (!eventId) return { matched: false };

  const existingActions = await rest(`social_event_actions?event_id=eq.${encodeURIComponent(eventId)}&action_type=eq.rule_match&select=id&limit=1`);
  if (!existingActions?.length) {
    await rest('social_event_actions', { method: 'POST', body: JSON.stringify({ organization_id: organizationId, event_id: eventId, rule_id: rule.id, action_type: 'rule_match', status: 'completed', result: { intent: rule.intent, confidence } }) });
  }

  if (rule.create_lead) {
    const existingLeads = await rest(`leads?email=eq.${encodeURIComponent(`social:${event.platform}:${event.external_event_id}`)}&select=id&limit=1`);
    if (!existingLeads?.length) {
      await rest('leads', { method: 'POST', body: JSON.stringify({ name: event.author_name || 'Social contact', email: `social:${event.platform}:${event.external_event_id}`, message: event.content || '', source: `${event.platform}_comment`, status: 'new' }) });
    }
  }

  if (rule.auto_reply && rule.reply_template) {
    const template = String(rule.reply_template).replaceAll('{{author_name}}', event.author_name || '');
    const existingReply = await rest(`social_event_actions?event_id=eq.${encodeURIComponent(eventId)}&action_type=eq.auto_reply&select=id&limit=1`);
    if (!existingReply?.length) await rest('social_event_actions', { method: 'POST', body: JSON.stringify({ organization_id: organizationId, event_id: eventId, rule_id: rule.id, action_type: 'auto_reply', status: 'pending', result: { text: template, platform: event.platform } }) });
  }
  return { matched: true, intent: rule.intent || null };
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
    let matched = 0;
    if (normalized.length) {
      const inserted = await rest('social_events?on_conflict=platform,external_event_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(normalized.map(event => ({ ...event, organization_id: organizationId })))
      });
      for (const event of (inserted || [])) {
        const result = await processEvent(event, organizationId);
        if (result.matched) matched += 1;
      }
    }
    return send(res, 200, { received: true, events: normalized.length, matched });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}
