import { createDecipheriv } from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v22.0';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function decrypt(ciphertext, iv, tag) {
  if (!ciphertext || !iv || !tag) return null;
  const key = Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64 32-byte key');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ciphertext, 'base64url')), d.final()]).toString();
}

async function supa(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.headers?.Prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.message || body?.hint || `Supabase ${r.status}`);
  return body;
}

async function verifyAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const apikey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey }
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  if (!user?.id) return null;
  const rows = await supa(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active&limit=1`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.is_active === false || !['super_admin','admin','owner'].includes(String(profile.role || ''))) return null;
  return { user, profile, role: profile.role };
}

async function graphRequest(method, path, accessToken, payload) {
  const url = new URL(`${GRAPH}/${String(path || '').replace(/^\//, '')}`);
  url.searchParams.set('access_token', accessToken);
  const opts = { method, headers: { 'Cache-Control': 'no-cache' } };
  if (payload && method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(payload);
  }
  const r = await fetch(url.toString(), opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.error) {
    const err = new Error(body?.error?.message || `Meta Graph API ${r.status}`);
    err.code = body?.error?.code || body?.error?.error_subcode || 'meta_api_error';
    err.type = body?.error?.type || null;
    err.status = r.status;
    err.detail = { code: body?.error?.code, type: body?.error?.type, error_subcode: body?.error?.error_subcode, fbtrace_id: body?.error?.fbtrace_id };
    throw err;
  }
  return body;
}

async function getProviderToken(organizationId, provider) {
  const rows = await supa(
    `social_provider_tokens?organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.${encodeURIComponent(provider)}&select=*&limit=1`
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  try {
    return { accessToken: decrypt(row.ciphertext, row.iv, row.tag), row };
  } catch (e) {
    console.warn('Token decrypt failed', { provider, message: e.message });
    return null;
  }
}

function pageTokenFromSettings(settings) {
  const enc = settings?.page_access_token_enc;
  if (!enc?.ciphertext || !enc?.iv || !enc?.tag) return null;
  try {
    return decrypt(enc.ciphertext, enc.iv, enc.tag);
  } catch (e) {
    console.warn('Page token decrypt failed', { message: e.message });
    return null;
  }
}

async function loadConnection(organizationId, platform, externalAccountId) {
  let q = `social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.${encodeURIComponent(platform)}&status=eq.active&select=*&order=updated_at.desc&limit=5`;
  if (externalAccountId) {
    q = `social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.${encodeURIComponent(platform)}&external_account_id=eq.${encodeURIComponent(externalAccountId)}&select=*&limit=1`;
  }
  const rows = await supa(q);
  return Array.isArray(rows) ? rows[0] : null;
}

async function replyFacebookComment({ pageToken, commentId, message }) {
  return graphRequest('POST', `${commentId}/comments`, pageToken, { message });
}

async function replyInstagramComment({ pageToken, commentId, message }) {
  // Instagram comment replies use the same Graph edge with the Page token of the linked page.
  return graphRequest('POST', `${commentId}/replies`, pageToken, { message });
}

async function replyMessenger({ pageToken, recipientId, message, pageId }) {
  // Prefer page-scoped messaging.
  const path = pageId ? `${pageId}/messages` : 'me/messages';
  return graphRequest('POST', path, pageToken, {
    recipient: { id: recipientId },
    messaging_type: 'RESPONSE',
    message: { text: message }
  });
}

async function replyInstagramDm({ pageToken, recipientId, message, pageId }) {
  const path = pageId ? `${pageId}/messages` : 'me/messages';
  return graphRequest('POST', path, pageToken, {
    recipient: { id: recipientId },
    messaging_type: 'RESPONSE',
    message: { text: message }
  });
}

async function replyWhatsApp({ accessToken, phoneNumberId, to, message, template }) {
  const path = `${phoneNumberId}/messages`;
  let payload;
  if (template?.name) {
    payload = {
      messaging_product: 'whatsapp',
      to: String(to).replace(/[^\d]/g, ''),
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language || 'ar' },
        components: template.components || []
      }
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: String(to).replace(/[^\d]/g, ''),
      type: 'text',
      text: { body: message, preview_url: false }
    };
  }
  return graphRequest('POST', path, accessToken, payload);
}

function classifyEvent(event) {
  const type = String(event?.event_type || '');
  if (type.startsWith('comment.')) return 'comment';
  if (type.startsWith('message.') || type === 'messaging_postback') return 'message';
  return 'unknown';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return send(res, 204, {});
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const admin = await verifyAdmin(req.headers.authorization || req.headers.Authorization);
    if (!admin) return send(res, 401, { error: 'Admin authentication required', code: 'unauthorized' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const message = String(body.message || body.text || '').trim();
    const eventId = body.event_id || null;
    const platform = String(body.platform || '').toLowerCase();
    const template = body.template || null;

    if (!message && !template?.name) {
      return send(res, 400, { error: 'message is required (or template for WhatsApp)', code: 'message_required' });
    }

    const orgs = await supa('organizations?slug=eq.tiqnora&select=id&limit=1');
    const organizationId = orgs?.[0]?.id;
    if (!organizationId) return send(res, 500, { error: 'Organization missing' });

    let event = null;
    if (eventId) {
      const rows = await supa(
        `social_events?id=eq.${encodeURIComponent(eventId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=*&limit=1`
      );
      event = Array.isArray(rows) ? rows[0] : null;
      if (!event) return send(res, 404, { error: 'Event not found', code: 'event_not_found' });
    }

    const effectivePlatform = platform || event?.platform;
    if (!effectivePlatform) return send(res, 400, { error: 'platform is required', code: 'platform_required' });

    const kind = body.kind || (event ? classifyEvent(event) : (body.comment_id ? 'comment' : 'message'));
    const externalParentId = body.comment_id || body.parent_id || event?.external_event_id || null;
    const recipientId = body.recipient_id || body.to || event?.author_external_id || null;
    const accountExternalId = body.account_external_id || event?.account_external_id || null;

    let apiResult = null;
    let usedConnection = null;

    if (effectivePlatform === 'facebook' || effectivePlatform === 'instagram') {
      const conn = await loadConnection(organizationId, effectivePlatform, accountExternalId);
      usedConnection = conn;
      let pageToken = conn ? pageTokenFromSettings(conn.settings || {}) : null;

      // Fallback: try the linked facebook page connection when Instagram token missing
      if (!pageToken && effectivePlatform === 'instagram') {
        const pageId = conn?.settings?.page_id;
        if (pageId) {
          const pageConn = await loadConnection(organizationId, 'facebook', pageId);
          pageToken = pageConn ? pageTokenFromSettings(pageConn.settings || {}) : null;
          usedConnection = pageConn || conn;
        }
      }

      if (!pageToken) {
        return send(res, 409, {
          error: 'Page access token missing. Reconnect Meta from Integrations.',
          code: 'token_missing',
          reconnect: true
        });
      }

      if (kind === 'comment') {
        if (!externalParentId) return send(res, 400, { error: 'comment_id required', code: 'comment_id_required' });
        if (effectivePlatform === 'instagram') {
          apiResult = await replyInstagramComment({ pageToken, commentId: externalParentId, message });
        } else {
          apiResult = await replyFacebookComment({ pageToken, commentId: externalParentId, message });
        }
      } else {
        if (!recipientId) return send(res, 400, { error: 'recipient_id required for messaging', code: 'recipient_required' });
        const pageId = usedConnection?.platform === 'facebook'
          ? usedConnection.external_account_id
          : (usedConnection?.settings?.page_id || accountExternalId);
        if (effectivePlatform === 'instagram') {
          apiResult = await replyInstagramDm({ pageToken, recipientId, message, pageId });
        } else {
          apiResult = await replyMessenger({ pageToken, recipientId, message, pageId });
        }
      }
    } else if (effectivePlatform === 'whatsapp') {
      const conn = await loadConnection(organizationId, 'whatsapp', accountExternalId);
      usedConnection = conn;
      const phoneNumberId = body.phone_number_id || conn?.external_account_id || conn?.settings?.phone_number_id;
      if (!phoneNumberId) {
        return send(res, 409, { error: 'WhatsApp Phone Number ID not connected', code: 'whatsapp_not_connected', reconnect: true });
      }

      // Prefer env system user token if present; else org provider token
      let accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN || null;
      if (!accessToken) {
        const tok = await getProviderToken(organizationId, 'whatsapp') || await getProviderToken(organizationId, 'meta');
        accessToken = tok?.accessToken || null;
      }
      if (!accessToken) {
        return send(res, 409, { error: 'WhatsApp access token missing. Reconnect WhatsApp.', code: 'token_missing', reconnect: true });
      }

      const to = recipientId || body.to;
      if (!to) return send(res, 400, { error: 'recipient phone required', code: 'recipient_required' });

      // Session window: if last inbound > 24h and no template, warn (still attempt if template provided)
      if (event?.occurred_at && !template?.name) {
        const ageMs = Date.now() - new Date(event.occurred_at).getTime();
        if (ageMs > 24 * 60 * 60 * 1000) {
          return send(res, 409, {
            error: 'Outside 24h customer care window. Use an approved WhatsApp template.',
            code: 'outside_session_window',
            requires_template: true
          });
        }
      }

      apiResult = await replyWhatsApp({ accessToken, phoneNumberId, to, message, template });
    } else {
      return send(res, 400, { error: `Unsupported platform: ${effectivePlatform}`, code: 'unsupported_platform' });
    }

    // Record outbound event + action (idempotent-ish via new external id)
    const outboundExternalId = String(
      apiResult?.id || apiResult?.message_id || apiResult?.messages?.[0]?.id || `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );

    const outboundEvent = await supa('social_events?on_conflict=platform,external_event_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        organization_id: organizationId,
        connection_id: usedConnection?.id || event?.connection_id || null,
        platform: effectivePlatform,
        event_type: kind === 'comment' ? 'comment.replied' : 'message.sent',
        external_event_id: outboundExternalId,
        external_parent_id: externalParentId || null,
        author_external_id: 'tiqnora',
        author_name: 'Tiqnora',
        content: message || (template ? `[template:${template.name}]` : null),
        occurred_at: new Date().toISOString(),
        processing_status: 'processed',
        raw_payload: { adapter: 'tiqnora_outbound', api_result: { id: apiResult?.id || apiResult?.message_id || null }, in_reply_to: eventId }
      })
    });

    if (eventId) {
      await supa(`social_events?id=eq.${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ processing_status: 'processed' })
      });
      await supa('social_event_actions', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          organization_id: organizationId,
          event_id: eventId,
          action_type: 'manual_reply',
          status: 'completed',
          result: {
            outbound_external_id: outboundExternalId,
            platform: effectivePlatform,
            kind,
            message_preview: String(message || '').slice(0, 120)
          },
          completed_at: new Date().toISOString()
        })
      });
    }

    return send(res, 200, {
      ok: true,
      platform: effectivePlatform,
      kind,
      outbound_external_id: outboundExternalId,
      event_id: Array.isArray(outboundEvent) ? outboundEvent[0]?.id : null,
      api: { id: apiResult?.id || apiResult?.message_id || apiResult?.messages?.[0]?.id || null }
    });
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    console.warn('Social reply failed', {
      code: e.code || 'reply_failed',
      message: e.message,
      type: e.type || null,
      detail: e.detail || null
    });
    return send(res, status >= 500 ? 502 : status, {
      error: e.message || 'Reply failed',
      code: e.code || 'reply_failed',
      detail: e.detail || undefined
    });
  }
}
