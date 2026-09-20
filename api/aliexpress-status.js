export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    provider: 'aliexpress',
    credentials_configured: false,
    missing: ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET'],
  }));
}
