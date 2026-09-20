import { getConfig, buildAuthorizeUrl, createOAuthState } from '../lib/suppliers/aliexpress-oauth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
  }
  const cfg = getConfig();
  const state = createOAuthState();
  const auth = cfg.configured ? buildAuthorizeUrl({ state }) : null;
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    provider: 'aliexpress',
    credentials_configured: cfg.configured,
    missing: cfg.missing,
    redirect_uri: cfg.redirectUri,
    authorize_url_ready: !!(auth && auth.url && cfg.configured),
    authorize_url: auth && cfg.configured ? auth.url : null,
  }));
}
