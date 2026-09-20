/**
 * GET /api/aliexpress/callback  (via rewrite → this flat handler)
 * Safe without credentials: returns JSON 400 when format=json and code missing.
 */
import { getConfig, verifyOAuthState, exchangeCodeForToken } from '../lib/suppliers/aliexpress-oauth.js';

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

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET' && req.method !== 'POST') {
      return json(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const host = req.headers?.host || 'www.tiqnora.com';
    const url = new URL(req.url || '/', `https://${host}`);
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    const error = url.searchParams.get('error') || '';
    const errorDescription = url.searchParams.get('error_description') || '';
    const wantJson = url.searchParams.get('format') === 'json' || (req.headers?.accept || '').includes('application/json');

    if (error) {
      const payload = { ok: false, error, error_description: errorDescription || null };
      return wantJson ? json(res, 400, payload) : redirect(res, `${ADMIN_ERR}&reason=${encodeURIComponent(error)}`);
    }

    if (!code) {
      const payload = {
        ok: false,
        error: 'authorization_code_missing',
        message: 'Authorization code missing. This endpoint is the AliExpress OAuth callback.',
        credentials_configured: getConfig().configured,
      };
      return wantJson ? json(res, 400, payload) : redirect(res, `${ADMIN_ERR}&reason=missing_code`);
    }

    if (state) {
      const st = verifyOAuthState(state);
      if (!st.ok) {
        const payload = { ok: false, error: 'invalid_state', reason: st.reason };
        return wantJson ? json(res, 400, payload) : redirect(res, `${ADMIN_ERR}&reason=invalid_state`);
      }
    }

    const cfg = getConfig();
    if (!cfg.configured) {
      const payload = {
        ok: false,
        error: 'not_configured',
        message: 'Callback received code but ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET are not configured yet.',
        missing: cfg.missing,
      };
      return wantJson ? json(res, 503, payload) : redirect(res, `${ADMIN_ERR}&reason=not_configured`);
    }

    // Token exchange only when configured — never return tokens to browser
    const token = await exchangeCodeForToken(code);
    if (!token.ok) {
      const payload = { ok: false, error: 'token_exchange_failed', message: token.message };
      return wantJson ? json(res, 502, payload) : redirect(res, `${ADMIN_ERR}&reason=token_failed`);
    }

    // Persist is best-effort when service role present (no secrets in response)
    try {
      const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const BASE = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
      if (SERVICE && token.access_token) {
        await fetch(`${BASE}/rest/v1/supplier_connections?provider=eq.aliexpress`, {
          method: 'PATCH',
          headers: {
            apikey: SERVICE,
            Authorization: `Bearer ${SERVICE}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            access_token: token.access_token,
            refresh_token: token.refresh_token || null,
            token_expires_at: token.expires_in
              ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          }),
        });
      }
    } catch {
      /* non-fatal */
    }

    return wantJson
      ? json(res, 200, { ok: true, connected: true, message: 'AliExpress connected' })
      : redirect(res, ADMIN_OK);
  } catch (e) {
    return json(res, 500, { ok: false, error: 'internal_error', message: e.message || 'error' });
  }
}
