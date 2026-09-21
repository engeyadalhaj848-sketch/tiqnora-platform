import { createHmac, randomBytes } from 'node:crypto';

const AUTH_URL = 'https://api-sg.aliexpress.com/oauth/authorize';
const API_BASE = 'https://api-sg.aliexpress.com/rest';
const TOKEN_PATH = '/auth/token/create';
const DEFAULT_REDIRECT = 'https://www.tiqnora.com/api/aliexpress/callback';

function stateSecret() {
  return process.env.OAUTH_STATE_SECRET || process.env.ALIEXPRESS_APP_SECRET || process.env.SOCIAL_WEBHOOK_SHARED_SECRET || '';
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function getConfig() {
  const appKey = process.env.ALIEXPRESS_APP_KEY || process.env.ALIEXPRESS_API_KEY || '';
  const appSecret = process.env.ALIEXPRESS_APP_SECRET || process.env.ALIEXPRESS_API_SECRET || '';
  const redirectUri = process.env.ALIEXPRESS_REDIRECT_URI || process.env.ALIEXPRESS_REDIRECT_URL || DEFAULT_REDIRECT;
  const missing = [];
  if (!appKey) missing.push('ALIEXPRESS_APP_KEY');
  if (!appSecret) missing.push('ALIEXPRESS_APP_SECRET');
  return { appKey, appSecret, redirectUri, configured: missing.length === 0, missing, authUrl: AUTH_URL, apiBase: API_BASE, tokenPath: TOKEN_PATH };
}

export function createOAuthState(extra = {}) {
  const payload = JSON.stringify({ n: randomBytes(12).toString('hex'), exp: Date.now() + 15 * 60 * 1000, provider: 'aliexpress', ...extra });
  const secret = stateSecret();
  if (!secret) return b64url(payload);
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${b64url(payload)}.${sig}`;
}

export function verifyOAuthState(state) {
  if (!state) return { ok: false, reason: 'missing_state' };
  const secret = stateSecret();
  const parts = String(state).split('.');
  try {
    if (parts.length === 2 && secret) {
      const raw = Buffer.from(parts[0], 'base64url').toString('utf8');
      const expected = createHmac('sha256', secret).update(raw).digest('base64url');
      if (expected !== parts[1]) return { ok: false, reason: 'invalid_signature' };
      const data = JSON.parse(raw);
      if (data.exp && Date.now() > data.exp) return { ok: false, reason: 'expired' };
      return { ok: true, data };
    }
    const raw = Buffer.from(parts[0], 'base64url').toString('utf8');
    const data = JSON.parse(raw);
    if (data.exp && Date.now() > data.exp) return { ok: false, reason: 'expired' };
    if (secret) return { ok: false, reason: 'state_secret_required' };
    return { ok: true, data };
  } catch {
    return { ok: false, reason: 'malformed_state' };
  }
}

export function buildAuthorizeUrl({ state } = {}) {
  const cfg = getConfig();
  if (!cfg.appKey) return { ok: false, message: 'ALIEXPRESS_APP_KEY missing' };
  const st = state || createOAuthState();
  const u = new URL(AUTH_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('force_auth', 'true');
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('client_id', cfg.appKey);
  u.searchParams.set('state', st);
  return { ok: true, url: u.toString(), state: st };
}

export async function exchangeCodeForToken(code) {
  const cfg = getConfig();
  if (!cfg.configured) return { ok: false, status: 'not_configured', missing: cfg.missing };
  if (!code) return { ok: false, status: 'error', message: 'authorization code required' };

  try {
    const params = {
      app_key: cfg.appKey,
      code: String(code),
      sign_method: 'sha256',
      timestamp: String(Date.now()),
    };

    const sorted = Object.keys(params).sort();
    const signPayload = TOKEN_PATH + sorted.map((k) => k + params[k]).join('');
    params.sign = createHmac('sha256', cfg.appSecret)
      .update(signPayload, 'utf8')
      .digest('hex')
      .toUpperCase();

    const qs = new URLSearchParams(params);
    const res = await fetch(`${API_BASE}${TOKEN_PATH}?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const data = await res.json().catch(() => ({}));
    const body = data?.gopResponseBody && typeof data.gopResponseBody === 'string'
      ? (() => { try { return JSON.parse(data.gopResponseBody); } catch { return data; } })()
      : data;

    const apiError = body?.code && String(body.code) !== '0'
      ? (body?.msg || body?.message || body?.sub_msg || body?.error)
      : null;

    if (!res.ok || data?.success === false || apiError || !body?.access_token) {
      return {
        ok: false,
        status: 'error',
        message: apiError || data?.gopErrorCode || body?.error_description || body?.error || `token HTTP ${res.status}`,
        data,
      };
    }

    const absoluteExpiryMs = Number(body.expire_time || body.expireTime || 0);
    const refreshAbsoluteMs = Number(body.refresh_token_valid_time || body.refreshTokenValidTime || 0);
    return {
      ok: true,
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_in: body.expires_in,
      expires_at: absoluteExpiryMs > Date.now()
        ? new Date(absoluteExpiryMs).toISOString()
        : (body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000).toISOString() : null),
      refresh_expires_in: body.refresh_expires_in,
      refresh_expires_at: refreshAbsoluteMs > Date.now() ? new Date(refreshAbsoluteMs).toISOString() : null,
      seller_id: body.seller_id || body.user_id || null,
      account: body.account || body.user_nick || null,
      token_mode: absoluteExpiryMs ? 'absolute_expire_time' : 'expires_in',
      data: body,
    };
  } catch (e) {
    return { ok: false, status: 'error', message: e.message || 'token exchange failed' };
  }
}
