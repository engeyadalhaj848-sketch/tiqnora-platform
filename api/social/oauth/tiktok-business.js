function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  const authCode = String(req.query?.auth_code || req.query?.code || '').trim();
  const accountId = String(req.query?.id || '').trim();

  if (!authCode) {
    return send(res, 200, {
      ok: true,
      provider: 'tiktok_business',
      status: 'callback_ready',
      message: 'TikTok for Business callback is ready.'
    });
  }

  // The authorization code is intentionally not logged or returned.
  // Token exchange is performed only after the developer app credentials
  // are configured in Vercel, because the code is short-lived and single-use.
  if (!process.env.TIKTOK_BUSINESS_APP_ID || !process.env.TIKTOK_BUSINESS_APP_SECRET) {
    return send(res, 503, {
      ok: false,
      provider: 'tiktok_business',
      code: 'credentials_not_configured',
      message: 'TikTok for Business credentials are not configured yet.',
      account_id: accountId || null
    });
  }

  return send(res, 409, {
    ok: false,
    provider: 'tiktok_business',
    code: 'token_exchange_pending',
    message: 'TikTok for Business callback received. Token exchange will be enabled after app setup is completed.',
    account_id: accountId || null
  });
}
