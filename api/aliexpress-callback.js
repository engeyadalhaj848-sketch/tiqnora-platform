/**
 * GET /api/aliexpress/callback
 * AliExpress OAuth authorization callback (Drop Shipping).
 *
 * Expected query params (AliExpress / TOP OAuth):
 *   code  — authorization code (success path)
 *   state — CSRF state we issued (recommended)
 *   error, error_description — user denied / error path
 *
 * Never returns tokens to the browser. Redirects to admin UI.
 * Token exchange only runs when ALIEXPRESS_APP_KEY + ALIEXPRESS_APP_SECRET are set.
 */
import {
  getConfig,
  verifyOAuthState,
  exchangeCodeForToken,
} from '../lib/suppliers/aliexpress-oauth.js';

const ADMIN_OK = '/admin.html?aliexpress=connected#commerce-integrations';
const ADMIN_ERR = '/admin.html?aliexpress=error#commerce-integrations';

function redirect(res, path) {
  const loc = path.startsWith('http') ? path : `https://www.tiqnora.com${path}`;
  res.statusCode = 302;
  res.setHeader('Location', loc);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function sbRest(path, { method = 'GET', body } = {}) {
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const BASE = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
  if (!SERVICE) return { error: 'no service key' };
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: method === 'GET' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) return { error: (data && data.message) || `supabase ${r.status}`, data };
  return { data };
}

function queryFromUrl(req) {
  try {
    const host = req.headers?.host || 'www.tiqnora.com';
    const url = new URL(req.url || '/', `https://${host}`);
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  // Prefer redirect UX for browser OAuth; allow ?format=json for probes
  const q = { ...(req.query || {}), ...queryFromUrl(req) };
  const wantsJson = String(q.format || '').toLowerCase() === 'json';

  if (req.method !== 'GET') {
    return wantsJson
      ? json(res, 405, { ok: false, error: 'Method not allowed' })
      : redirect(res, `${ADMIN_ERR}&reason=method`);
  }

  // AliExpress / user denied authorization
  if (q.error) {
    const reason = String(q.error_description || q.error).slice(0, 120);
    return wantsJson
      ? json(res, 400, { ok: false, error: 'authorization_denied', message: reason })
      : redirect(res, `${ADMIN_ERR}&reason=${encodeURIComponent(String(q.error).slice(0, 40))}`);
  }

  const code = q.code ? String(q.code).trim() : '';
  const state = q.state ? String(q.state) : '';

  // Health / readiness probe (no code): safe JSON — does not crash
  if (!code) {
    const cfg = getConfig();
    const payload = {
      ok: false,
      endpoint: '/api/aliexpress/callback',
      provider: 'aliexpress',
      message: 'Authorization code missing. This URL is the OAuth callback — open AliExpress authorize URL first.',
      credentials_configured: cfg.configured,
      redirect_uri: cfg.redirectUri,
      // never list secret values
      missing_env: cfg.missing,
    };
    if (wantsJson || (req.headers.accept || '').includes('application/json')) {
      return json(res, 400, payload);
    }
    return redirect(res, `${ADMIN_ERR}&reason=missing_code`);
  }

  // CSRF state check when present
  if (state) {
    const st = verifyOAuthState(state);
    if (!st.ok) {
      return wantsJson
        ? json(res, 400, { ok: false, error: 'invalid_state', reason: st.reason })
        : redirect(res, `${ADMIN_ERR}&reason=invalid_state`);
    }
  }

  const cfg = getConfig();
  if (!cfg.configured) {
    // Callback URL is valid; exchange cannot run until App is created and env vars set
    return wantsJson
      ? json(res, 503, {
          ok: false,
          error: 'not_configured',
          message:
            'Callback received code but ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET are not configured yet. Add them in Vercel after creating the AliExpress app.',
          missing_env: cfg.missing,
        })
      : redirect(res, `${ADMIN_ERR}&reason=not_configured`);
  }

  try {
    const token = await exchangeCodeForToken(code);
    if (!token.ok) {
      // Log safe message only — no tokens, no secret
      console.error('[aliexpress/callback] token exchange failed:', token.message || token.status);
      return wantsJson
        ? json(res, 400, { ok: false, error: 'token_exchange_failed', message: token.message })
        : redirect(res, `${ADMIN_ERR}&reason=token_exchange`);
    }

    // Persist tokens server-side (service role). Never return them to client.
    const patch = {
      status: 'connected',
      account_id: token.account_id,
      seller_id: token.seller_id,
      user_id: token.user_id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
      refresh_expires_at: token.refresh_expires_at,
      last_test_at: new Date().toISOString(),
      last_error: null,
      oauth_meta: {
        user_nick: token.user_nick || null,
        account: token.account || null,
        connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    const up = await sbRest('supplier_connections?provider=eq.aliexpress', {
      method: 'PATCH',
      body: patch,
    });
    if (up.error) {
      console.error('[aliexpress/callback] supabase patch failed:', up.error);
      // Tokens obtained but storage failed — still do not expose tokens
      return wantsJson
        ? json(res, 500, { ok: false, error: 'storage_failed' })
        : redirect(res, `${ADMIN_ERR}&reason=storage`);
    }

    return wantsJson
      ? json(res, 200, { ok: true, provider: 'aliexpress', status: 'connected' })
      : redirect(res, ADMIN_OK);
  } catch (e) {
    console.error('[aliexpress/callback] unexpected:', e?.message || e);
    return wantsJson
      ? json(res, 500, { ok: false, error: 'internal_error' })
      : redirect(res, `${ADMIN_ERR}&reason=internal`);
  }
}
