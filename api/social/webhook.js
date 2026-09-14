import { createHmac, timingSafeEqual } from 'node:crypto';

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function validMetaSignature(req, rawBody) {
  if (!process.env.META_APP_SECRET) return false;
  const supplied = String(req.headers['x-hub-signature-256'] || '');
  const expected = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex')}`;
  return safeEqualText(supplied, expected);
}

function validGenericSignature(req) {
  const expected = process.env.SOCIAL_WEBHOOK_SHARED_SECRET || process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) return false;
  return safeEqualText(req.headers['x-tiqnora-webhook-secret'], expected);
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeMeta(payload) {
  const events = [];
  const object = String(payload?.object || '').toLowerCase();

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const field = String(change?.field || '').toLowerCase();
      const value = change?.value || {};
      if (!['comments', 'feed'].includes(field)) continue;

      const isInstagram = object === 'instagram' || field === 'comments';
      const platform = isInstagram ? 'instagram' : 'facebook';
      const isFacebookComment = value?.item === 'comment' || Boolean(value?.comment_id);
      const isInstagramComment = field === 'comments' && (value?.id || value?.comment_id);
      if (!isFacebookComment && !isInstagramComment) continue;

      const externalEventId = value?.comment_id || value?.id;
      if (!externalEventId) continue;

      const removed = ['remove', 'delete', 'deleted'].includes(String(value?.verb || value?.action || '').toLowerCase());
      events.push({
        platform,
        event_type: removed ? 'comment.deleted' : 'comment.created',
        external_event_id: String(externalEventId),
        external_parent_id: String(value?.media_id || value?.media?.id || value?.post_id || value?.parent_id || ''),
        author_external_id: String(value?.from?.id || value?.sender_id || value?.user_id || ''),
        author_name: value?.from?.name || value?.from?.username || value?.username || value?.sender_name || null,
        content: value?.message || value?.text || null,
        permalink: value?.permalink_url || value?.permalink || null,
        occurred_at: toIso(value?.created_time || value?.timestamp || entry?.time),
        account_external_id: String(entry?.id || ''),
        detected_intent: null,
        detected_intent_confidence: null,
        raw_payload: { adapter: 'meta', object, entry_id: entry?.id, field, value }
      });
    }
  }

  return events;
}

function normalizeWhatsApp(payload) {
  const events = [];
  for (const entry of payload?.entry || []) for (const change of entry?.changes || []) {
    const value = change?.value || {};
    const metadata = value.metadata || {};
    for (const message of value.messages || []) {
      const contact = (value.contacts || []).find(c => String(c.wa_id || '') === String(message.from || ''));
      const content = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || `[${message.type || 'message'}]`;
      events.push({ platform: 'whatsapp', event_type: 'message.received', external_event_id: String(message.id), author_external_id: String(message.from || ''), author_name: contact?.profile?.name || null, content, permalink: null, occurred_at: toIso(Number(message.timestamp || 0) * 1000), account_external_id: String(metadata.phone_number_id || ''), raw_payload: { adapter: 'whatsapp', entry_id: entry?.id, value, message } });
    }
  }
  return events;
}

function normalizeGeneric(platform, payload) {
  const source = Array.isArray(payload?.events) ? payload.events : [payload?.event || payload];
  return source.map((item) => {
    const externalEventId = item?.external_event_id || item?.id || item?.event_id;
    if (!externalEventId) return null;
    return {
      platform: String(item?.platform || platform || '').toLowerCase(),
      event_type: String(item?.event_type || item?.type || 'comment.created'),
      external_event_id: String(externalEventId),
      external_parent_id: item?.external_parent_id == null ? null : String(item.external_parent_id),
      author_external_id: item?.author_external_id == null ? null : String(item.author_external_id),
      author_name: item?.author_name || item?.author?.name || null,
      content: item?.content || item?.text || item?.message || null,
      permalink: item?.permalink || null,
      occurred_at: toIso(item?.occurred_at || item?.created_at || item?.timestamp),
      account_external_id: item?.account_external_id == null ? '' : String(item.account_external_id),
      detected_intent: item?.intent || null,
      detected_intent_confidence: Number.isFinite(Number(item?.intent_confidence)) ? Number(item.intent_confidence) : null,
      raw_payload: { adapter: 'generic', value: item }
    };
  }).filter(Boolean);
}

const ADAPTERS = {
  meta: { verify: validMetaSignature, normalize: normalizeMeta },
  facebook: { verify: validGenericSignature, normalize: (payload) => normalizeGeneric('facebook', payload) },
  instagram: { verify: validGenericSignature, normalize: (payload) => normalizeGeneric('instagram', payload) },
  linkedin: { verify: validGenericSignature, normalize: (payload) => normalizeGeneric('linkedin', payload) },
  tiktok: { verify: validGenericSignature, normalize: (payload) => normalizeGeneric('tiktok', payload) },
  snapchat: { verify: validGenericSignature, normalize: (payload) => normalizeGeneric('snapchat', payload) },
  x: { verify: validGenericSignature, normalize: (payload) => normalizeGeneric('x', payload) },
  whatsapp: { verify: validMetaSignature, normalize: normalizeWhatsApp }
};

function getAdapter(platform) {
  return ADAPTERS[platform] || { verify: validGenericSignature, normalize: (payload) => normalizeGeneric(platform, payload) };
}

async function rest(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.hint || `Supabase ${response.status}`);
  return body;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function platformAllowed(rule, platform) {
  return !Array.isArray(rule?.platforms) || rule.platforms.length === 0 || rule.platforms.map(x => String(x).toLowerCase()).includes(platform);
}

function eventTypeAllowed(rule, eventType) {
  return !Array.isArray(rule?.event_types) || rule.event_types.length === 0 || rule.event_types.includes(eventType);
}

function keywordScore(text, keyword, mode) {
  const word = normalizeText(keyword);
  if (!text || !word) return 0;
  if (mode === 'exact') return text === word ? 1 : 0;
  if (text.includes(word)) return 0.95;
  if (mode !== 'intent_or_keyword') return 0;

  const wanted = word.split(' ').filter(Boolean);
  const actual = new Set(text.split(' ').filter(Boolean));
  if (!wanted.length) return 0;
  const hits = wanted.filter(token => actual.has(token)).length;
  const ratio = hits / wanted.length;
  return ratio >= 0.67 ? 0.82 : 0;
}

function evaluateRule(rule, event) {
  if (!platformAllowed(rule, event.platform) || !eventTypeAllowed(rule, event.event_type)) return null;

  if (rule.match_mode === 'intent_or_keyword' && rule.intent && event.detected_intent === rule.intent) {
    return {
      rule,
      confidence: Math.max(0.7, Math.min(1, Number(event.detected_intent_confidence) || 0.9)),
      reason: 'adapter_intent'
    };
  }

  const text = normalizeText(event.content);
  const scores = (Array.isArray(rule.keywords) ? rule.keywords : []).map(word => keywordScore(text, word, rule.match_mode));
  const confidence = Math.max(0, ...scores);
  return confidence > 0 ? { rule, confidence, reason: rule.match_mode === 'intent_or_keyword' ? 'keyword_or_fuzzy' : rule.match_mode } : null;
}

function sourceFor(event) {
  if (String(event.event_type || '').startsWith('comment.')) return `${event.platform}_comment`;
  return `${event.platform}_social`;
}

function toDbEvent(event, organizationId, connectionId) {
  return {
    organization_id: organizationId,
    connection_id: connectionId || null,
    platform: event.platform,
    event_type: event.event_type,
    external_event_id: event.external_event_id,
    external_parent_id: event.external_parent_id || null,
    author_external_id: event.author_external_id || null,
    author_name: event.author_name || null,
    content: event.content || null,
    permalink: event.permalink || null,
    occurred_at: event.occurred_at || new Date().toISOString(),
    raw_payload: event.raw_payload || {}
  };
}

async function findConnectionId(organizationId, event) {
  if (!event.account_external_id) return null;
  const rows = await rest(`social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.${encodeURIComponent(event.platform)}&external_account_id=eq.${encodeURIComponent(event.account_external_id)}&select=id&limit=1`);
  return rows?.[0]?.id || null;
}

async function createActionOnce({ organizationId, eventId, ruleId = null, actionType, status = 'completed', result = {} }) {
  const existing = await rest(`social_event_actions?event_id=eq.${encodeURIComponent(eventId)}&action_type=eq.${encodeURIComponent(actionType)}&select=id&limit=1`);
  if (existing?.length) return false;
  await rest('social_event_actions', {
    method: 'POST',
    body: JSON.stringify({ organization_id: organizationId, event_id: eventId, rule_id: ruleId, action_type: actionType, status, result })
  });
  return true;
}

async function processEvent(event, storedEvent, organizationId, rules) {
  const matches = rules.map(rule => evaluateRule(rule, event)).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  const match = matches[0];

  if (!match) {
    if (storedEvent.processing_status === 'new') {
      await rest(`social_events?id=eq.${encodeURIComponent(storedEvent.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ processing_status: 'ignored' })
      });
    }
    return { matched: false };
  }

  const { rule, confidence, reason } = match;
  await rest(`social_events?id=eq.${encodeURIComponent(storedEvent.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ intent: rule.intent || null, intent_confidence: confidence, processing_status: 'matched' })
  });

  await createActionOnce({
    organizationId,
    eventId: storedEvent.id,
    ruleId: rule.id,
    actionType: 'rule_match',
    result: { intent: rule.intent || null, confidence, reason }
  });

  if (rule.create_lead) {
    const syntheticEmail = `social:${event.platform}:${event.external_event_id}`;
    const existingLeads = await rest(`leads?email=eq.${encodeURIComponent(syntheticEmail)}&select=id&limit=1`);
    if (!existingLeads?.length) {
      await rest('leads', {
        method: 'POST',
        body: JSON.stringify({
          name: event.author_name || 'Social contact',
          email: syntheticEmail,
          message: event.content || '',
          source: sourceFor(event),
          status: 'new'
        })
      });
    }
  }

  if (rule.auto_reply && rule.reply_template) {
    const text = String(rule.reply_template).replaceAll('{{author_name}}', event.author_name || '');
    await createActionOnce({
      organizationId,
      eventId: storedEvent.id,
      ruleId: rule.id,
      actionType: 'auto_reply',
      status: 'pending',
      result: { text, platform: event.platform, external_event_id: event.external_event_id }
    });
  }

  return { matched: true, intent: rule.intent || null, confidence };
}

export default async function handler(req, res) {
  const platform = String(req.query?.platform || 'meta').toLowerCase();

  if (req.method === 'GET' && ['meta', 'whatsapp'].includes(platform)) {
    const ok = req.query['hub.mode'] === 'subscribe' && safeEqualText(req.query['hub.verify_token'], process.env.META_WEBHOOK_VERIFY_TOKEN);
    return ok ? res.status(200).send(req.query['hub.challenge']) : send(res, 403, { error: 'Verification failed' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);
  const adapter = getAdapter(platform);
  const verified = platform === 'meta' ? adapter.verify(req, rawBody) : adapter.verify(req);
  if (!verified) return send(res, 401, { error: 'Invalid webhook signature' });

  try {
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const organizations = await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
    const organizationId = organizations?.[0]?.id;
    if (!organizationId) throw new Error('Tiqnora organization is missing');

    const rules = await rest(`social_automation_rules?organization_id=eq.${encodeURIComponent(organizationId)}&is_active=eq.true&select=*`);
    const normalized = adapter.normalize(payload);
    let matched = 0;
    let insertedCount = 0;
    let duplicateCount = 0;
    let ignored = 0;

    for (const event of normalized) {
      if (!event.platform || !event.external_event_id) continue;
      const connectionId = await findConnectionId(organizationId, event);
      const inserted = await rest('social_events?on_conflict=platform,external_event_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(toDbEvent(event, organizationId, connectionId))
      });

      const storedEvent = inserted?.[0];
      if (!storedEvent) {
        duplicateCount += 1;
        continue;
      }
      insertedCount += 1;

      const result = await processEvent(event, storedEvent, organizationId, rules || []);
      if (result.matched) matched += 1;
      else ignored += 1;
    }

    return send(res, 200, {
      received: true,
      adapter: platform,
      events: normalized.length,
      inserted: insertedCount,
      duplicates: duplicateCount,
      matched,
      ignored
    });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}
