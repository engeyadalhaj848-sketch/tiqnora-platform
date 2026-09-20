import { createHmac, randomBytes } from 'node:crypto';

const AUTH_URL = 'https://oauth.aliexpress.com/authorize';
const TOKEN_URL = 'https://oauth.aliexpress.com/token';
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
  return { appKey, appSecret, redirectUri, configured: missing.length === 0, missing, authUrl: AUTH_URL, tokenUrl: TOKEN_URL };
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
  u.searchParams.set('client_id', cfg.appKey);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('state', st);
  u.searchParams.set('view', 'web');
  u.searchParams.set('sp', 'ae');
  return { ok: true, url: u.toString(), state: st };
}

export async function exchangeCodeForToken(code) {
  const cfg = getConfig();
  if (!cfg.configured) return { ok: false, status: 'not_configured', missing: cfg.missing };
  if (!code) return { ok: false, status: 'error', message: 'authorization code required' };
  try {
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { ok: false, status: 'error', message: data.error_description || data.error || `token HTTP ${res.status}`, data };
    }
    return { ok: true, access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in, data };
  } catch (e) {
    return { ok: false, status: 'error', message: e.message || 'token exchange failed' };
  }
}
