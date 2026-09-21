import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_UPLOAD_INIT = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
const TIKTOK_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
const ALLOWED_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
const MIN_CHUNK = 5 * 1024 * 1024;
const DEFAULT_CHUNK = 10 * 1024 * 1024;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  if (!SERVICE) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY missing'), { status: 503 });
  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw Object.assign(new Error(data?.message || data || `Supabase ${r.status}`), { status: r.status });
  return data;
}

async function verifyAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE },
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  if (!user?.id) return null;
  const rows = await sb(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active&limit=1`);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.is_active === false) return null;
  if (!['super_admin', 'admin', 'owner'].includes(String(profile.role || ''))) return null;
  return { ...user, role: profile.role };
}

function encryptionKey() {
  const key = Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw Object.assign(new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64 32-byte key'), { status: 503 });
  return key;
}

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value)), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

function decrypt(ciphertext, iv, tag) {
  if (!ciphertext || !iv || !tag) return null;
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString();
}

function tiktokCredentials() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_API_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw Object.assign(new Error('TikTok credentials missing'), { status: 503 });
  return { clientKey, clientSecret };
}

async function tokenRowForOrg(organizationId) {
  const rows = await sb(
    `social_provider_tokens?organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.tiktok&select=*&limit=1`
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function refreshTikTokToken(row) {
  if (!row?.refresh_ciphertext || !row?.refresh_iv || !row?.refresh_tag) {
    throw Object.assign(new Error('TikTok authorization needs to be renewed once to enable long-lived access.'), {
      status: 409,
      code: 'reauthorize_required',
    });
  }
  const refreshToken = decrypt(row.refresh_ciphertext, row.refresh_iv, row.refresh_tag);
  const { clientKey, clientSecret } = tiktokCredentials();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const r = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body,
  });
  const token = await r.json().catch(() => ({}));
  if (!r.ok || !token.access_token) {
    throw Object.assign(new Error(token.error_description || token.error || 'TikTok token refresh failed'), {
      status: r.status || 401,
      code: 'reauthorize_required',
    });
  }

  const access = encrypt(token.access_token);
  const nextRefresh = token.refresh_token ? encrypt(token.refresh_token) : null;
  const patch = {
    ciphertext: access.ciphertext,
    iv: access.iv,
    tag: access.tag,
    scopes: token.scope || row.scopes,
    open_id: token.open_id || row.open_id,
    expires_at: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
    refresh_expires_at: token.refresh_expires_in ? new Date(Date.now() + Number(token.refresh_expires_in) * 1000).toISOString() : row.refresh_expires_at,
    updated_at: new Date().toISOString(),
    ...(nextRefresh ? {
      refresh_ciphertext: nextRefresh.ciphertext,
      refresh_iv: nextRefresh.iv,
      refresh_tag: nextRefresh.tag,
    } : {}),
  };
  await sb(`social_provider_tokens?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: patch });
  return { accessToken: token.access_token, scopes: patch.scopes, row: { ...row, ...patch } };
}

async function getTikTokAccess(organizationId) {
  const row = await tokenRowForOrg(organizationId);
  if (!row) throw Object.assign(new Error('TikTok is not connected.'), { status: 409, code: 'not_connected' });
  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  const refreshSoon = !expiresMs || expiresMs <= Date.now() + 10 * 60 * 1000;
  if (!refreshSoon) {
    return { accessToken: decrypt(row.ciphertext, row.iv, row.tag), scopes: row.scopes || '', row };
  }
  return refreshTikTokToken(row);
}

async function resolveOrganization(requestedId, admin) {
  if (requestedId) {
    if (admin.role === 'super_admin' || admin.role === 'owner') return String(requestedId);
    const rows = await sb(
      `organization_members?organization_id=eq.${encodeURIComponent(requestedId)}&user_id=eq.${encodeURIComponent(admin.id)}&select=organization_id&limit=1`
    );
    if (Array.isArray(rows) && rows[0]?.organization_id) return String(rows[0].organization_id);
    throw Object.assign(new Error('Organization access denied'), { status: 403 });
  }
  const rows = await sb('organizations?slug=eq.tiqnora&select=id&limit=1');
  if (!Array.isArray(rows) || !rows[0]?.id) throw Object.assign(new Error('Tiqnora organization not found'), { status: 500 });
  return rows[0].id;
}

function chooseChunks(size) {
  if (size < MIN_CHUNK) return { chunkSize: size, totalChunks: 1 };
  if (size <= 64 * 1024 * 1024) return { chunkSize: size, totalChunks: 1 };
  const chunkSize = DEFAULT_CHUNK;
  const totalChunks = Math.floor(size / chunkSize);
  return { chunkSize, totalChunks };
}

async function tiktokPost(url, accessToken, payload) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  const code = data?.error?.code;
  if (!r.ok || (code && code !== 'ok')) {
    const err = Object.assign(
      new Error(data?.error?.message || code || `TikTok API ${r.status}`),
      { status: r.status || 502, code: code || 'tiktok_error', detail: data }
    );
    throw err;
  }
  return data;
}

async function initUpload({ organizationId, admin, fileName, mimeType, videoSize }) {
  const size = Number(videoSize);
  if (!Number.isFinite(size) || size <= 0) throw Object.assign(new Error('Invalid video size'), { status: 400 });
  if (size > MAX_VIDEO_BYTES) throw Object.assign(new Error('TikTok video upload limit is 4GB'), { status: 400 });
  if (!ALLOWED_MIME.has(mimeType)) throw Object.assign(new Error('Supported formats: MP4, MOV, WebM'), { status: 400 });

  const token = await getTikTokAccess(organizationId);
  if (!String(token.scopes || '').split(',').map(x => x.trim()).includes('video.upload')) {
    throw Object.assign(new Error('TikTok video.upload permission is not authorized.'), { status: 403, code: 'scope_not_authorized' });
  }

  const { chunkSize, totalChunks } = chooseChunks(size);
  let api;
  try {
    api = await tiktokPost(TIKTOK_UPLOAD_INIT, token.accessToken, {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: size,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
      },
    });
  } catch (e) {
    if (e.code === 'access_token_invalid' && token.row?.refresh_ciphertext) {
      const refreshed = await refreshTikTokToken(token.row);
      api = await tiktokPost(TIKTOK_UPLOAD_INIT, refreshed.accessToken, {
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: size,
          chunk_size: chunkSize,
          total_chunk_count: totalChunks,
        },
      });
    } else {
      throw e;
    }
  }

  const publishId = api?.data?.publish_id;
  const uploadUrl = api?.data?.upload_url;
  if (!publishId || !uploadUrl) throw Object.assign(new Error('TikTok did not return an upload URL'), { status: 502 });

  const connections = await sb(
    `social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.tiktok&status=eq.active&select=id&order=updated_at.desc&limit=1`
  );
  const connectionId = Array.isArray(connections) ? connections[0]?.id : null;

  const jobs = await sb('social_publish_jobs', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      organization_id: organizationId,
      connection_id: connectionId || null,
      platform: 'tiktok',
      media_type: 'video',
      source_type: 'file_upload',
      file_name: fileName || null,
      mime_type: mimeType,
      media_size: size,
      external_publish_id: publishId,
      status: 'uploading',
      created_by: admin.id,
      metadata: { chunk_size: chunkSize, total_chunk_count: totalChunks },
    },
  });
  const job = Array.isArray(jobs) ? jobs[0] : null;

  return {
    ok: true,
    publish_id: publishId,
    upload_url: uploadUrl,
    chunk_size: chunkSize,
    total_chunk_count: totalChunks,
    job_id: job?.id || null,
  };
}

async function fetchStatus({ organizationId, publishId, jobId }) {
  if (!publishId) throw Object.assign(new Error('publish_id required'), { status: 400 });
  const token = await getTikTokAccess(organizationId);
  const api = await tiktokPost(TIKTOK_STATUS_URL, token.accessToken, { publish_id: publishId });
  const status = String(api?.data?.status || 'processing').toLowerCase();
  const failReason = api?.data?.fail_reason || null;

  if (jobId) {
    await sb(`social_publish_jobs?id=eq.${encodeURIComponent(jobId)}&organization_id=eq.${encodeURIComponent(organizationId)}`, {
      method: 'PATCH',
      body: {
        status,
        error_message: failReason,
        metadata: { tiktok_status: api?.data || {} },
        updated_at: new Date().toISOString(),
      },
    });
  }
  return { ok: true, publish_id: publishId, status, fail_reason: failReason, data: api?.data || {} };
}

async function markUploaded({ organizationId, jobId }) {
  if (!jobId) return { ok: true };
  await sb(`social_publish_jobs?id=eq.${encodeURIComponent(jobId)}&organization_id=eq.${encodeURIComponent(organizationId)}`, {
    method: 'PATCH',
    body: { status: 'processing', updated_at: new Date().toISOString() },
  });
  return { ok: true };
}

async function history(organizationId) {
  const rows = await sb(
    `social_publish_jobs?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.tiktok&select=id,file_name,media_size,external_publish_id,status,error_message,created_at,updated_at&order=created_at.desc&limit=20`
  );
  return { ok: true, jobs: Array.isArray(rows) ? rows : [] };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const admin = await verifyAdmin(req.headers.authorization || '');
    if (!admin) return json(res, 401, { error: 'Admin authentication required' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(body.action || '').toLowerCase();
    const organizationId = await resolveOrganization(body.organization_id, admin);

    if (action === 'init_upload') {
      const result = await initUpload({
        organizationId,
        admin,
        fileName: String(body.file_name || '').slice(0, 240),
        mimeType: String(body.mime_type || ''),
        videoSize: body.video_size,
      });
      return json(res, 200, result);
    }
    if (action === 'status') {
      return json(res, 200, await fetchStatus({
        organizationId,
        publishId: String(body.publish_id || ''),
        jobId: body.job_id ? String(body.job_id) : null,
      }));
    }
    if (action === 'mark_uploaded') {
      return json(res, 200, await markUploaded({ organizationId, jobId: String(body.job_id || '') }));
    }
    if (action === 'history') {
      return json(res, 200, await history(organizationId));
    }

    return json(res, 400, { error: 'Unknown action', allowed: ['init_upload', 'mark_uploaded', 'status', 'history'] });
  } catch (e) {
    return json(res, e.status || 500, {
      error: e.message || 'Internal error',
      code: e.code || 'internal_error',
      ...(e.detail ? { detail: e.detail } : {}),
    });
  }
}
