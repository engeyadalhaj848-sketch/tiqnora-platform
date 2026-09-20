export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const host = req.headers?.host || 'www.tiqnora.com';
  let code = '';
  try {
    const url = new URL(req.url || '/', `https://${host}`);
    code = url.searchParams.get('code') || '';
  } catch (_) {}
  if (!code) {
    res.statusCode = 400;
    return res.end(JSON.stringify({
      ok: false,
      error: 'authorization_code_missing',
      message: 'Authorization code missing. This endpoint is the AliExpress OAuth callback.',
    }));
  }
  res.statusCode = 503;
  res.end(JSON.stringify({
    ok: false,
    error: 'not_configured',
    message: 'Credentials not configured yet',
  }));
}
