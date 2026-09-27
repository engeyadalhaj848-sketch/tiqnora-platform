import { createHash, createHmac, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { persistSocialCrmEvent, persistDeliveryStatusEvent, isDeliveryStatusEvent } from '../../lib/v6/social-crm-bridge.js';

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

export function validYCloudSignature(req, rawBody, nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = process.env.YCLOUD_WEBHOOK_SECRET;
  const header = req.headers?.['ycloud-signature'];
  if (!secret || typeof header !== 'string') return false;
  const fields = new Map();
  for (const part of header.split(',')) {
    const match = /^\s*([ts])=([^,\s]+)\s*$/.exec(part);
    if (!match || fields.has(match[1])) return false;
    fields.set(match[1], match[2]);
  }
  const timestamp = fields.get('t');
  const signature = fields.get('s');
  if (!/^\d{10,16}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  return safeEqualText(signature.toLowerCase(), expected);
}

function normalizedPhone(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
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

export function normalizeYCloud(payload) {
  const inbound = payload?.type === 'whatsapp.inbound_message.received';
  const appEcho = payload?.type === 'whatsapp.smb.message.echoes';
  const statusUpdate = payload?.type === 'whatsapp.message.updated';
  if (!inbound && !appEcho && !statusUpdate) return [];

  const message = inbound ? payload?.whatsappInboundMessage : payload?.whatsappMessage;

  if (statusUpdate) {
    const status = String(message?.status || 'unknown').toLowerCase();
    const messageId = String(message?.id || message?.wamid || '').trim();
    if (!messageId || !['sent', 'delivered', 'read', 'failed'].includes(status)) return [];
    const businessPhone = normalizedPhone(message?.from);
    const customerPhone = normalizedPhone(message?.to);
    return [{
      platform: 'whatsapp',
      event_type: `message.status.${status}`,
      external_event_id: `ycloud-status-${messageId}-${status}-${String(payload?.id || payload?.createTime || Date.now())}`,
      external_parent_id: messageId,
      author_external_id: customerPhone,
      author_name: null,
      content: status,
      permalink: null,
      occurred_at: toIso(message?.readTime || message?.deliverTime || message?.sendTime || payload?.createTime),
      account_external_id: businessPhone || '',
      detected_intent: null,
      detected_intent_confidence: null,
      raw_payload: {
        adapter: 'ycloud',
        kind: 'status',
        event_id: payload?.id || null,
        waba_id: message?.wabaId ? String(message.wabaId) : null,
        status,
        message
      }
    }];
  }

  const businessPhone = normalizedPhone(inbound ? message?.to : message?.from);
  const customerPhone = normalizedPhone(inbound ? message?.from : message?.to);
  const customerId = customerPhone || String(inbound ? message?.fromUserId || '' : message?.toUserId || '').trim();
  if (!message?.id || !message?.wabaId || !businessPhone || !customerId) return [];

  const type = String(message.type || 'text');
  let content = message.text?.body
    || message.button?.text
    || message.interactive?.buttonReply?.title
    || message.interactive?.listReply?.title
    || null;
  if (!content && type === 'image') content = message.image?.caption || '[image]';
  if (!content && type === 'video') content = message.video?.caption || '[video]';
  if (!content && type === 'document') content = message.document?.filename || message.document?.caption || '[document]';
  if (!content && type === 'audio') content = '[audio]';
  if (!content && type === 'location') content = message.location ? `[location ${message.location.latitude},${message.location.longitude}]` : '[location]';
  if (!content) content = `[${type}]`;

  return [{
    platform: 'whatsapp',
    event_type: inbound ? 'message.received' : 'message.sent',
    external_event_id: String(message.wamid || message.id),
    external_parent_id: message.context?.id ? String(message.context.id) : null,
    author_external_id: inbound ? customerId : 'tiqnora',
    author_name: inbound ? (message.customerProfile?.name || message.customerProfile?.username || customerId) : 'Tiqnora',
    content,
    permalink: null,
    occurred_at: toIso(message.sendTime || payload.createTime),
    account_external_id: businessPhone,
    detected_intent: null,
    detected_intent_confidence: null,
    raw_payload: { adapter: 'ycloud', kind: inbound ? 'inbound' : 'app_echo', event_id: payload.id, waba_id: String(message.wabaId), message }
  }];
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
  whatsapp: { verify: validGenericSignature, normalize: (payload) => normalizeGeneric('whatsapp', payload) },
  ycloud: { verify: validYCloudSignature, normalize: normalizeYCloud }
};

function getAdapter(platform) {
  return ADAPTERS[platform] || { verify: validGenericSignature, normalize: (payload) => normalizeGeneric(platform, payload) };
}

async function ensureYCloudStatusSubscription(req) {
  const apiKey = process.env.YCLOUD_API_KEY;
  const endpointId = String(req.headers?.['x-webhook-endpoint-id'] || '').trim();
  if (!apiKey || !endpointId) return { changed: false, reason: 'missing_key_or_endpoint_id' };

  try {
    const getRes = await fetch(`https://api.ycloud.com/v2/webhookEndpoints/${encodeURIComponent(endpointId)}`, {
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(10000)
    });
    const endpoint = await getRes.json().catch(() => ({}));
    if (!getRes.ok || endpoint?.error) throw new Error(endpoint?.error?.message || `GET webhook endpoint failed (${getRes.status})`);

    const enabled = Array.isArray(endpoint.enabledEvents) ? endpoint.enabledEvents.map(String) : [];
    const required = ['whatsapp.inbound_message.received', 'whatsapp.message.updated'];
    const next = [...new Set([...enabled, ...required])];
    const changed = next.length !== enabled.length || required.some(x => !enabled.includes(x));
    if (!changed) return { changed: false, enabledEvents: enabled };

    const patchRes = await fetch(`https://api.ycloud.com/v2/webhookEndpoints/${encodeURIComponent(endpointId)}`, {
      method: 'PATCH',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ enabledEvents: next }),
      signal: AbortSignal.timeout(10000)
    });
    const patched = await patchRes.json().catch(() => ({}));
    if (!patchRes.ok || patched?.error) throw new Error(patched?.error?.message || `PATCH webhook endpoint failed (${patchRes.status})`);
    console.info('YCloud webhook subscription updated', { endpoint_id: endpointId, enabled_events: patched.enabledEvents || next });
    return { changed: true, enabledEvents: patched.enabledEvents || next };
  } catch (error) {
    console.warn('YCloud webhook subscription sync failed', { endpoint_id: endpointId || null, message: error.message });
    return { changed: false, error: error.message };
  }
}


function decryptVault(enc) {
  if (!enc?.ciphertext || !enc?.iv || !enc?.tag) return null;
  const key = Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64 32-byte key');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64url'));
  d.setAuthTag(Buffer.from(enc.tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc.ciphertext, 'base64url')), d.final()]).toString();
}

async function metaGraphPost(path, accessToken, payload) {
  const url = new URL(`https://graph.facebook.com/v22.0/${String(path || '').replace(/^\//, '')}`);
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(payload || {})
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) throw new Error(body?.error?.message || `Meta Graph API failed (${response.status})`);
  return body;
}

async function callSocialAI(prompt, { json = false, temperature = 0.3, maxTokens = 180 } = {}) {
  const failures = [];

  // Prefer OpenAI for customer conversations when configured. This produces
  // materially better multi-turn Arabic dialogue than the previous
  // keyword/fallback-heavy path. Other providers remain as automatic fallback.
  if (process.env.OPENAI_API_KEY) {
    try {
      const model = process.env.OPENAI_MODEL || 'chat-latest';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || `OpenAI failed (${response.status})`);
      const text = body?.choices?.[0]?.message?.content?.trim();
      if (text) return { text, provider: 'openai', model: body?.model || model };
      throw new Error('OpenAI returned empty text');
    } catch (error) {
      failures.push(`openai: ${error.message}`);
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(json ? { responseMimeType: 'application/json' } : {})
          }
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || `Gemini failed (${response.status})`);
      const text = (body?.candidates?.[0]?.content?.parts || []).map(x => x?.text || '').join('').trim();
      if (text) return { text, provider: 'google_ai', model };
      throw new Error('Gemini returned empty text');
    } catch (error) {
      failures.push(`google_ai: ${error.message}`);
    }
  }

  if (process.env.XAI_API_KEY) {
    try {
      const model = process.env.XAI_MODEL || 'grok-3-mini';
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || `xAI failed (${response.status})`);
      const text = body?.choices?.[0]?.message?.content?.trim();
      if (text) return { text, provider: 'xai', model: body?.model || model };
      throw new Error('xAI returned empty text');
    } catch (error) {
      failures.push(`xai: ${error.message}`);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || `Anthropic failed (${response.status})`);
      const text = (body?.content || []).filter(x => x?.type === 'text').map(x => x.text || '').join('').trim();
      if (text) return { text, provider: 'anthropic', model: body?.model || model };
      throw new Error('Anthropic returned empty text');
    } catch (error) {
      failures.push(`anthropic: ${error.message}`);
    }
  }

  if (failures.length) {
    console.warn('All configured social AI providers failed', { failures });
  }
  return null;
}

const SPECIALIST_HANDOFF_TEXT = 'هذا الطلب يحتاج متابعة أدق، لذلك سيتم تحويل المحادثة للقسم المختص، وبيكمل معك الفريق من هنا.';

function isWhatsappEmotionalMessage(value) {
  const input = normalizeText(value);
  return /(زعلان|زعلت|متضايق|مضايق|منزعج|متوتر|قلقان|خايف|محبط|مقهور|مستفز|مزعج|سيء|سيئ|مو عاجبني|مش عاجبني|انت تعبان|ياخي انت تعبان|ما ?تفهم|ماتفهم|ما ?تفهمني|ماتفهمني|ردك غلط|نفس الرد|تكرر|تردد|بصراحه انت|شكرا|مشكور|يعطيك العافيه|الله يسعدك|ممتاز|رائع|احبكم|كفو|بيض الله وجهك)/.test(input);
}

function whatsappContextFallback(event, rule, { followUp = false } = {}) {
  const input = normalizeText(event.content);
  const templated = String(rule?.reply_template || 'شكرًا لتواصلك معنا. كيف نقدر نخدمك؟')
    .replaceAll('{{author_name}}', event.author_name || '');

  const greetingOnly = /^(السلام عليكم|سلام عليكم|وعليكم السلام|مرحبا|مرحبا بك|هلا|هلا والله|حياك الله|اهلا|اهلين)$/i.test(input);

  if (/(كيف حالك|كيفك|اخبارك|وش اخبارك|شلونك)/.test(input)) {
    return 'بخير الله يسلمك 🌟 وأنت؟ تفضل، وش حاب تعرف عن Tiqnora؟';
  }

  if (/(ما ?فهمت|ماني فاهم|مش فاهم|وضح|وضح لي|ايش قصدك|وش قصدك)/.test(input)) {
    return 'أكيد، أوضحها ببساطة: Tiqnora تساعدك في المواقع والمتاجر، واتساب وCRM، وكلاء الذكاء الاصطناعي، السوشيال وSEO. قل لي الخدمة اللي تهمك وأنا أشرحها مباشرة.';
  }

  if (/(انت تعبان|ياخي انت تعبان|ما ?تفهم|ماتفهم|ما ?تفهمني|ماتفهمني|مافهمت علي|تكرر|تردد|نفس الرد|ردك غلط|مستفز|مزعج|سيء|سيئ|مو عاجبني|مش عاجبني|بصراحه انت)/.test(input)) {
    return 'أفهم إن الرد السابق ضايقك، ومعك حق إذا ما كان واضح. اكتب لي طلبك مباشرة وأنا برد عليك بدون تكرار أو لف ودوران.';
  }

  if (/(زعلان|زعلت|متضايق|مضايق|منزعج|متوتر|قلقان|خايف|محبط|تعبان نفسيا|مقهور|مشكله مزعجه)/.test(input)) {
    return 'أتفهم شعورك، وإن شاء الله نساعدك بأفضل شكل. اشرح لي اللي حصل باختصار، وإذا احتاج الموضوع مختص راح نحول المحادثة له مباشرة.';
  }

  if (/(شكرا|مشكور|يعطيك العافيه|الله يسعدك|ممتاز|رائع|احبكم|كفو|بيض الله وجهك)/.test(input)) {
    return 'يسعدك ربي 🌟 كلامك محل تقدير، وأنا حاضر لأي شيء تحتاجه.';
  }

  if (greetingOnly) {
    return followUp
      ? 'الله يحييك ويسعدك 🌟 تفضل، وش حاب تعرف أو وش الخدمة اللي تحتاجها؟'
      : templated;
  }

  if (/(الخدمات|خدماتكم|تقدمون|تقدموها|وش عندكم|ايش عندكم|ماذا تقدمون)/.test(input)) {
    return 'نقدم تصميم وتطوير المواقع والمتاجر، أتمتة واتساب وCRM، وكلاء ذكاء اصطناعي، إدارة السوشيال والمحتوى، وSEO والحلول التقنية. قل لي نوع نشاطك وأقترح لك الأنسب.';
  }

  if (/(سعر|الاسعار|الأسعار|كم يكلف|تكلفه|تكلفة|عرض سعر)/.test(input)) {
    return 'أكيد. الأسعار تعتمد على احتياج المشروع، لذلك ما نعطي رقم عشوائي. ارسل نوع نشاطك والخدمة المطلوبة، ونجهز لك تصور وعرض مناسب.';
  }

  if (/(موقع|ويب|متجر|متجر الكتروني|متجر إلكتروني)/.test(input)) {
    return 'نقدر نبني لك موقع أو متجر سريع ومتجاوب وربطه بواتساب وCRM والنماذج والتحليلات. ارسل نوع نشاطك وهل تحتاج موقع تعريفي أو متجر بيع.';
  }

  if (/(واتساب|whatsapp|رد الي|رد آلي|crm|اتمته|أتمتة)/.test(input)) {
    return 'نقدر نربط واتساب بالـCRM ونجهز ردود ذكية، تأهيل العملاء، متابعة الطلبات وعروض الأسعار، مع موافقات قبل أي إرسال خارجي. وش نوع نشاطك؟';
  }

  return SPECIALIST_HANDOFF_TEXT;
}

async function recentConversationHistory(storedEvent, organizationId, limit = 16) {
  if (!storedEvent?.conversation_id) return [];
  try {
    const rows = await rest(
      `messages?organization_id=eq.${encodeURIComponent(organizationId)}&conversation_id=eq.${encodeURIComponent(storedEvent.conversation_id)}&select=direction,body,created_at&order=created_at.desc&limit=${Math.max(1, Math.min(20, Number(limit) || 16))}`
    );
    return (rows || []).slice().reverse().map((row) => ({
      role: row.direction === 'outbound' ? 'assistant' : 'customer',
      text: String(row.body || '').slice(0, 900)
    }));
  } catch (error) {
    console.warn('Failed to load WhatsApp conversation history', { message: error.message });
    return [];
  }
}

async function generateAgentReply(event, rule, options = {}) {
  const followUp = Boolean(options.followUp);
  const history = Array.isArray(options.history) ? options.history : [];
  const fallback = whatsappContextFallback(event, rule, { followUp });

  // Deterministic facts such as the official website should not be rewritten by AI.
  if (rule?.intent === 'platform_link') return fallback.slice(0, 700);

  const prompt = [
    'أنت وكيل خدمة عملاء لمنصة Tiqnora AI في السعودية.',
    'تصرف كمساعد محادثة ذكي جدًا، وليس كبوت ردود جاهزة. افهم مقصد العميل من كلامه والسياق السابق حتى لو كان عاميًا أو فيه أخطاء أو كلام عاطفي.',
    'اكتب ردًا عربيًا طبيعيًا ومباشرًا، وبأسلوب إنساني وودود قريب من أسلوب المحادثة الحقيقية.',
    'لا تعتمد على كلمات مفتاحية وحدها. اربط الرسالة الحالية بما قيل قبلها، وافهم الضمائر والتلميحات والاعتراضات والمتابعة.',
    'إذا كان السؤال واضحًا فأجب عليه مباشرة ولا تطلب تفاصيل سبق أن ذكرها العميل ولا تعيد نفس السؤال بصياغة مختلفة.',
    'إذا كان العميل يمزح أو يشتكي أو يعبّر عن مشاعر، رد على المعنى والمشاعر أولًا ثم أكمل المساعدة بشكل طبيعي.',
    'إذا كانت رسالة العميل بالعربية فأجب بالعربية فقط، ويفضل لهجة عربية سعودية خفيفة إذا كان أسلوب العميل عاميًا. لا تستخدم ترجمة إنجليزية أو تعليقات إنجليزية بين أقواس.',
    'لا تقتبس رسالة العميل ولا تكرر نصها في الرد. أجب على المعنى مباشرة.',
    'تعامل مع المشاعر بذكاء: إذا العميل غاضب أو متضايق أو قلق أو ممتن أو متحمس، اعترف بمشاعره باختصار وبأسلوب إنساني ثم أكمل المساعدة بدون مبالغة أو تصنع.',
    'المشاعر أو المزاح أو عدم الفهم ليست سببًا للتحويل. لا تحول إلا إذا كان هناك طلب عملي حقيقي خارج نطاقك أو معلومة لازمة لا تملكها ولا يمكن استنتاجها بأمان.',
    'إذا كان السؤال العملي خارج نطاق خدمات Tiqnora، أو لا تملك معلومة موثوقة تكفي للإجابة، أو كنت غير متأكد من الإجابة: لا تخمن ولا تخترع. استخدم هذه الجملة حرفيًا: هذا الطلب يحتاج متابعة أدق، لذلك سيتم تحويل المحادثة للقسم المختص، وبيكمل معك الفريق من هنا.',
    followUp
      ? 'هذه محادثة مستمرة. لا تعيد رسالة الترحيب ولا تسأل كيف نقدر نخدمك إذا العميل أوضح سؤاله بالفعل.'
      : 'هذه بداية المحادثة. يمكن الترحيب باختصار ثم الإجابة مباشرة على سؤال العميل.',
    'افهم المطلوب من النص نفسه والسياق السابق. لا تخترع أسعارًا أو خصومات أو مواعيد أو وعودًا أو قدرات غير مؤكدة.',
    'Tiqnora تقدم تصميم وتطوير المواقع والمتاجر، أتمتة واتساب وCRM، وكلاء ذكاء اصطناعي، إدارة السوشيال والمحتوى، SEO وحلول تقنية.',
    'عند طلب سعر أو عرض، اطلب تفاصيل المشروع بدل إعطاء سعر ثابت.',
    'إذا كان العميل يطلب تحليل نشاطه، اطلب اسم النشاط ورابط الحساب أو الموقع.',
    'لا تطلب كلمات مرور أو رموز تحقق أو بيانات حساسة.',
    'اجعل الرد قصيرًا ومفيدًا عادة من جملة إلى أربع جمل. لا تطيل بلا داعٍ، وبدون Markdown.',
    `المنصة: ${event.platform}`,
    `اسم العميل إن توفر: ${event.author_name || 'غير معروف'}`,
    `السياق السابق: ${history.length ? JSON.stringify(history) : 'لا يوجد'}`,
    `رسالة العميل الحالية: ${event.content || ''}`,
    `النية المتوقعة: ${rule?.intent || 'general'}`
  ].join('\n');

  try {
    const result = await callSocialAI(prompt, { temperature: 0.45, maxTokens: 320 });
    const text = String(result?.text || '').replace(/\s+/g, ' ').trim();
    const words = text.split(/\s+/).filter(Boolean);
    const tooShort = text.length < 18 || words.length < 4;
    const greetingOnly = /^(اهلا|أهلا|أهلاً|مرحبا|مرحباً|هلا|حياك)[!،,.\s]*$/i.test(text);
    const repeatedWelcome = followUp && /شكر[اأً]* لتواصلك.*كيف نقدر نخدمك/i.test(text);
    const arabicCustomer = /[\u0600-\u06FF]/.test(String(event.content || ''));
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const latinChars = (text.match(/[A-Za-z]/g) || []).length;
    const wrongLanguage = arabicCustomer && latinChars > Math.max(18, arabicChars * 0.7);
    if (!text || tooShort || greetingOnly || repeatedWelcome || wrongLanguage) {
      console.warn('Social AI reply unsuitable; using contextual fallback', {
        provider: result?.provider || null,
        length: text.length,
        words: words.length,
        follow_up: followUp,
        wrong_language: wrongLanguage
      });
      return fallback.slice(0, 700);
    }
    return text.slice(0, 700);
  } catch (error) {
    console.warn('Social AI reply generation failed; using contextual fallback', { message: error.message });
    return fallback.slice(0, 700);
  }
}

async function sendYCloudAutoReply(event, storedEvent, organizationId, text) {
  if (event.platform !== 'whatsapp' || event.event_type !== 'message.received' || event.raw_payload?.adapter !== 'ycloud') {
    return { sent: false, reason: 'unsupported_ycloud_auto_reply_event' };
  }

  const rawMessage = event.raw_payload?.message || {};
  if (String(rawMessage.type || 'text') !== 'text') {
    return { sent: false, reason: 'non_text_message_requires_manual_review' };
  }

  const rows = storedEvent.connection_id
    ? await rest(`social_connections?id=eq.${encodeURIComponent(storedEvent.connection_id)}&organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.whatsapp&select=*&limit=1`)
    : [];
  const connection = rows?.[0];
  const from = normalizedPhone(connection?.external_account_id);
  const to = normalizedPhone(rawMessage.from);
  const occurredAt = Date.parse(event.occurred_at || '');
  const ageMs = Date.now() - occurredAt;

  if (connection?.status !== 'active'
    || connection?.settings?.provider !== 'ycloud'
    || connection?.settings?.ycloud_verified !== true
    || connection?.settings?.webhook_subscribed !== true
    || connection?.capabilities?.messaging !== true
    || !from || !to
    || from !== normalizedPhone(rawMessage.to)
    || to !== normalizedPhone(event.author_external_id)
    || String(connection?.settings?.waba_id || '') !== String(rawMessage.wabaId || '')
    || !Number.isFinite(occurredAt)
    || ageMs < -5 * 60 * 1000
    || ageMs >= 24 * 60 * 60 * 1000) {
    throw new Error('YCloud automatic reply connection/window validation failed');
  }

  const apiKey = process.env.YCLOUD_API_KEY;
  if (!apiKey) throw new Error('YCLOUD_API_KEY is missing');

  const payload = { from, to, type: 'text', text: { body: String(text || '').slice(0, 4096) } };
  // Send automatic replies as normal conversation messages. Adding a reply context here
  // makes WhatsApp quote the customer's previous message on every bot response.
  const response = await fetch('https://api.ycloud.com/v2/whatsapp/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const apiResult = await response.json().catch(() => ({}));
  if (!response.ok || apiResult?.error) {
    throw new Error(apiResult?.error?.code || apiResult?.error?.message || apiResult?.code || `YCloud HTTP ${response.status}`);
  }

  const outboundExternalId = String(apiResult.wamid || apiResult.id || '').trim();
  if (!outboundExternalId) throw new Error('YCloud accepted automatic reply without message ID');

  const outboundEvent = await rest('social_events?on_conflict=platform,external_event_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      connection_id: connection.id,
      platform: 'whatsapp',
      event_type: 'message.sent',
      external_event_id: outboundExternalId,
      external_parent_id: event.external_event_id || null,
      author_external_id: 'tiqnora',
      author_name: 'Tiqnora',
      content: text,
      occurred_at: new Date().toISOString(),
      processing_status: 'processed',
      lead_id: storedEvent.lead_id || null,
      contact_id: storedEvent.contact_id || null,
      conversation_id: storedEvent.conversation_id || null,
      raw_payload: {
        adapter: 'tiqnora_outbound',
        provider: 'ycloud',
        mode: 'auto_reply',
        status: apiResult.status || 'accepted',
        in_reply_to: storedEvent.id,
        ycloud_message_id: apiResult.id || null
      }
    })
  });

  if (storedEvent.conversation_id) {
    const now = new Date().toISOString();
    const normalizedStatus = String(apiResult.status || 'accepted').toLowerCase() === 'accepted' ? 'sent' : String(apiResult.status || 'sent').toLowerCase();
    await rest('messages?on_conflict=organization_id,external_message_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        organization_id: organizationId,
        conversation_id: storedEvent.conversation_id,
        direction: 'outbound',
        body: text,
        external_message_id: `whatsapp:${outboundExternalId}`,
        sender_name: 'Tiqnora',
        social_event_id: outboundEvent?.[0]?.id || null,
        created_at: now,
        ai_meta: {
          source: 'auto_reply',
          provider: 'ycloud',
          provider_message_id: outboundExternalId,
          delivery_status: normalizedStatus,
          delivery_status_at: now,
          sent_at: now
        }
      })
    });
    await rest(`conversations?id=eq.${encodeURIComponent(storedEvent.conversation_id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_message_at: now, updated_at: now })
    });
  }

  return {
    sent: true,
    provider: 'ycloud',
    connection_id: connection.id,
    external_reply_id: outboundExternalId,
    accepted_status: apiResult.status || 'accepted'
  };
}

async function sendAutomaticReply(event, storedEvent, organizationId, text) {
  if (event.platform === 'whatsapp' && event.raw_payload?.adapter === 'ycloud') {
    return sendYCloudAutoReply(event, storedEvent, organizationId, text);
  }
  return sendMetaAutoReply(event, storedEvent, organizationId, text);
}

async function sendMetaAutoReply(event, storedEvent, organizationId, text) {
  if (!['instagram', 'facebook'].includes(event.platform) || event.event_type !== 'comment.created') {
    return { sent: false, reason: 'unsupported_auto_reply_event' };
  }

  let rows = [];
  if (storedEvent.connection_id) {
    rows = await rest(`social_connections?id=eq.${encodeURIComponent(storedEvent.connection_id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=*&limit=1`);
  }
  if (!rows?.length && event.account_external_id) {
    rows = await rest(`social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.${encodeURIComponent(event.platform)}&external_account_id=eq.${encodeURIComponent(event.account_external_id)}&status=eq.active&select=*&limit=1`);
  }
  const connection = rows?.[0];
  const token = decryptVault(connection?.settings?.page_access_token_enc);
  if (!token) throw new Error('Page access token missing for automatic reply');

  const result = event.platform === 'instagram'
    ? await metaGraphPost(`${event.external_event_id}/replies`, token, { message: text })
    : await metaGraphPost(`${event.external_event_id}/comments`, token, { message: text });

  return {
    sent: true,
    connection_id: connection?.id || null,
    external_reply_id: String(result?.id || '')
  };
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

  if (rule.match_mode === 'always') {
    return { rule, confidence: 1, reason: 'always' };
  }

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
  if (confidence > 0) {
    return { rule, confidence, reason: rule.match_mode === 'intent_or_keyword' ? 'keyword_or_fuzzy' : rule.match_mode };
  }

  // Deterministic Arabic semantic safety net for the first Tiqnora intent.
  // It catches natural variants such as "حللي نشاطي" and
  // "ممكن تشوفوا حسابي وتقولوا لي ايش يحتاج؟" even if an AI provider
  // is temporarily unavailable. Require both a business subject and an
  // audit/review cue to avoid replying to unrelated comments.
  if (rule.match_mode === 'intent_or_keyword' && rule.intent === 'business_audit') {
    const hasSubject = /(نشاط|حساب|موقع|صفحه|متجر|بيزنس|مشروع)/.test(text);
    const hasAuditCue = /(حلل|تحليل|قيم|تقييم|راجع|مراجع|شوف|تشوف|افحص|فحص|يحتاج|ناقص|تحسين|تطوير)/.test(text);
    if (hasSubject && hasAuditCue) {
      return { rule, confidence: 0.86, reason: 'arabic_semantic_fallback' };
    }
  }

  if (rule.match_mode === 'intent_or_keyword' && rule.intent === 'platform_link') {
    const asksForLink = /(رابط|لينك)/.test(text);
    const mentionsPlatform = /(منصه|موقع|تيكنورا|tiqnora)/.test(text);
    if (asksForLink && mentionsPlatform) {
      return { rule, confidence: 0.93, reason: 'platform_link_fallback' };
    }
  }

  return null;
}

function sourceFor(event) {
  if (String(event.event_type || '').startsWith('comment.')) return `${event.platform}_comment`;
  return `${event.platform}_social`;
}

async function classifyEventWithAI(event, rules) {
  const candidates = (rules || []).filter(rule =>
    platformAllowed(rule, event.platform) &&
    eventTypeAllowed(rule, event.event_type) &&
    rule.intent
  );
  if (!candidates.length || !String(event.content || '').trim()) return null;

  const intents = candidates.map(rule => ({
    intent: rule.intent,
    name: rule.name,
    keywords: Array.isArray(rule.keywords) ? rule.keywords : []
  }));
  const prompt = [
    'Classify this Saudi Arabic social-media comment into one of the allowed intents.',
    'Return ONLY compact JSON: {"intent":"...","confidence":0.0}.',
    'If none applies, return {"intent":null,"confidence":0}.',
    'Understand spelling variants, colloquial Arabic, feminine/masculine forms, missing spaces, and typos.',
    'Do not invent an intent outside the allowed list.',
    `Allowed intents: ${JSON.stringify(intents)}`,
    `Platform: ${event.platform}`,
    `Event type: ${event.event_type}`,
    `Comment: ${String(event.content || '').slice(0, 1000)}`
  ].join('\n');

  try {
    const result = await callSocialAI(prompt, { json: true, temperature: 0.05, maxTokens: 80 });
    if (!result?.text) return null;
    const raw = String(result.text).replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
    const parsed = JSON.parse(raw || '{}');
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence) || 0));
    const rule = candidates.find(x => x.intent === parsed?.intent);
    if (!rule || confidence < 0.72) return null;
    return { rule, confidence, reason: `ai_semantic:${result.provider}` };
  } catch (error) {
    console.warn('Social AI intent classification failed', { message: error.message });
    return null;
  }
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

async function findYCloudConnectionId(organizationId, event) {
  const phone = normalizedPhone(event.account_external_id);
  const wabaId = event.raw_payload?.waba_id;
  if (!phone || !wabaId) return null;
  const rows = await rest(`social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.whatsapp&external_account_id=eq.${encodeURIComponent(phone)}&status=eq.active&select=id,external_account_id,status,settings&limit=2`);
  const match = rows?.find(row => row.status === 'active'
    && row.settings?.provider === 'ycloud'
    && row.settings?.ycloud_verified === true
    && row.settings?.webhook_subscribed === true
    && String(row.settings?.waba_id || '') === wabaId
    && normalizedPhone(row.external_account_id) === phone);
  return match?.id || null;
}

async function findMetaWhatsAppConnectionId(organizationId, event) {
  const phoneId = String(event.account_external_id || '');
  const wabaId = String(event.raw_payload?.entry_id || '');
  if (!phoneId || !wabaId) return null;
  const rows = await rest(`social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.whatsapp&external_account_id=eq.${encodeURIComponent(phoneId)}&status=eq.active&select=id,external_account_id,status,settings&limit=2`);
  const match = rows?.find(row => row.status === 'active'
    && String(row.external_account_id) === phoneId
    && String(row.settings?.phone_number_id || '') === phoneId
    && String(row.settings?.waba_id || '') === wabaId
    && row.settings?.phone_status === 'CONNECTED'
    && row.settings?.platform_type === 'CLOUD_API'
    && row.settings?.webhook_subscribed === true);
  return match?.id || null;
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

async function hasRecentWhatsappAutoReply(storedEvent, organizationId, windowMs = 24 * 60 * 60 * 1000) {
  const cutoffIso = new Date(Date.now() - windowMs).toISOString();

  // Primary guard: the welcome is tied to the sender on this connected
  // WhatsApp account, not to CRM conversation creation. CRM linking can lag
  // or fail independently, so relying only on conversation_id allows repeated
  // welcomes for the same person.
  if (storedEvent?.author_external_id) {
    const connectionFilter = storedEvent.connection_id
      ? `&connection_id=eq.${encodeURIComponent(storedEvent.connection_id)}`
      : '';
    const priorInbound = await rest(
      `social_events?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.whatsapp&event_type=eq.message.received&author_external_id=eq.${encodeURIComponent(storedEvent.author_external_id)}${connectionFilter}&id=neq.${encodeURIComponent(storedEvent.id)}&occurred_at=gte.${encodeURIComponent(cutoffIso)}&select=id&order=occurred_at.desc&limit=1`
    );
    if (Array.isArray(priorInbound) && priorInbound.length > 0) return true;
  }

  // Secondary guard for older records that have a CRM conversation but may
  // lack a reliable author id.
  if (storedEvent?.conversation_id) {
    const rows = await rest(
      `messages?organization_id=eq.${encodeURIComponent(organizationId)}&conversation_id=eq.${encodeURIComponent(storedEvent.conversation_id)}&direction=eq.outbound&select=created_at,ai_meta&order=created_at.desc&limit=30`
    );
    const cutoff = Date.now() - windowMs;
    return (rows || []).some((row) => {
      if (row?.ai_meta?.source !== 'auto_reply') return false;
      const at = Date.parse(row.created_at || '');
      return Number.isFinite(at) && at >= cutoff;
    });
  }

  return false;
}

async function processEvent(event, storedEvent, organizationId, rules) {
  // Meta echoes comments authored by the connected Page/Instagram account
  // back through the webhook. Treat those as outbound echoes so they never
  // re-enter the customer inbox or trigger an auto-reply loop.
  const ownAuthor = event.author_external_id
    && event.account_external_id
    && String(event.author_external_id) === String(event.account_external_id);
  if (ownAuthor) {
    if (storedEvent.processing_status === 'new') {
      await rest(`social_events?id=eq.${encodeURIComponent(storedEvent.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ processing_status: 'ignored' })
      });
    }
    return { matched: false, queued: false, own_echo: true };
  }

  const matches = rules.map(rule => evaluateRule(rule, event)).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  let match = matches[0];

  // Keyword matching stays fast and deterministic. When it misses an
  // actionable inbound comment/message, use semantic classification so
  // colloquial Arabic such as "حللي نشاطي" still maps to business_audit.
  if (!match && ['comment.created', 'message.received'].includes(String(event.event_type || ''))) {
    match = await classifyEventWithAI(event, rules);
  }

  if (!match) {
    // Keep actionable inbound items in the manual inbox queue even when they
    // do not match an automation rule. "ignored" is reserved for passive
    // events that need no human response (reactions, read receipts, etc.).
    const actionable = ['comment.created', 'message.received'].includes(String(event.event_type || ''));
    if (!actionable && storedEvent.processing_status === 'new') {
      await rest(`social_events?id=eq.${encodeURIComponent(storedEvent.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ processing_status: 'ignored' })
      });
    }
    return { matched: false, queued: actionable };
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
    const whatsappFollowUp = event.platform === 'whatsapp'
      && rule.intent === 'whatsapp_auto_reply'
      && await hasRecentWhatsappAutoReply(storedEvent, organizationId);
    const history = event.platform === 'whatsapp'
      ? await recentConversationHistory(storedEvent, organizationId)
      : [];

    const reserved = await createActionOnce({
      organizationId,
      eventId: storedEvent.id,
      ruleId: rule.id,
      actionType: 'auto_reply',
      status: 'pending',
      result: { platform: event.platform, external_event_id: event.external_event_id }
    });
    if (!reserved) return { matched: true, intent: rule.intent || null, confidence, auto_reply_duplicate: true };

    const text = await generateAgentReply(event, rule, {
      followUp: whatsappFollowUp,
      history
    });
    const specialistHandoff = event.platform === 'whatsapp' && /القسم المختص/.test(String(text || ''));
    try {
      const delivery = await sendAutomaticReply(event, storedEvent, organizationId, text);
      await rest(`social_event_actions?event_id=eq.${encodeURIComponent(storedEvent.id)}&action_type=eq.auto_reply&status=eq.pending`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: delivery.sent ? 'completed' : 'skipped',
          result: { text, platform: event.platform, external_event_id: event.external_event_id, ...delivery },
          completed_at: new Date().toISOString()
        })
      });
      if (delivery.sent) {
        if (specialistHandoff) {
          await createActionOnce({
            organizationId,
            eventId: storedEvent.id,
            ruleId: rule.id,
            actionType: 'specialist_handoff',
            status: 'pending',
            result: {
              platform: event.platform,
              conversation_id: storedEvent.conversation_id || null,
              reason: 'ai_uncertain_or_out_of_scope',
              text
            }
          });
        }
        await rest(`social_events?id=eq.${encodeURIComponent(storedEvent.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ processing_status: specialistHandoff ? 'new' : 'processed' })
        });
      }
    } catch (error) {
      await rest(`social_event_actions?event_id=eq.${encodeURIComponent(storedEvent.id)}&action_type=eq.auto_reply&status=eq.pending`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'failed',
          error_message: String(error.message || error).slice(0, 500),
          result: { text, platform: event.platform, external_event_id: event.external_event_id },
          completed_at: new Date().toISOString()
        })
      });
      await rest(`social_events?id=eq.${encodeURIComponent(storedEvent.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ processing_status: 'failed' })
      });
      console.warn('Social auto reply failed', { platform: event.platform, event_id: storedEvent.id, message: error.message });
    }
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
  const verified = ['meta', 'whatsapp'].includes(platform) ? validMetaSignature(req, rawBody, platform)
    : platform === 'ycloud' ? validYCloudSignature(req, rawBody) : adapter.verify(req);
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
    const isMetaWhatsApp = platform === 'whatsapp'
      || (platform === 'meta' && payload?.object === 'whatsapp_business_account');
    const normalized = isMetaWhatsApp ? normalizeWhatsApp(payload) : adapter.normalize(payload);
    if (platform === 'ycloud') {
      if (!['whatsapp.inbound_message.received', 'whatsapp.smb.message.echoes', 'whatsapp.message.updated'].includes(payload.type)) {
        return send(res, 200, { received: true, adapter: 'ycloud', ignored: 1 });
      }
      if (payload.type === 'whatsapp.inbound_message.received') {
        await ensureYCloudStatusSubscription(req);
      }
      if (normalized.length !== 1) return send(res, 422, { error: 'Invalid YCloud WhatsApp message' });
    }
    const organizations = await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
    const organizationId = organizations?.[0]?.id;
    if (!organizationId) throw new Error('Tiqnora organization is missing');

    const rules = await rest(`social_automation_rules?organization_id=eq.${encodeURIComponent(organizationId)}&is_active=eq.true&select=*`);
    let matched = 0;
    let insertedCount = 0;
    let duplicateCount = 0;
    let queued = 0;
    let ignored = 0;
    let crmLinked = 0;
    let crmErrors = 0;
    let deliveryUpdates = 0;

    for (const event of normalized) {
      if (!event.platform || !event.external_event_id) continue;
      const connectionId = platform === 'ycloud' ? await findYCloudConnectionId(organizationId, event)
        : isMetaWhatsApp ? await findMetaWhatsAppConnectionId(organizationId, event)
        : await ensureConnectionId(organizationId, event);
      if ((platform === 'ycloud' || isMetaWhatsApp) && !connectionId) {
        // An unbound account must not write customer data. Acknowledge it so
        // provider retries do not continue for a deliberately rejected phone.
        return send(res, 200, { received: true, adapter: platform, inserted: insertedCount, ignored: ignored + 1, reason: 'account_unverified' });
      }
      const dbEvent = toDbEvent(event, organizationId, connectionId);
      if (platform === 'ycloud' && event.raw_payload?.kind === 'app_echo') dbEvent.processing_status = 'ignored';
      if (platform === 'ycloud' && event.raw_payload?.kind === 'status') dbEvent.processing_status = 'processed';
      const inserted = await rest('social_events?on_conflict=platform,external_event_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(dbEvent)
      });

      let storedEvent = inserted?.[0];
      const duplicate = !storedEvent;
      if (duplicate) {
        duplicateCount += 1;
        const rows = await rest(
          `social_events?platform=eq.${encodeURIComponent(event.platform)}&external_event_id=eq.${encodeURIComponent(event.external_event_id)}&select=*&limit=1`
        );
        storedEvent = rows?.[0] || null;
      } else {
        insertedCount += 1;
      }
      if (!storedEvent) continue;

      try {
        const delivery = isDeliveryStatusEvent(event);
        const crm = delivery
          ? await persistDeliveryStatusEvent({ event, storedEvent, organizationId, rest })
          : await persistSocialCrmEvent({ event, storedEvent, organizationId, rest, useAI: false });
        if (delivery && !crm?.skipped) deliveryUpdates += 1;
        if (!crm?.skipped && crm?.conversation_id) crmLinked += 1;
        if (crm && !crm.skipped) {
          storedEvent.lead_id = crm.lead_id || storedEvent.lead_id || null;
          storedEvent.contact_id = crm.contact_id || storedEvent.contact_id || null;
          storedEvent.conversation_id = crm.conversation_id || storedEvent.conversation_id || null;
        }
      } catch (error) {
        crmErrors += 1;
        console.warn('V6 social CRM bridge failed', {
          platform: event.platform,
          event_id: storedEvent.id,
          message: String(error?.message || error).slice(0, 500)
        });
      }

      if (duplicate) continue;

      if (platform === 'ycloud' && ['app_echo', 'status'].includes(event.raw_payload?.kind)) {
        ignored += 1;
        continue;
      }

      const result = await processEvent(event, storedEvent, organizationId, rules || []);
      if (result.matched) matched += 1;
      else if (result.queued) queued += 1;
      else ignored += 1;
    }

    return send(res, 200, {
      received: true,
      adapter: platform,
      events: normalized.length,
      inserted: insertedCount,
      duplicates: duplicateCount,
      matched,
      queued,
      ignored,
      crm_linked: crmLinked,
      crm_errors: crmErrors,
      delivery_updates: deliveryUpdates
    });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}
