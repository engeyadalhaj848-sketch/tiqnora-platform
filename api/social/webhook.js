import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

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

function matchesMetaSignature(req, rawBody, secret) {
  const supplied = String(req.headers['x-hub-signature-256'] || '').trim();
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return safeEqualText(supplied, expected);
}

function validMetaSignature(req, rawBody, platform = 'meta') {
  // Environment-variable editors can accidentally preserve a trailing newline
  // or surrounding whitespace. Meta app secrets themselves do not contain
  // whitespace, so normalize only the secret — never the signed request body.
  const metaSecret = String(process.env.META_APP_SECRET || '').trim();
  if (metaSecret && matchesMetaSignature(req, rawBody, metaSecret)) return true;

  // Instagram Login has its own app ID and app secret. Accept that secret only
  // for Instagram objects arriving on the Meta endpoint; it must never
  // authenticate Page or WhatsApp events.
  if (platform !== 'meta') return false;
  const instagramSecret = String(process.env.INSTAGRAM_APP_SECRET || '').trim();
  if (!instagramSecret) return false;
  let object;
  try {
    object = String(JSON.parse(rawBody.toString('utf8'))?.object || '').toLowerCase();
  } catch (_) {
    return false;
  }
  return object === 'instagram' && matchesMetaSignature(req, rawBody, instagramSecret);
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
    const accountId = String(entry?.id || '');

    // Instagram / Messenger messaging webhooks (entry.messaging[])
    for (const msg of entry?.messaging || []) {
      try {
        const platform = object === 'instagram' ? 'instagram' : 'facebook';
        const sender = String(msg?.sender?.id || '');
        const recipient = String(msg?.recipient?.id || '');
        if (msg?.message) {
          const m = msg.message;
          const mid = String(m?.mid || m?.is_deleted || msg?.timestamp || `${sender}-${msg?.timestamp}`);
          const isEcho = Boolean(m?.is_echo);
          const isDeleted = Boolean(m?.is_deleted);
          let eventType = 'message.received';
          if (isDeleted) eventType = 'message.deleted';
          else if (isEcho) eventType = 'message.echo';
          else if (m?.is_edited) eventType = 'message.edited';
          events.push({
            platform,
            event_type: eventType,
            external_event_id: mid,
            external_parent_id: m?.reply_to?.mid ? String(m.reply_to.mid) : null,
            author_external_id: sender || null,
            author_name: null,
            content: m?.text || (m?.attachments ? '[attachment]' : null),
            permalink: null,
            occurred_at: toIso(msg?.timestamp),
            account_external_id: accountId || recipient,
            detected_intent: null,
            detected_intent_confidence: null,
            raw_payload: { adapter: 'meta', object, kind: 'messaging', entry_id: entry?.id, messaging: { sender, recipient, timestamp: msg?.timestamp, message_type: eventType } }
          });
        } else if (msg?.postback) {
          events.push({
            platform,
            event_type: 'messaging_postback',
            external_event_id: String(msg.postback?.mid || `postback-${sender}-${msg?.timestamp}`),
            external_parent_id: null,
            author_external_id: sender || null,
            author_name: null,
            content: msg.postback?.payload || msg.postback?.title || null,
            permalink: null,
            occurred_at: toIso(msg?.timestamp),
            account_external_id: accountId || recipient,
            detected_intent: null,
            detected_intent_confidence: null,
            raw_payload: { adapter: 'meta', object, kind: 'postback', entry_id: entry?.id }
          });
        } else if (msg?.read) {
          events.push({
            platform,
            event_type: 'messaging_seen',
            external_event_id: `read-${sender}-${msg.read?.watermark || msg?.timestamp}`,
            external_parent_id: null,
            author_external_id: sender || null,
            author_name: null,
            content: null,
            permalink: null,
            occurred_at: toIso(msg?.timestamp),
            account_external_id: accountId || recipient,
            detected_intent: null,
            detected_intent_confidence: null,
            raw_payload: { adapter: 'meta', object, kind: 'read', entry_id: entry?.id }
          });
        } else if (msg?.reaction) {
          events.push({
            platform,
            event_type: 'messaging_reaction',
            external_event_id: `reaction-${msg.reaction?.mid || ''}-${sender}-${msg?.timestamp}`,
            external_parent_id: msg.reaction?.mid ? String(msg.reaction.mid) : null,
            author_external_id: sender || null,
            author_name: null,
            content: msg.reaction?.emoji || msg.reaction?.reaction || null,
            permalink: null,
            occurred_at: toIso(msg?.timestamp),
            account_external_id: accountId || recipient,
            detected_intent: null,
            detected_intent_confidence: null,
            raw_payload: { adapter: 'meta', object, kind: 'reaction', entry_id: entry?.id }
          });
        } else {
          // unknown messaging subtype — store lightweight for observability
          events.push({
            platform,
            event_type: 'messaging.unknown',
            external_event_id: `msg-unknown-${sender || 'x'}-${msg?.timestamp || Date.now()}`,
            external_parent_id: null,
            author_external_id: sender || null,
            author_name: null,
            content: null,
            permalink: null,
            occurred_at: toIso(msg?.timestamp),
            account_external_id: accountId,
            detected_intent: null,
            detected_intent_confidence: null,
            raw_payload: { adapter: 'meta', object, kind: 'messaging_unknown', entry_id: entry?.id, keys: Object.keys(msg || {}) }
          });
        }
      } catch (_) {
        // never crash webhook on unexpected messaging shape
      }
    }

    // changes[] — comments, mentions, feed, etc.
    for (const change of entry?.changes || []) {
      try {
        const field = String(change?.field || '').toLowerCase();
        const value = change?.value || {};
        const platform = object === 'instagram' ? 'instagram' : (object === 'page' || object === 'facebook' ? 'facebook' : (object || 'facebook'));

        // Classify by webhook field before inspecting comment_id. Instagram
        // mentions carry comment_id but are distinct from comments.
        if (field === 'mentions' || field === 'story_insights' || field === 'live_comments') {
          const eid = value?.id || value?.comment_id || value?.media_id || `${accountId}-${field}-${entry?.time || Date.now()}`;
          events.push({
            platform: object === 'instagram' ? 'instagram' : platform,
            event_type: field,
            external_event_id: field === 'live_comments' ? String(eid) : `${field}:${eid}`,
            external_parent_id: value?.media_id ? String(value.media_id) : null,
            author_external_id: String(value?.from?.id || value?.sender_id || ''),
            author_name: value?.from?.username || value?.from?.name || value?.username || null,
            content: value?.text || value?.message || (field === 'mentions' ? 'إشارة إلى حساب Tiqnora AI على Instagram' : null),
            permalink: value?.permalink || null,
            occurred_at: toIso(value?.timestamp || entry?.time),
            account_external_id: accountId,
            detected_intent: null,
            detected_intent_confidence: null,
            raw_payload: { adapter: 'meta', object, entry_id: entry?.id, field }
          });
          continue;
        }

        // Page feed reactions may refer to a comment_id. Handle them before
        // the comment branch and give each distinct change its own stable ID.
        if (field === 'feed' && ['reaction', 'like'].includes(String(value?.item || '').toLowerCase())) {
          const verb = String(value?.verb || value?.action || 'add').toLowerCase();
          const actorId = String(value?.from?.id || value?.sender_id || value?.user_id || '');
          const parentId = String(value?.comment_id || value?.post_id || '');
          const reactionType = String(value?.reaction_type || value?.reaction || value?.item || 'like').toLowerCase();
          const identity = { accountId, parentId, actorId, reactionType, verb, time: value?.created_time || entry?.time || null, value };
          events.push({
            platform,
            event_type: ['remove', 'delete', 'deleted'].includes(verb) ? 'reaction.deleted' : 'reaction.created',
            external_event_id: `reaction:${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`,
            external_parent_id: parentId || null,
            author_external_id: actorId || null,
            author_name: value?.from?.name || null,
            content: reactionType,
            permalink: value?.permalink_url || null,
            occurred_at: toIso(value?.created_time || entry?.time),
            account_external_id: accountId,
            detected_intent: null,
            detected_intent_confidence: null,
            raw_payload: { adapter: 'meta', object, entry_id: entry?.id, field, item: value?.item, verb, reaction_type: reactionType }
          });
          continue;
        }

        if (field === 'comments' || field === 'feed' || value?.item === 'comment' || value?.comment_id) {
          const isFacebookComment = value?.item === 'comment' || Boolean(value?.comment_id);
          const isInstagramComment = field === 'comments' && (value?.id || value?.comment_id);
          if (field === 'feed' && !isFacebookComment) {
            // non-comment feed change
            const eid = value?.post_id || value?.id || `${accountId}-${field}-${entry?.time}`;
            events.push({
              platform,
              event_type: `feed.${String(value?.verb || 'update').toLowerCase()}`,
              external_event_id: String(eid),
              external_parent_id: value?.post_id ? String(value.post_id) : null,
              author_external_id: String(value?.from?.id || ''),
              author_name: value?.from?.name || null,
              content: value?.message || null,
              permalink: value?.permalink_url || null,
              occurred_at: toIso(value?.created_time || entry?.time),
              account_external_id: accountId,
              detected_intent: null,
              detected_intent_confidence: null,
              raw_payload: { adapter: 'meta', object, entry_id: entry?.id, field }
            });
            continue;
          }
          if (!isFacebookComment && !isInstagramComment && field !== 'comments') continue;

          const externalEventId = value?.comment_id || value?.id;
          if (!externalEventId) continue;
          const removed = ['remove', 'delete', 'deleted'].includes(String(value?.verb || value?.action || '').toLowerCase());
          events.push({
            platform: object === 'instagram' || field === 'comments' ? (object === 'page' ? 'facebook' : (object === 'instagram' ? 'instagram' : platform)) : platform,
            event_type: removed ? 'comment.deleted' : 'comment.created',
            external_event_id: String(externalEventId),
            external_parent_id: String(value?.media_id || value?.media?.id || value?.post_id || value?.parent_id || ''),
            author_external_id: String(value?.from?.id || value?.sender_id || value?.user_id || ''),
            author_name: value?.from?.name || value?.from?.username || value?.username || value?.sender_name || null,
            content: value?.message || value?.text || null,
            permalink: value?.permalink_url || value?.permalink || null,
            occurred_at: toIso(value?.created_time || value?.timestamp || entry?.time),
            account_external_id: accountId,
            detected_intent: null,
            detected_intent_confidence: null,
            raw_payload: { adapter: 'meta', object, entry_id: entry?.id, field }
          });
          continue;
        }

        // Unknown change field — acknowledge without crashing (idempotent id)
        const fallbackId = value?.id || value?.comment_id || value?.mid || `${accountId}-${field || 'change'}-${entry?.time || Date.now()}`;
        events.push({
          platform: object === 'instagram' ? 'instagram' : platform,
          event_type: field ? `change.${field}` : 'change.unknown',
          external_event_id: String(fallbackId),
          external_parent_id: null,
          author_external_id: String(value?.from?.id || ''),
          author_name: null,
          content: value?.message || value?.text || null,
          permalink: null,
          occurred_at: toIso(entry?.time),
          account_external_id: accountId,
          detected_intent: null,
          detected_intent_confidence: null,
          raw_payload: { adapter: 'meta', object, entry_id: entry?.id, field: field || null, keys: Object.keys(value || {}) }
        });
      } catch (_) {
        // swallow per-change errors
      }
    }
  }

  return events;
}

// WhatsApp Cloud API is delivered by Meta to the same endpoint, but its
// payload shape is different from Facebook/Instagram comments.  Keep it in
// the same event stream so the inbox, lead rules and future AI replies do not
// need a separate WhatsApp data model.
function normalizeWhatsApp(payload) {
  const events = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const metadata = value?.metadata || {};
      const contacts = new Map((value?.contacts || []).map(contact => [String(contact?.wa_id || ''), contact]));

      for (const message of value?.messages || []) {
        const authorId = String(message?.from || '');
        const contact = contacts.get(authorId) || {};
        const type = String(message?.type || 'text');
        let text = message?.text?.body
          || message?.button?.text
          || message?.interactive?.button_reply?.title
          || message?.interactive?.list_reply?.title
          || null;
        if (!text && type === 'image') text = message?.image?.caption || '[image]';
        if (!text && type === 'video') text = message?.video?.caption || '[video]';
        if (!text && type === 'document') text = message?.document?.filename || message?.document?.caption || '[document]';
        if (!text && type === 'audio') text = '[audio]';
        if (!text && type === 'location') text = message?.location ? `[location ${message.location.latitude},${message.location.longitude}]` : '[location]';
        if (!text && type === 'contacts') text = '[contacts]';
        if (!text) text = `[${type}]`;
        if (!message?.id) continue;
        events.push({
          platform: 'whatsapp',
          event_type: 'message.received',
          external_event_id: String(message.id),
          external_parent_id: message?.context?.id ? String(message.context.id) : null,
          author_external_id: authorId || null,
          author_name: contact?.profile?.name || authorId || null,
          content: text,
          permalink: null,
          occurred_at: toIso(message?.timestamp),
          account_external_id: String(metadata?.phone_number_id || ''),
          detected_intent: null,
          detected_intent_confidence: null,
          raw_payload: { adapter: 'whatsapp_cloud', entry_id: entry?.id, field: change?.field, value: { metadata, message, contact } }
        });
      }

      for (const status of value?.statuses || []) {
        if (!status?.id) continue;
        const st = String(status.status || 'unknown').toLowerCase();
        events.push({
          platform: 'whatsapp',
          event_type: `message.status.${st}`,
          external_event_id: `status-${status.id}-${st}-${status.timestamp || ''}`,
          external_parent_id: String(status.id),
          author_external_id: status?.recipient_id ? String(status.recipient_id) : null,
          author_name: null,
          content: st,
          permalink: null,
          occurred_at: toIso(status?.timestamp),
          account_external_id: String(metadata?.phone_number_id || ''),
          detected_intent: null,
          detected_intent_confidence: null,
          raw_payload: { adapter: 'whatsapp_cloud', kind: 'status', entry_id: entry?.id, status }
        });
      }
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
  whatsapp: { verify: validGenericSignature, normalize: (payload) => normalizeGeneric('whatsapp', payload) }
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

async function ensureConnectionId(organizationId, event) {
  const existing = await findConnectionId(organizationId, event);
  if (existing || !event.account_external_id) return existing;
  const rows = await rest('social_connections?on_conflict=organization_id,platform,external_account_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      platform: event.platform,
      external_account_id: event.account_external_id,
      account_name: event.raw_payload?.value?.metadata?.display_phone_number || null,
      status: 'active',
      capabilities: { inbox: true, webhooks: true },
      connected_at: new Date().toISOString()
    })
  });
  return rows?.[0]?.id || await findConnectionId(organizationId, event);
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

function getQuery(req) {
  const q = { ...(req.query || {}) };
  try {
    const host = req.headers?.host || 'localhost';
    const url = new URL(req.url || '/', `https://${host}`);
    url.searchParams.forEach((v, k) => { if (q[k] == null) q[k] = v; });
  } catch (_) {}
  return q;
}

export { normalizeMeta, validMetaSignature };

export default async function handler(req, res) {
  const query = getQuery(req);
  const platform = String(query.platform || 'meta').toLowerCase();

  if (req.method === 'GET' && ['meta', 'whatsapp'].includes(platform)) {
    const mode = String(query['hub.mode'] || '');
    const token = String(query['hub.verify_token'] || '');
    const challenge = String(query['hub.challenge'] || '');
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
    if (mode === 'subscribe' && expected && safeEqualText(token, expected)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(challenge);
    }
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Forbidden');
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  // HMAC verification must use the exact bytes Meta sent. Prefer a runtime-
  // supplied rawBody when available; otherwise read the untouched request
  // stream because bodyParser is disabled above.
  let rawBody;
  if (Buffer.isBuffer(req.rawBody)) {
    rawBody = req.rawBody;
  } else if (typeof req.rawBody === 'string') {
    rawBody = Buffer.from(req.rawBody);
  } else {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    rawBody = Buffer.concat(chunks);
  }
  const adapter = getAdapter(platform);
  const verified = ['meta', 'whatsapp'].includes(platform) ? validMetaSignature(req, rawBody, platform) : adapter.verify(req);
  if (!verified) {
    if (['meta', 'whatsapp'].includes(platform)) {
      const signature = String(req.headers['x-hub-signature-256'] || '');
      console.warn('Meta webhook signature verification failed', {
        signature_present: Boolean(signature),
        signature_length: signature.length,
        signature_format_ok: signature.startsWith('sha256='),
        app_secret_present: Boolean(process.env.META_APP_SECRET),
        instagram_app_secret_present: Boolean(process.env.INSTAGRAM_APP_SECRET),
        raw_body_bytes: rawBody.length
      });
    }
    return send(res, 401, { error: 'Invalid webhook signature' });
  }

  try {
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const organizations = await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
    const organizationId = organizations?.[0]?.id;
    if (!organizationId) throw new Error('Tiqnora organization is missing');

    const rules = await rest(`social_automation_rules?organization_id=eq.${encodeURIComponent(organizationId)}&is_active=eq.true&select=*`);
    const normalized = platform === 'whatsapp' ? normalizeWhatsApp(payload) : adapter.normalize(payload);
    let matched = 0;
    let insertedCount = 0;
    let duplicateCount = 0;
    let ignored = 0;

    for (const event of normalized) {
      if (!event.platform || !event.external_event_id) continue;
      const connectionId = await ensureConnectionId(organizationId, event);
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
