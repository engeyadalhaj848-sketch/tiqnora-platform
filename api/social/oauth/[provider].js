import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const providers = {
  meta: { auth: 'https://www.facebook.com/v22.0/dialog/oauth', token: 'https://graph.facebook.com/v22.0/oauth/access_token', scopes: 'business_management,pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging,instagram_basic,instagram_manage_comments' },
  whatsapp: { auth: 'https://www.facebook.com/v22.0/dialog/oauth', token: 'https://graph.facebook.com/v22.0/oauth/access_token', scopes: 'business_management,whatsapp_business_management,whatsapp_business_messaging' },
  tiktok: { auth: 'https://www.tiktok.com/v2/auth/authorize/', token: 'https://open.tiktokapis.com/v2/oauth/token/', scopes: 'user.info.basic,video.upload,video.publish' },
  linkedin: { auth: 'https://www.linkedin.com/oauth/v2/authorization', token: 'https://www.linkedin.com/oauth/v2/accessToken', scopes: 'openid profile w_member_social r_organization_social w_organization_social' }
};
const secret = () => process.env.OAUTH_STATE_SECRET || process.env.META_APP_SECRET || process.env.SOCIAL_WEBHOOK_SHARED_SECRET;
function credentials(provider) {
  if (provider === 'meta' || provider === 'whatsapp') {
    const redirect = provider === 'whatsapp'
      ? (process.env.WHATSAPP_REDIRECT_URI || process.env.META_REDIRECT_URI)
      : process.env.META_REDIRECT_URI;
    return {
      clientId: process.env.META_APP_ID,
      clientSecret: process.env.META_APP_SECRET,
      redirect,
      missing: [
        !process.env.META_APP_ID && 'META_APP_ID',
        !process.env.META_APP_SECRET && 'META_APP_SECRET',
        !redirect && (provider === 'whatsapp' ? 'WHATSAPP_REDIRECT_URI' : 'META_REDIRECT_URI')
      ].filter(Boolean)
    };
  }
  if (provider === 'tiktok') return {
    clientId: process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_API_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    redirect: process.env.TIKTOK_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URL,
    missing: [
      !(process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_API_KEY) && 'TIKTOK_CLIENT_KEY',
      !process.env.TIKTOK_CLIENT_SECRET && 'TIKTOK_CLIENT_SECRET',
      !(process.env.TIKTOK_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URL) && 'TIKTOK_REDIRECT_URI'
    ].filter(Boolean)
  };
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirect: process.env.LINKEDIN_REDIRECT_URI,
    missing: [
      !process.env.LINKEDIN_CLIENT_ID && 'LINKEDIN_CLIENT_ID',
      !process.env.LINKEDIN_CLIENT_SECRET && 'LINKEDIN_CLIENT_SECRET',
      !process.env.LINKEDIN_REDIRECT_URI && 'LINKEDIN_REDIRECT_URI'
    ].filter(Boolean)
  };
}
const b64 = x => Buffer.from(x).toString('base64url');
function sign(value) { return `${b64(value)}.${b64(createHmac('sha256', secret() || 'missing').update(value).digest())}`; }
function verify(value) { const [a, s] = String(value || '').split('.'); if (!a || !s) return null; const raw = Buffer.from(a, 'base64url').toString(); const expected = sign(raw).split('.')[1]; return s === expected ? JSON.parse(raw) : null; }
function send(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(body)); }
async function supa(path, options = {}) { const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing'); const r = await fetch(`${process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co'}/rest/v1/${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) } }); const body = await r.json().catch(() => null); if (!r.ok) throw new Error(body?.message || `Supabase ${r.status}`); return body; }
function encrypt(value) { const key = Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64'); if (key.length !== 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64 32-byte key'); const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const ciphertext = Buffer.concat([c.update(value), c.final()]); return { ciphertext: b64(ciphertext), iv: b64(iv), tag: b64(c.getAuthTag()) }; }
async function fetchTikTokUser(accessToken) {
  const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || (body?.error?.code && body.error.code !== 'ok')) throw new Error(body?.error?.message || `TikTok user info failed (${r.status})`);
  return body?.data?.user || null;
}

async function graphGet(path, accessToken) {
  const url = new URL(`https://graph.facebook.com/v22.0/${String(path || '').replace(/^\//, '')}`);
  url.searchParams.set('access_token', accessToken);
  const r = await fetch(url.toString(), { headers: { 'Cache-Control': 'no-cache' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.error) throw new Error(body?.error?.message || `Meta Graph API failed (${r.status})`);
  return body;
}

async function graphPost(path, accessToken, payload = {}) {
  const url = new URL(`https://graph.facebook.com/v22.0/${String(path || '').replace(/^\//, '')}`);
  url.searchParams.set('access_token', accessToken);
  const r = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(payload)
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.error) throw new Error(body?.error?.message || `Meta Graph API failed (${r.status})`);
  return body;
}


async function exchangeLongLivedUserToken(shortToken) {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  if (!clientId || !clientSecret || !shortToken) return { accessToken: shortToken, expiresIn: null };
  const url = new URL('https://graph.facebook.com/v22.0/oauth/access_token');
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('fb_exchange_token', shortToken);
  const r = await fetch(url.toString(), { headers: { 'Cache-Control': 'no-cache' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.error || !body.access_token) {
    console.warn('Meta long-lived token exchange failed', { code: body?.error?.code, message: body?.error?.message });
    return { accessToken: shortToken, expiresIn: null };
  }
  return { accessToken: body.access_token, expiresIn: body.expires_in ? Number(body.expires_in) : null };
}

async function discoverMetaAccounts(accessToken) {
  const discovered = [];
  let pages;
  try {
    pages = await graphGet('me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url}&limit=100', accessToken);
  } catch (e) {
    console.warn('Meta me/accounts failed', { message: e.message });
    pages = { data: [] };
  }

  for (const page of pages?.data || []) {
    if (!page?.id || !page?.access_token) continue;
    let subscribed = false;
    try {
      const sub = await graphPost(`${page.id}/subscribed_apps`, page.access_token, {
        subscribed_fields: 'messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,message_echoes,feed,mention,name,picture'
      });
      subscribed = sub?.success === true;
    } catch (e) {
      console.warn('Meta page subscribe failed', { page_id: page.id, message: e.message });
      subscribed = false;
    }

    const ig = page.instagram_business_account || null;
    discovered.push({
      platform: 'facebook',
      external_account_id: String(page.id),
      account_name: page.name || `Facebook Page ${page.id}`,
      page_access_token: page.access_token,
      tasks: page.tasks || [],
      webhook_subscribed: subscribed,
      instagram_business_account_id: ig?.id ? String(ig.id) : null,
      instagram_username: ig?.username || null,
      instagram_name: ig?.name || null,
      instagram_profile_picture_url: ig?.profile_picture_url || null
    });

    if (ig?.id) {
      // Instagram messaging/comments ride on the Page access token when linked.
      discovered.push({
        platform: 'instagram',
        external_account_id: String(ig.id),
        account_name: ig.username ? `@${ig.username}` : (ig.name || `Instagram ${ig.id}`),
        page_id: String(page.id),
        page_name: page.name || null,
        page_access_token: page.access_token,
        webhook_subscribed: subscribed,
        username: ig.username || null,
        profile_picture_url: ig.profile_picture_url || null
      });
    }
  }
  return discovered;
}

async function discoverWhatsAppAccounts(accessToken) {
  const discovered = [];
  const businesses = await graphGet('me/businesses?fields=id,name&limit=100', accessToken);
  for (const business of businesses?.data || []) {
    let wabas;
    try {
      wabas = await graphGet(`${business.id}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id,message_template_namespace&limit=100`, accessToken);
    } catch (_) {
      continue;
    }
    for (const waba of wabas?.data || []) {
      let subscribed = false;
      try {
        const sub = await graphPost(`${waba.id}/subscribed_apps`, accessToken, {});
        subscribed = sub?.success === true;
      } catch (_) {
        subscribed = false;
      }

      let phones;
      try {
        phones = await graphGet(`${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,code_verification_status&limit=100`, accessToken);
      } catch (_) {
        phones = { data: [] };
      }
      for (const phone of phones?.data || []) {
        discovered.push({
          business_id: business.id,
          business_name: business.name || null,
          waba_id: waba.id,
          waba_name: waba.name || null,
          waba_currency: waba.currency || null,
          waba_timezone_id: waba.timezone_id || null,
          phone_number_id: phone.id,
          display_phone_number: phone.display_phone_number || null,
          verified_name: phone.verified_name || null,
          quality_rating: phone.quality_rating || null,
          phone_status: phone.status || null,
          code_verification_status: phone.code_verification_status || null,
          webhook_subscribed: subscribed
        });
      }
    }
  }
  return discovered;
}

function decrypt(ciphertext, iv, tag) {
  if (!ciphertext || !iv || !tag) return null;
  const key = Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64 32-byte key');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ciphertext, 'base64url')), d.final()]).toString();
}

async function verifyAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const base = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
  const apikey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const r = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey } });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  if (!user?.id) return null;
  const rows = await supa(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active&limit=1`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.is_active === false || !['super_admin','admin','owner'].includes(String(profile.role || ''))) return null;
  return { ...user, role: profile.role };
}

async function resolveOrganization(requestedId, admin) {
  if (requestedId && ['super_admin','owner'].includes(admin.role)) return String(requestedId);
  if (requestedId) {
    const rows = await supa(`organization_members?organization_id=eq.${encodeURIComponent(requestedId)}&user_id=eq.${encodeURIComponent(admin.id)}&select=organization_id&limit=1`);
    if (Array.isArray(rows) && rows[0]?.organization_id) return String(rows[0].organization_id);
    throw Object.assign(new Error('Organization access denied'), { status: 403 });
  }
  const rows = await supa('organizations?slug=eq.tiqnora&select=id&limit=1');
  if (!Array.isArray(rows) || !rows[0]?.id) throw new Error('Organization is missing');
  return rows[0].id;
}

async function getTikTokTokenRow(organizationId) {
  const rows = await supa(`social_provider_tokens?organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.tiktok&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function refreshTikTokAccess(row) {
  if (!row?.refresh_ciphertext || !row?.refresh_iv || !row?.refresh_tag) {
    throw Object.assign(new Error('TikTok authorization needs renewal for long-lived access.'), { status: 409, code: 'reauthorize_required' });
  }
  const refreshToken = decrypt(row.refresh_ciphertext, row.refresh_iv, row.refresh_tag);
  const { clientId, clientSecret } = credentials('tiktok');
  const body = new URLSearchParams({ client_key: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken });
  const r = await fetch(providers.tiktok.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body });
  const token = await r.json().catch(() => ({}));
  if (!r.ok || !token.access_token) throw Object.assign(new Error(token.error_description || token.error || 'TikTok token refresh failed'), { status: 401, code: 'reauthorize_required' });

  const accessEncrypted = encrypt(token.access_token);
  const refreshEncrypted = token.refresh_token ? encrypt(token.refresh_token) : null;
  const patch = {
    ciphertext: accessEncrypted.ciphertext,
    iv: accessEncrypted.iv,
    tag: accessEncrypted.tag,
    scopes: token.scope || row.scopes,
    open_id: token.open_id || row.open_id,
    expires_at: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
    refresh_expires_at: token.refresh_expires_in ? new Date(Date.now() + Number(token.refresh_expires_in) * 1000).toISOString() : row.refresh_expires_at,
    updated_at: new Date().toISOString(),
    ...(refreshEncrypted ? { refresh_ciphertext: refreshEncrypted.ciphertext, refresh_iv: refreshEncrypted.iv, refresh_tag: refreshEncrypted.tag } : {})
  };
  await supa(`social_provider_tokens?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return { accessToken: token.access_token, scopes: patch.scopes, row: { ...row, ...patch } };
}

async function getTikTokAccess(organizationId) {
  const row = await getTikTokTokenRow(organizationId);
  if (!row) throw Object.assign(new Error('TikTok is not connected.'), { status: 409, code: 'not_connected' });
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp > Date.now() + 10 * 60 * 1000) return { accessToken: decrypt(row.ciphertext, row.iv, row.tag), scopes: row.scopes || '', row };
  return refreshTikTokAccess(row);
}

async function tiktokPost(url, accessToken, payload) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  const code = data?.error?.code;
  if (!r.ok || (code && code !== 'ok')) throw Object.assign(new Error(data?.error?.message || code || `TikTok API ${r.status}`), { status: r.status || 502, code: code || 'tiktok_error', detail: data });
  return data;
}

function chooseTikTokChunks(size) {
  const min = 5 * 1024 * 1024;
  const maxSingle = 64 * 1024 * 1024;
  if (size < min || size <= maxSingle) return { chunkSize: size, totalChunks: 1 };
  const chunkSize = 10 * 1024 * 1024;
  return { chunkSize, totalChunks: Math.floor(size / chunkSize) };
}

async function handleTikTokPosting(req, res) {
  try {
    const admin = await verifyAdmin(req.headers.authorization || '');
    if (!admin) return send(res, 401, { error: 'Admin authentication required' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(body.action || '').toLowerCase();
    const organizationId = await resolveOrganization(body.organization_id, admin);

    if (action === 'creator_info') {
      const token = await getTikTokAccess(organizationId);
      if (!String(token.scopes || '').split(',').map(x => x.trim()).includes('video.publish')) {
        return send(res, 403, { error: 'TikTok video.publish permission is not authorized.', code: 'scope_not_authorized' });
      }
      const api = await tiktokPost(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        token.accessToken,
        {}
      );
      return send(res, 200, { ok: true, creator: api?.data || {} });
    }

    if (action === 'init_direct_upload') {
      const size = Number(body.video_size);
      const mime = String(body.mime_type || '');
      const duration = Number(body.video_duration_sec || 0);
      const title = String(body.title || '').slice(0, 2200);
      const privacyLevel = String(body.privacy_level || '');
      const allowComment = body.allow_comment === true;
      const allowDuet = body.allow_duet === true;
      const allowStitch = body.allow_stitch === true;
      const brandContent = body.brand_content_toggle === true;
      const brandOrganic = body.brand_organic_toggle === true;
      const isAigc = body.is_aigc === true;
      const consent = body.consent === true;
      const commercialDisclosure = body.commercial_content === true;

      if (!consent) return send(res, 400, { error: 'Explicit consent is required before posting.', code: 'consent_required' });
      if (!Number.isFinite(size) || size <= 0) return send(res, 400, { error: 'Invalid video size' });
      if (size > 4 * 1024 * 1024 * 1024) return send(res, 400, { error: 'TikTok video upload limit is 4GB' });
      if (!['video/mp4','video/quicktime','video/webm'].includes(mime)) return send(res, 400, { error: 'Supported formats: MP4, MOV, WebM' });
      if (!privacyLevel) return send(res, 400, { error: 'Privacy selection is required.', code: 'privacy_required' });
      if (commercialDisclosure && !brandContent && !brandOrganic) {
        return send(res, 400, { error: 'Choose whether the commercial content promotes your own business, a third party, or both.', code: 'commercial_disclosure_required' });
      }
      if (brandContent && privacyLevel === 'SELF_ONLY') {
        return send(res, 400, { error: 'Branded content cannot use Only me privacy.', code: 'branded_content_private' });
      }

      let token = await getTikTokAccess(organizationId);
      if (!String(token.scopes || '').split(',').map(x => x.trim()).includes('video.publish')) {
        return send(res, 403, { error: 'TikTok video.publish permission is not authorized.', code: 'scope_not_authorized' });
      }

      const creatorApi = await tiktokPost(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        token.accessToken,
        {}
      );
      const creator = creatorApi?.data || {};
      const allowedPrivacy = Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options : [];
      if (!allowedPrivacy.includes(privacyLevel)) {
        return send(res, 400, { error: 'Selected privacy level is not currently allowed for this TikTok account.', code: 'privacy_level_option_mismatch' });
      }
      if (duration > 0 && Number(creator.max_video_post_duration_sec || 0) > 0 && duration > Number(creator.max_video_post_duration_sec)) {
        return send(res, 400, { error: `Video is longer than this creator's TikTok limit of ${creator.max_video_post_duration_sec} seconds.`, code: 'video_too_long' });
      }
      if (creator.comment_disabled && allowComment) return send(res, 400, { error: 'Comments are disabled in this TikTok account settings.', code: 'comment_disabled' });
      if (creator.duet_disabled && allowDuet) return send(res, 400, { error: 'Duet is disabled in this TikTok account settings.', code: 'duet_disabled' });
      if (creator.stitch_disabled && allowStitch) return send(res, 400, { error: 'Stitch is disabled in this TikTok account settings.', code: 'stitch_disabled' });

      const { chunkSize, totalChunks } = chooseTikTokChunks(size);
      const payload = {
        post_info: {
          title,
          privacy_level: privacyLevel,
          disable_comment: !allowComment,
          disable_duet: !allowDuet,
          disable_stitch: !allowStitch,
          brand_content_toggle: brandContent,
          brand_organic_toggle: brandOrganic,
          is_aigc: isAigc
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: size,
          chunk_size: chunkSize,
          total_chunk_count: totalChunks
        }
      };

      let api;
      try {
        api = await tiktokPost(
          'https://open.tiktokapis.com/v2/post/publish/video/init/',
          token.accessToken,
          payload
        );
      } catch (e) {
        if (e.code === 'access_token_invalid' && token.row?.refresh_ciphertext) {
          token = await refreshTikTokAccess(token.row);
          api = await tiktokPost(
            'https://open.tiktokapis.com/v2/post/publish/video/init/',
            token.accessToken,
            payload
          );
        } else {
          throw e;
        }
      }

      const publishId = api?.data?.publish_id;
      const uploadUrl = api?.data?.upload_url;
      if (!publishId || !uploadUrl) throw new Error('TikTok did not return a Direct Post upload URL');

      const connections = await supa(`social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.tiktok&status=eq.active&select=id&order=updated_at.desc&limit=1`);
      const connectionId = Array.isArray(connections) ? connections[0]?.id : null;
      const jobs = await supa('social_publish_jobs', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          organization_id: organizationId,
          connection_id: connectionId || null,
          platform: 'tiktok',
          media_type: 'video',
          source_type: 'direct_file_upload',
          file_name: String(body.file_name || '').slice(0, 240) || null,
          mime_type: mime,
          media_size: size,
          external_publish_id: publishId,
          status: 'uploading',
          created_by: admin.id,
          metadata: {
            mode: 'direct_post',
            chunk_size: chunkSize,
            total_chunk_count: totalChunks,
            title,
            privacy_level: privacyLevel,
            allow_comment: allowComment,
            allow_duet: allowDuet,
            allow_stitch: allowStitch,
            brand_content_toggle: brandContent,
            brand_organic_toggle: brandOrganic,
            is_aigc: isAigc
          }
        })
      });
      const job = Array.isArray(jobs) ? jobs[0] : null;

      return send(res, 200, {
        ok: true,
        publish_id: publishId,
        upload_url: uploadUrl,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
        job_id: job?.id || null
      });
    }

    if (action === 'history') {
      const jobs = await supa(`social_publish_jobs?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.tiktok&select=id,file_name,media_size,external_publish_id,status,error_message,created_at,updated_at&order=created_at.desc&limit=20`);
      return send(res, 200, { ok: true, jobs: Array.isArray(jobs) ? jobs : [] });
    }

    if (action === 'mark_uploaded') {
      if (body.job_id) await supa(`social_publish_jobs?id=eq.${encodeURIComponent(body.job_id)}&organization_id=eq.${encodeURIComponent(organizationId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'processing', updated_at: new Date().toISOString() }) });
      return send(res, 200, { ok: true });
    }

    if (action === 'status') {
      if (!body.publish_id) return send(res, 400, { error: 'publish_id required' });
      const token = await getTikTokAccess(organizationId);
      const api = await tiktokPost('https://open.tiktokapis.com/v2/post/publish/status/fetch/', token.accessToken, { publish_id: String(body.publish_id) });
      const status = String(api?.data?.status || 'processing').toLowerCase();
      const failReason = api?.data?.fail_reason || null;
      if (body.job_id) await supa(`social_publish_jobs?id=eq.${encodeURIComponent(body.job_id)}&organization_id=eq.${encodeURIComponent(organizationId)}`, { method: 'PATCH', body: JSON.stringify({ status, error_message: failReason, metadata: { tiktok_status: api?.data || {} }, updated_at: new Date().toISOString() }) });
      return send(res, 200, { ok: true, publish_id: body.publish_id, status, fail_reason: failReason, data: api?.data || {} });
    }

    if (action === 'init_upload') {
      const size = Number(body.video_size);
      const mime = String(body.mime_type || '');
      if (!Number.isFinite(size) || size <= 0) return send(res, 400, { error: 'Invalid video size' });
      if (size > 4 * 1024 * 1024 * 1024) return send(res, 400, { error: 'TikTok video upload limit is 4GB' });
      if (!['video/mp4','video/quicktime','video/webm'].includes(mime)) return send(res, 400, { error: 'Supported formats: MP4, MOV, WebM' });

      let token = await getTikTokAccess(organizationId);
      if (!String(token.scopes || '').split(',').map(x => x.trim()).includes('video.upload')) return send(res, 403, { error: 'TikTok video.upload permission is not authorized.', code: 'scope_not_authorized' });

      const { chunkSize, totalChunks } = chooseTikTokChunks(size);
      let api;
      try {
        api = await tiktokPost('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', token.accessToken, { source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: totalChunks } });
      } catch (e) {
        if (e.code === 'access_token_invalid' && token.row?.refresh_ciphertext) {
          token = await refreshTikTokAccess(token.row);
          api = await tiktokPost('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', token.accessToken, { source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: totalChunks } });
        } else throw e;
      }

      const publishId = api?.data?.publish_id;
      const uploadUrl = api?.data?.upload_url;
      if (!publishId || !uploadUrl) throw new Error('TikTok did not return an upload URL');

      const connections = await supa(`social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.tiktok&status=eq.active&select=id&order=updated_at.desc&limit=1`);
      const connectionId = Array.isArray(connections) ? connections[0]?.id : null;
      const jobs = await supa('social_publish_jobs', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          organization_id: organizationId,
          connection_id: connectionId || null,
          platform: 'tiktok',
          media_type: 'video',
          source_type: 'file_upload',
          file_name: String(body.file_name || '').slice(0, 240) || null,
          mime_type: mime,
          media_size: size,
          external_publish_id: publishId,
          status: 'uploading',
          created_by: admin.id,
          metadata: { chunk_size: chunkSize, total_chunk_count: totalChunks }
        })
      });
      const job = Array.isArray(jobs) ? jobs[0] : null;
      return send(res, 200, { ok: true, publish_id: publishId, upload_url: uploadUrl, chunk_size: chunkSize, total_chunk_count: totalChunks, job_id: job?.id || null });
    }

    return send(res, 400, { error: 'Unknown TikTok action' });
  } catch (e) {
    return send(res, e.status || 500, { error: e.message || 'Internal error', code: e.code || 'internal_error', ...(e.detail ? { detail: e.detail } : {}) });
  }
}

async function handleYCloudReply(req, res, { admin, body, event, organizationId, message }) {
  const forbidden = ['platform', 'to', 'recipient_id', 'account_external_id', 'phone_number_id', 'template', 'kind', 'parent_id', 'comment_id'];
  if (forbidden.some(key => body[key] != null)) {
    return send(res, 400, { error: 'Only event_id and message are accepted for a YCloud reply.', code: 'invalid_reply_fields' });
  }
  if (event.event_type !== 'message.received' || event.raw_payload?.kind !== 'inbound') {
    return send(res, 409, { error: 'This is not an incoming WhatsApp message.', code: 'not_inbound_message' });
  }
  if (!message || message.length > 4096) {
    return send(res, 400, { error: 'Reply text must be 1–4096 characters.', code: 'invalid_reply_text' });
  }
  try {
    await resolveOrganization(organizationId, admin);
  } catch {
    return send(res, 403, { error: 'Organization access denied.', code: 'organization_access_denied' });
  }

  const rows = event.connection_id
    ? await supa(`social_connections?id=eq.${encodeURIComponent(event.connection_id)}&organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.whatsapp&select=*&limit=1`)
    : [];
  const connection = Array.isArray(rows) ? rows[0] : null;
  const rawMessage = event.raw_payload.message || {};
  const from = String(connection?.external_account_id || '');
  const to = String(rawMessage.from || '');
  const validPhone = /^\+[1-9]\d{6,14}$/;
  if (connection?.status !== 'active' || connection?.settings?.provider !== 'ycloud'
    || connection?.settings?.ycloud_verified !== true || connection?.settings?.webhook_subscribed !== true
    || connection?.capabilities?.messaging !== true || !validPhone.test(from) || !validPhone.test(to)
    || from !== String(rawMessage.to || '')
    || to !== String(event.author_external_id || '')
    || String(connection.settings.waba_id || '') !== String(rawMessage.wabaId || '')) {
    return send(res, 409, { error: 'The incoming message does not match an enabled YCloud connection.', code: 'ycloud_connection_mismatch' });
  }
  const occurredAt = Date.parse(event.occurred_at || '');
  const ageMs = Date.now() - occurredAt;
  if (!Number.isFinite(occurredAt) || ageMs < -5 * 60 * 1000 || ageMs >= 24 * 60 * 60 * 1000) {
    return send(res, 409, { error: 'The 24-hour WhatsApp reply window has closed.', code: 'outside_session_window' });
  }
  const apiKey = process.env.YCLOUD_API_KEY;
  if (!apiKey) return send(res, 503, { error: 'YCloud sending key is not configured.', code: 'ycloud_key_missing' });

  // The incoming event UUID is a single-use reservation. A retry cannot send a second message.
  const action = {
    id: event.id, organization_id: organizationId, event_id: event.id,
    action_type: 'manual_reply', status: 'pending',
    result: { provider: 'ycloud', from, to, message_preview: message.slice(0, 120) }
  };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
  const reserve = await fetch(`${base}/rest/v1/social_event_actions`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(action)
  });
  if (!reserve.ok) {
    if (reserve.status === 409) {
      const prior = await supa(`social_event_actions?id=eq.${encodeURIComponent(event.id)}&organization_id=eq.${encodeURIComponent(organizationId)}&event_id=eq.${encodeURIComponent(event.id)}&select=status,result&limit=1`);
      if (prior?.[0]?.status === 'completed') {
        return send(res, 200, { ok: true, already_sent: true, platform: 'whatsapp', kind: 'message', outbound_external_id: prior[0].result?.outbound_external_id || null });
      }
      return send(res, 409, { error: 'A reply is already being processed. Check the inbox before trying again.', code: 'reply_already_processing' });
    }
    return send(res, 502, { error: 'Could not reserve this reply.', code: 'reply_reservation_failed' });
  }

  const payload = { from, to, type: 'text', text: { body: message } };
  if (/^wamid\./.test(String(rawMessage.wamid || ''))) payload.context = { message_id: rawMessage.wamid };
  let response;
  try {
    response = await fetch('https://api.ycloud.com/v2/whatsapp/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return send(res, 502, { error: 'YCloud response is uncertain. Check message status before another reply.', code: 'ycloud_send_uncertain' });
  }
  const apiResult = await response.json().catch(() => ({}));
  if (!response.ok || apiResult?.error) {
    const errorCode = apiResult?.error?.code || apiResult?.code || `HTTP_${response.status}`;
    await supa(`social_event_actions?id=eq.${encodeURIComponent(event.id)}&status=eq.pending`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: response.status >= 500 ? 'pending' : 'failed', error_message: String(errorCode).slice(0, 120) })
    });
    return send(res, response.status === 401 || response.status === 403 ? 503 : 502, {
      error: 'YCloud did not accept the reply. Check the account and reply window.', code: 'ycloud_send_rejected'
    });
  }

  const outboundExternalId = String(apiResult.wamid || apiResult.id || '');
  if (!outboundExternalId) {
    return send(res, 502, { error: 'YCloud accepted the request without a message ID. Check status before another reply.', code: 'ycloud_id_missing' });
  }
  await supa('social_events?on_conflict=platform,external_event_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      organization_id: organizationId, connection_id: connection.id, platform: 'whatsapp',
      event_type: 'message.sent', external_event_id: outboundExternalId,
      external_parent_id: event.external_event_id || null,
      author_external_id: 'tiqnora', author_name: 'Tiqnora', content: message,
      occurred_at: new Date().toISOString(), processing_status: 'processed',
      raw_payload: { adapter: 'tiqnora_outbound', provider: 'ycloud', status: apiResult.status || 'accepted', in_reply_to: event.id, ycloud_message_id: apiResult.id || null }
    })
  });
  await supa(`social_event_actions?id=eq.${encodeURIComponent(event.id)}&status=eq.pending`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'completed', result: { ...action.result, outbound_external_id: outboundExternalId, accepted_status: apiResult.status || 'accepted' }, completed_at: new Date().toISOString() })
  });
  await supa(`social_events?id=eq.${encodeURIComponent(event.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ processing_status: 'processed' })
  });
  return send(res, 200, { ok: true, platform: 'whatsapp', kind: 'message', status: apiResult.status || 'accepted', outbound_external_id: outboundExternalId });
}

async function handleSocialReply(req, res) {
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
    if (!message && !template?.name) return send(res, 400, { error: 'message is required (or template for WhatsApp)', code: 'message_required' });

    const orgs = await supa('organizations?slug=eq.tiqnora&select=id&limit=1');
    const organizationId = orgs?.[0]?.id;
    if (!organizationId) return send(res, 500, { error: 'Organization missing' });

    let event = null;
    if (eventId) {
      const rows = await supa(`social_events?id=eq.${encodeURIComponent(eventId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=*&limit=1`);
      event = Array.isArray(rows) ? rows[0] : null;
      if (!event) return send(res, 404, { error: 'Event not found', code: 'event_not_found' });
    }

    const effectivePlatform = platform || event?.platform;
    if (!effectivePlatform) return send(res, 400, { error: 'platform is required', code: 'platform_required' });
    if (event?.platform === 'whatsapp' && event?.raw_payload?.adapter === 'ycloud') {
      return handleYCloudReply(req, res, { admin, body, event, organizationId, message });
    }
    const eventType = String(event?.event_type || '');
    const kind = body.kind || (eventType.startsWith('comment.') ? 'comment' : (body.comment_id ? 'comment' : 'message'));
    const externalParentId = body.comment_id || body.parent_id || event?.external_event_id || null;
    const recipientId = body.recipient_id || body.to || event?.author_external_id || null;
    const accountExternalId = body.account_external_id || event?.account_external_id || null;

    function pageTokenFromSettings(settings) {
      const enc = settings?.page_access_token_enc;
      if (!enc?.ciphertext || !enc?.iv || !enc?.tag) return null;
      try { return decrypt(enc.ciphertext, enc.iv, enc.tag); } catch (e) {
        console.warn('Page token decrypt failed', { message: e.message });
        return null;
      }
    }

    async function loadConnection(plat, externalId) {
      let q = `social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.${encodeURIComponent(plat)}&status=eq.active&select=*&order=updated_at.desc&limit=5`;
      if (externalId) q = `social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.${encodeURIComponent(plat)}&external_account_id=eq.${encodeURIComponent(externalId)}&select=*&limit=1`;
      const rows = await supa(q);
      return Array.isArray(rows) ? rows[0] : null;
    }

    let apiResult = null;
    let usedConnection = null;

    if (effectivePlatform === 'facebook' || effectivePlatform === 'instagram') {
      const conn = await loadConnection(effectivePlatform, accountExternalId);
      usedConnection = conn;
      let pageToken = conn ? pageTokenFromSettings(conn.settings || {}) : null;
      if (!pageToken && effectivePlatform === 'instagram') {
        const pageId = conn?.settings?.page_id;
        if (pageId) {
          const pageConn = await loadConnection('facebook', pageId);
          pageToken = pageConn ? pageTokenFromSettings(pageConn.settings || {}) : null;
          usedConnection = pageConn || conn;
        }
      }
      if (!pageToken) return send(res, 409, { error: 'Page access token missing. Reconnect Meta from Integrations.', code: 'token_missing', reconnect: true });
      if (kind === 'comment') {
        if (!externalParentId) return send(res, 400, { error: 'comment_id required', code: 'comment_id_required' });
        apiResult = effectivePlatform === 'instagram'
          ? await graphPost(`${externalParentId}/replies`, pageToken, { message })
          : await graphPost(`${externalParentId}/comments`, pageToken, { message });
      } else {
        if (!recipientId) return send(res, 400, { error: 'recipient_id required for messaging', code: 'recipient_required' });
        const pageId = usedConnection?.platform === 'facebook' ? usedConnection.external_account_id : (usedConnection?.settings?.page_id || accountExternalId);
        const path = pageId ? `${pageId}/messages` : 'me/messages';
        apiResult = await graphPost(path, pageToken, { recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text: message } });
      }
    } else if (effectivePlatform === 'whatsapp') {
      const eventConnections = event?.connection_id
        ? await supa(`social_connections?id=eq.${encodeURIComponent(event.connection_id)}&organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.whatsapp&select=*&limit=1`)
        : [];
      const conn = eventConnections?.[0] || await loadConnection('whatsapp', accountExternalId);
      if (conn?.settings?.provider === 'ycloud') {
        return send(res, 409, { error: 'Replies for YCloud connections are not configured yet.', code: 'ycloud_reply_unavailable' });
      }
      usedConnection = conn;
      const phoneNumberId = conn?.settings?.phone_number_id || conn?.external_account_id;
      if (!phoneNumberId) return send(res, 409, { error: 'WhatsApp Phone Number ID not connected', code: 'whatsapp_not_connected', reconnect: true });
      if (body.phone_number_id && String(body.phone_number_id) !== String(phoneNumberId)) {
        return send(res, 409, { error: 'Requested WhatsApp Phone Number ID does not match the connected account', code: 'phone_number_mismatch' });
      }
      let accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN || null;
      if (!accessToken) {
        const rows = await supa(`social_provider_tokens?organization_id=eq.${encodeURIComponent(organizationId)}&provider=in.(whatsapp,meta)&select=ciphertext,iv,tag,provider&order=updated_at.desc`);
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row) accessToken = decrypt(row.ciphertext, row.iv, row.tag);
      }
      if (!accessToken) return send(res, 409, { error: 'WhatsApp access token missing. Reconnect WhatsApp.', code: 'token_missing', reconnect: true });
      const to = recipientId || body.to;
      if (!to) return send(res, 400, { error: 'recipient phone required', code: 'recipient_required' });
      if (event?.occurred_at && !template?.name) {
        const ageMs = Date.now() - new Date(event.occurred_at).getTime();
        if (ageMs > 24 * 60 * 60 * 1000) {
          return send(res, 409, { error: 'Outside 24h customer care window. Use an approved WhatsApp template.', code: 'outside_session_window', requires_template: true });
        }
      }
      const payload = template?.name ? {
        messaging_product: 'whatsapp',
        to: String(to).replace(/[^\d]/g, ''),
        type: 'template',
        template: { name: template.name, language: { code: template.language || 'ar' }, components: template.components || [] }
      } : {
        messaging_product: 'whatsapp',
        to: String(to).replace(/[^\d]/g, ''),
        type: 'text',
        text: { body: message, preview_url: false }
      };
      apiResult = await graphPost(`${phoneNumberId}/messages`, accessToken, payload);
    } else {
      return send(res, 400, { error: `Unsupported platform: ${effectivePlatform}`, code: 'unsupported_platform' });
    }

    const outboundExternalId = String(apiResult?.id || apiResult?.message_id || apiResult?.messages?.[0]?.id || `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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
        raw_payload: { adapter: 'tiqnora_outbound', in_reply_to: eventId }
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
          result: { outbound_external_id: outboundExternalId, platform: effectivePlatform, kind, message_preview: String(message || '').slice(0, 120) },
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
    console.warn('Social reply failed', { code: e.code || 'reply_failed', message: e.message });
    return send(res, 502, { error: e.message || 'Reply failed', code: e.code || 'reply_failed' });
  }
}

export default async function handler(req, res) {
  const provider = String(req.query?.provider || '').toLowerCase();
  const action = String(req.query?.action || '').toLowerCase();
  if (req.method === 'POST' && (action === 'reply' || provider === 'reply')) return handleSocialReply(req, res);
  const cfg = providers[provider];
  if (!cfg) return send(res, 404, { error: 'Unsupported provider' });
  const scopes = provider === 'tiktok' ? (process.env.TIKTOK_SCOPES || cfg.scopes) : cfg.scopes;
  if (provider === 'tiktok' && req.method === 'POST') return handleTikTokPosting(req, res);
  if (req.method === 'GET' && !req.query.code) {
    if (!secret()) return send(res, 503, { error: 'OAuth state secret is not configured' });
    const state = sign(JSON.stringify({ provider, organization_id: String(req.query.organization_id || ''), nonce: randomBytes(12).toString('hex'), exp: Date.now() + 600000 }));
    const { clientId, redirect, missing } = credentials(provider);
    const initialMissing = missing.filter(name => !name.endsWith('_SECRET') && name !== 'META_APP_SECRET' && name !== 'LINKEDIN_CLIENT_SECRET');
    if (initialMissing.length) return send(res, 503, { error: 'OAuth credentials are not configured for this provider', provider, missing: initialMissing });
    const url = new URL(cfg.auth);
    // TikTok's OAuth authorize endpoint requires client_key; other providers use client_id.
    url.searchParams.set(provider === 'tiktok' ? 'client_key' : 'client_id', clientId);
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    // Facebook Login for Business: use config_id (permissions live in Meta dashboard config).
    // Do NOT send scope when config_id is present — avoids Invalid Scopes errors.
    const metaConfigId = String(process.env.META_LOGIN_CONFIG_ID || '').trim();
    if (provider === 'meta' && metaConfigId) {
      url.searchParams.set('config_id', metaConfigId);
    } else {
      url.searchParams.set('scope', scopes);
    }
    return res.redirect(url.toString());
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  const state = verify(req.query.state); if (!state || state.exp < Date.now() || state.provider !== provider) return send(res, 400, { error: 'Invalid or expired OAuth state' });
  if (req.query.error) return send(res, 400, { error: String(req.query.error_description || req.query.error) });
  try {
    const { clientId, clientSecret, redirect, missing } = credentials(provider);
    if (missing.length) return send(res, 503, { error: 'OAuth credentials are not configured for this provider', provider, missing });
    const body = provider === 'tiktok' ? new URLSearchParams({ client_key: clientId, client_secret: clientSecret, code: req.query.code, grant_type: 'authorization_code', redirect_uri: redirect }) : new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: req.query.code, redirect_uri: redirect, grant_type: 'authorization_code' });
    const tokenRes = await fetch(cfg.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); const token = await tokenRes.json(); if (!tokenRes.ok || !(token.access_token || token.data?.access_token)) throw new Error(token.error_description || token.error?.message || 'Token exchange failed');
    let access = token.access_token || token.data.access_token;
    const encrypted = encrypt(access);
    const refreshToken = token.refresh_token || token.data?.refresh_token || null;
    const refreshEncrypted = refreshToken ? encrypt(refreshToken) : null;
    const org = state.organization_id || (await supa('organizations?slug=eq.tiqnora&select=id&limit=1'))?.[0]?.id;
    if (!org) throw new Error('Organization is missing');
    const grantedScopes = token.scope || token.data?.scope || scopes;
    const tokenRow = {
      organization_id: org,
      provider,
      ...encrypted,
      scopes: grantedScopes,
      open_id: token.open_id || token.data?.open_id || null,
      expires_at: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
      refresh_expires_at: token.refresh_expires_in ? new Date(Date.now() + Number(token.refresh_expires_in) * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
      ...(refreshEncrypted ? { refresh_ciphertext: refreshEncrypted.ciphertext, refresh_iv: refreshEncrypted.iv, refresh_tag: refreshEncrypted.tag } : {})
    };
    await supa('social_provider_tokens?on_conflict=organization_id,provider', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(tokenRow) });

    let accountMetadata = null;
    if (provider === 'meta') {
      const exchanged = await exchangeLongLivedUserToken(access);
      if (exchanged.accessToken && exchanged.accessToken !== access) {
        const longEncrypted = encrypt(exchanged.accessToken);
        const patch = {
          ciphertext: longEncrypted.ciphertext,
          iv: longEncrypted.iv,
          tag: longEncrypted.tag,
          expires_at: exchanged.expiresIn ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString() : null,
          updated_at: new Date().toISOString()
        };
        await supa(`social_provider_tokens?organization_id=eq.${encodeURIComponent(org)}&provider=eq.meta`, {
          method: 'PATCH',
          body: JSON.stringify(patch)
        });
        access = exchanged.accessToken;
      }

      const accounts = await discoverMetaAccounts(access);
      for (const account of accounts) {
        const { page_access_token, platform, external_account_id, account_name, ...settingsRest } = account;
        // Store page token encrypted inside settings so outbound replies work without exposing secrets to the browser.
        let tokenVault = null;
        if (page_access_token) {
          try { tokenVault = encrypt(page_access_token); } catch (_) { tokenVault = null; }
        }
        await supa('social_connections?on_conflict=organization_id,platform,external_account_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            organization_id: org,
            platform,
            external_account_id,
            account_name,
            status: 'active',
            capabilities: {
              inbox: true,
              messaging: platform === 'facebook' || platform === 'instagram',
              comments: true,
              webhooks: Boolean(account.webhook_subscribed)
            },
            settings: {
              ...settingsRest,
              page_access_token_enc: tokenVault || null,
              token_present: Boolean(tokenVault)
            },
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
      }
      accountMetadata = {
        pages_found: accounts.filter(a => a.platform === 'facebook').length,
        instagram_found: accounts.filter(a => a.platform === 'instagram').length,
        page_ids: accounts.filter(a => a.platform === 'facebook').map(a => a.external_account_id),
        instagram_ids: accounts.filter(a => a.platform === 'instagram').map(a => a.external_account_id),
        webhook_subscribed: accounts.some(a => a.webhook_subscribed)
      };
    } else if (provider === 'tiktok') {
      const user = await fetchTikTokUser(access);
      if (user?.open_id) {
        accountMetadata = { open_id: user.open_id, union_id: user.union_id || null, display_name: user.display_name || null, avatar_url: user.avatar_url || null };
        await supa('social_connections?on_conflict=organization_id,platform,external_account_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            organization_id: org,
            platform: 'tiktok',
            external_account_id: user.open_id,
            account_name: user.display_name || 'TikTok',
            status: 'active',
            capabilities: { login: true, profile: true, draft_upload: grantedScopes.includes('video.upload'), direct_post: grantedScopes.includes('video.publish') },
            settings: { avatar_url: user.avatar_url || null, union_id: user.union_id || null },
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
      }
    } else if (provider === 'whatsapp') {
      const accounts = await discoverWhatsAppAccounts(access);
      for (const account of accounts) {
        await supa('social_connections?on_conflict=organization_id,platform,external_account_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            organization_id: org,
            platform: 'whatsapp',
            external_account_id: account.phone_number_id,
            account_name: account.verified_name || account.display_phone_number || 'WhatsApp',
            status: 'active',
            capabilities: { inbox: true, messaging: true, templates: true, webhooks: true },
            settings: account,
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
      }
      accountMetadata = {
        accounts_found: accounts.length,
        phone_number_ids: accounts.map(x => x.phone_number_id),
        waba_ids: [...new Set(accounts.map(x => x.waba_id))],
        webhook_subscribed: accounts.some(x => x.webhook_subscribed)
      };
    }

    const displayNames = { meta: 'Meta / Facebook / Instagram', whatsapp: 'WhatsApp Cloud', tiktok: 'TikTok', linkedin: 'LinkedIn' };
    await supa('integration_connections?on_conflict=provider', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        provider,
        display_name: displayNames[provider] || provider,
        enabled: true,
        status: 'connected',
        mode: provider === 'tiktok' ? (process.env.TIKTOK_MODE || 'production') : 'production',
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { scopes: grantedScopes, ...(accountMetadata || {}) }
      })
    });
    return res.redirect(`/admin.html#social-inbox&oauth=${encodeURIComponent(provider)}&status=connected`);
  } catch (e) { return send(res, 500, { error: e.message }); }
}

