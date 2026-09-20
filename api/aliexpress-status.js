/**
 * GET /api/aliexpress/status — readiness for AliExpress OAuth (no secrets).
 */
import { getConfig, buildAuthorizeUrl, createOAuthState } from '../lib/suppliers/aliexpress-oauth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  const cfg = getConfig();
  const state = createOAuthState();
  const auth = cfg.configured ? buildAuthorizeUrl({ state }) : null;
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      provider: 'aliexpress',
      credentials_configured: cfg.configured,
      missing_env: cfg.missing,
      redirect_uri: cfg.redirectUri,
      callback_path: '/api/aliexpress/callback',
      authorize_url_ready: !!(auth && auth.url && cfg.configured),
      // Only include authorize URL when configured — still no secret
      authorize_url: auth && cfg.configured ? auth.url : null,
      note: 'Create AliExpress app, set ALIEXPRESS_APP_KEY + ALIEXPRESS_APP_SECRET + ALIEXPRESS_REDIRECT_URI in Vercel, then open authorize_url.',
    })
  );
}
