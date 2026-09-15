import { createHmac, randomBytes, createCipheriv } from 'node:crypto';

const providers = {
  meta: { auth: 'https://www.facebook.com/v22.0/dialog/oauth', token: 'https://graph.facebook.com/v22.0/oauth/access_token', scopes: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_manage_comments,instagram_manage_messages,pages_messaging' },
  whatsapp: { auth: 'https://www.facebook.com/v22.0/dialog/oauth', token: 'https://graph.facebook.com/v22.0/oauth/access_token', scopes: 'business_management,whatsapp_business_management,whatsapp_business_messaging' },
  tiktok: { auth: 'https://www.tiktok.com/v2/auth/authorize/', token: 'https://open.tiktokapis.com/v2/oauth/token/', scopes: 'user.info.basic,video.upload' },
  linkedin: { auth: 'https://www.linkedin.com/oauth/v2/authorization', token: 'https://www.linkedin.com/oauth/v2/accessToken', scopes: 'openid profile w_member_social r_organization_social w_organization_social' }
};
const secret = () => process.env.OAUTH_STATE_SECRET || process.env.META_APP_SECRET || process.env.SOCIAL_WEBHOOK_SHARED_SECRET;
const b64 = x => Buffer.from(x).toString('base64url');
function sign(value) { return `${b64(value)}.${b64(createHmac('sha256', secret() || 'missing').update(value).digest())}`; }
function verify(value) { const [a, s] = String(value || '').split('.'); if (!a || !s) return null; const raw = Buffer.from(a, 'base64url').toString(); const expected = sign(raw).split('.')[1]; return s === expected ? JSON.parse(raw) : null; }
function send(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(body)); }
async function supa(path, options = {}) { const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing'); const r = await fetch(`${process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co'}/rest/v1/${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) } }); const body = await r.json().catch(() => null); if (!r.ok) throw new Error(body?.message || `Supabase ${r.status}`); return body; }
function encrypt(value) { const key = Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || '', 'base64'); if (key.length !== 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64 32-byte key'); const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const ciphertext = Buffer.concat([c.update(value), c.final()]); return { ciphertext: b64(ciphertext), iv: b64(iv), tag: b64(c.getAuthTag()) }; }
export default async function handler(req, res) {
  const provider = String(req.query?.provider || '').toLowerCase(); const cfg = providers[provider];
  if (!cfg) return send(res, 404, { error: 'Unsupported provider' });
  if (req.method === 'GET' && !req.query.code) {
    if (!secret()) return send(res, 503, { error: 'OAuth state secret is not configured' });
    const state = sign(JSON.stringify({ provider, organization_id: String(req.query.organization_id || ''), nonce: randomBytes(12).toString('hex'), exp: Date.now() + 600000 }));
    const clientId = provider === 'meta' || provider === 'whatsapp' ? process.env.META_APP_ID : provider === 'tiktok' ? process.env.TIKTOK_CLIENT_KEY : process.env.LINKEDIN_CLIENT_ID;
    const redirect = provider === 'meta' || provider === 'whatsapp' ? process.env.META_REDIRECT_URI : provider === 'tiktok' ? process.env.TIKTOK_REDIRECT_URI : process.env.LINKEDIN_REDIRECT_URI;
    if (!clientId || !redirect) return send(res, 503, { error: 'OAuth credentials are not configured for this provider' });
    const url = new URL(cfg.auth); url.searchParams.set('client_id', clientId); url.searchParams.set('redirect_uri', redirect); url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', cfg.scopes); url.searchParams.set('state', state);
    return res.redirect(url.toString());
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  const state = verify(req.query.state); if (!state || state.exp < Date.now() || state.provider !== provider) return send(res, 400, { error: 'Invalid or expired OAuth state' });
  if (req.query.error) return send(res, 400, { error: String(req.query.error_description || req.query.error) });
  try {
    const clientId = provider === 'meta' || provider === 'whatsapp' ? process.env.META_APP_ID : provider === 'tiktok' ? process.env.TIKTOK_CLIENT_KEY : process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = provider === 'meta' || provider === 'whatsapp' ? process.env.META_APP_SECRET : provider === 'tiktok' ? process.env.TIKTOK_CLIENT_SECRET : process.env.LINKEDIN_CLIENT_SECRET;
    const redirect = provider === 'meta' || provider === 'whatsapp' ? process.env.META_REDIRECT_URI : provider === 'tiktok' ? process.env.TIKTOK_REDIRECT_URI : process.env.LINKEDIN_REDIRECT_URI;
    const body = provider === 'tiktok' ? new URLSearchParams({ client_key: clientId, client_secret: clientSecret, code: req.query.code, grant_type: 'authorization_code', redirect_uri: redirect }) : new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: req.query.code, redirect_uri: redirect, grant_type: 'authorization_code' });
    const tokenRes = await fetch(cfg.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); const token = await tokenRes.json(); if (!tokenRes.ok || !(token.access_token || token.data?.access_token)) throw new Error(token.error_description || token.error?.message || 'Token exchange failed');
    const access = token.access_token || token.data.access_token; const encrypted = encrypt(access); const org = state.organization_id || (await supa('organizations?slug=eq.tiqnora&select=id&limit=1'))?.[0]?.id; if (!org) throw new Error('Organization is missing');
    await supa('social_provider_tokens?on_conflict=organization_id,provider', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ organization_id: org, provider, ...encrypted, scopes: token.scope || token.data?.scope || cfg.scopes, expires_at: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null }) });
    await supa('integration_connections?provider=eq.' + provider, { method: 'PATCH', body: JSON.stringify({ enabled: true, status: 'connected', mode: 'production', last_checked_at: new Date().toISOString(), metadata: { scopes: token.scope || cfg.scopes } }) });
    return res.redirect(`/admin.html#social-inbox&oauth=${encodeURIComponent(provider)}&status=connected`);
  } catch (e) { return send(res, 500, { error: e.message }); }
}
