/**
 * System health check — public, no secrets.
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end(JSON.stringify({ ok: false, error: 'method' }));

  const checks = { api: true, supabase: false, gemini: !!process.env.GEMINI_API_KEY, telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) };
  let latencyMs = null;
  try {
    const t0 = Date.now();
    const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/saas_plans?select=slug&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }
    });
    latencyMs = Date.now() - t0;
    checks.supabase = r.ok || r.status === 401 || r.status === 200;
    // 200 with data or even empty is fine; 401 means key issue
    if (r.status >= 500) checks.supabase = false;
  } catch {
    checks.supabase = false;
  }

  const ok = checks.api && checks.supabase;
  return res.status(ok ? 200 : 503).end(JSON.stringify({
    ok,
    service: 'tiqnora-ai',
    time: new Date().toISOString(),
    checks,
    latencyMs,
    version: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    deploy_probe: true,
    whop_fix: true
  }));
}
