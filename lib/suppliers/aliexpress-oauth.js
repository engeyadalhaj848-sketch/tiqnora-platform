/**
 * AliExpress Drop Shipping OAuth helpers (Tiqnora)
 * Docs:
 *  - Authorize: https://oauth.aliexpress.com/authorize
 *  - Token:     https://oauth.aliexpress.com/token  (grant_type=authorization_code)
 *  - IOP alt:   /auth/token/create  (requires signed IOP client)
 *
 * No hardcoded App Key / Secret. Read from process.env only.
 */
import { createHmac, randomBytes } from 'node:crypto';

const AUTH_URL = 'https://oauth.aliexpress.com/authorize';
const TOKEN_URL = 'https://oauth.aliexpress.com/token';
const DEFAULT_REDIRECT = 'https://www.tiqnora.com/api/aliexpress/callback';

function stateSecret() {
  return (
    process.env.OAUTH_STATE_SECRET ||
    process.env.ALIEXPRESS_APP_SECRET ||
    process.env.SOCIAL_WEBHOOK_SHARED_SECRET ||
    ''
  );
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function getConfig() {
  const appKey = process.env.ALIEXPRESS_APP_KEY || process.env.ALIEXPRESS_API_KEY || '';
  const appSecret = process.env.ALIEXPRESS_APP_SECRET || process.env.ALIEXPRESS_API_SECRET || '';
  const redirectUri =
    process.env.ALIEXPRESS_REDIRECT_URI ||
    process.env.ALIEXPRESS_REDIRECT_URL ||
    DEFAULT_REDIRECT;
  const missing = [];
  if (!appKey) missing.push('ALIEXPRESS_APP_KEY');
  if (!appSecret) missing.push('ALIEXPRESS_APP_SECRET');
  return {
    appKey,
    appSecret,
    redirectUri,
    configured: missing.length === 0,
    missing,
    authUrl: AUTH_URL,
    tokenUrl: TOKEN_URL,
  };
}

/** Signed OAuth state (CSRF). Payload: { n, exp, provider } */
export function createOAuthState(extra = {}) {
  const payload = JSON.stringify({
    n: randomBytes(12).toString('hex'),
    exp: Date.now() + 15 * 60 * 1000,
    provider: 'aliexpress',
    ...extra,
  });
  const secret = stateSecret();
  if (!secret) {
    // Still emit a state value so flow can run; verification will require secret in production
    return b64url(payload);
  }
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
      if (data.provider !== 'aliexpress') return { ok: false, reason: 'wrong_provider' };
      if (data.exp && Date.now() > Number(data.exp)) return { ok: false, reason: 'expired' };
      return { ok: true, data };
    }
    // Unsigned fallback (dev / secret not set): parse base64 payload only, reject if expired shape unknown
    if (parts.length === 1) {
      const raw = Buffer.from(parts[0], 'base64url').toString('utf8');
      const data = JSON.parse(raw);
      if (data.provider !== 'aliexpress') return { ok: false, reason: 'wrong_provider' };
      if (data.exp && Date.now() > Number(data.exp)) return { ok: false, reason: 'expired' };
      // Require secret in production-like environments
      if (process.env.VERCEL_ENV === 'production' && !secret) {
        return { ok: false, reason: 'state_secret_required' };
      }
      return { ok: true, data, weak: true };
    }
  } catch {
    return { ok: false, reason: 'malformed_state' };
  }
  return { ok: false, reason: 'malformed_state' };
}

/** Build AliExpress authorization URL (for future admin "Connect" button). */
export function buildAuthorizeUrl({ state } = {}) {
  const cfg = getConfig();
  const st = state || createOAuthState();
  const url = new URL(AUTH_URL);
  url.searchParams.set('response_type', 'code');
  if (cfg.appKey) url.searchParams.set('client_id', cfg.appKey);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('state', st);
  url.searchParams.set('view', 'web');
  url.searchParams.set('sp', 'ae');
  return { url: url.toString(), state: st, configured: cfg.configured, missing: cfg.missing };
}

/**
 * Exchange authorization code for tokens.
 * Official form POST to https://oauth.aliexpress.com/token
 * Does nothing useful without real APP_KEY + APP_SECRET.
 */
export async function exchangeCodeForToken(code) {
  const cfg = getConfig();
  if (!cfg.configured) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET not set in environment',
      missing: cfg.missing,
    };
  }
  if (!code) {
    return { ok: false, status: 'error', message: 'authorization code required' };
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.appKey,
    client_secret: cfg.appSecret,
    code: String(code),
    redirect_uri: cfg.redirectUri,
    sp: 'ae',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok || !data?.access_token) {
    return {
      ok: false,
      status: 'error',
      message: data?.error_description || data?.error || data?.message || `token exchange HTTP ${res.status}`,
      // never echo secret; code may be one-time — do not log full body in production callers
    };
  }

  const expiresIn = Number(data.expires_in) || 0;
  const refreshExpiresIn = Number(data.refresh_expires_in) || 0;
  return {
    ok: true,
    status: 'connected',
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_in: expiresIn,
    refresh_expires_in: refreshExpiresIn,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    refresh_expires_at: refreshExpiresIn
      ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
      : data.refresh_token_valid_time
        ? new Date(Number(data.refresh_token_valid_time)).toISOString()
        : null,
    account_id: data.account_id || null,
    seller_id: data.seller_id || null,
    user_id: data.user_id || null,
    user_nick: data.user_nick || null,
    account: data.account || null,
    // strip tokens from meta snapshot stored separately
  };
}

export default {
  getConfig,
  createOAuthState,
  verifyOAuthState,
  buildAuthorizeUrl,
  exchangeCodeForToken,
};
