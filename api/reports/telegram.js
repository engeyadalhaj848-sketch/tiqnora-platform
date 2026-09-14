// Daily Tiqnora report delivery. Secrets are server-side Vercel variables only.
function json(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(body)); }
const supabaseUrl = () => process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
async function query(table, params = '') {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  const r = await fetch(`${supabaseUrl()}/rest/v1/${table}?${params}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}
async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram variables are not configured');
  const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }) });
  if (!r.ok) throw new Error(`Telegram ${r.status}`);
  return r.json();
}
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}` && req.headers['x-cron-secret'] !== cronSecret) return json(res, 401, { error: 'Unauthorized' });
  try {
    const [orders, leads, events, customers] = await Promise.all([
      query('orders', 'select=id,total,status,created_at&order=created_at.desc&limit=100'),
      query('leads', 'select=id,status,created_at&order=created_at.desc&limit=100'),
      query('social_events', 'select=id,platform,event_type,processing_status,created_at&order=created_at.desc&limit=100'),
      query('profiles', 'select=id&role=eq.customer&is_active=eq.true')
    ]);
    const day = new Date().toLocaleDateString('ar-SA', { dateStyle: 'full', timeZone: 'Asia/Riyadh' });
    const total = (orders || []).reduce((sum, x) => sum + Number(x.total || 0), 0);
    const message = [
      `<b>تقرير Tiqnora AI</b>`, `<b>${day}</b>`, '',
      `📦 الطلبات: <b>${orders?.length || 0}</b>`, `💰 إجمالي الطلبات المعروضة: <b>${total.toFixed(2)} ر.س</b>`,
      `✉️ الاستفسارات: <b>${leads?.length || 0}</b>`, `👥 العملاء النشطون: <b>${customers?.length || 0}</b>`,
      `📣 أحداث التواصل الاجتماعي: <b>${events?.length || 0}</b>`,
      `✅ تمت القراءة من قاعدة البيانات بنجاح.`, '', `المصدر: tiqnora.com`
    ].join('\n');
    await telegram(message);
    return json(res, 200, { sent: true, report: { orders: orders?.length || 0, leads: leads?.length || 0, social_events: events?.length || 0, customers: customers?.length || 0 } });
  } catch (error) { return json(res, 503, { sent: false, error: error.message }); }
}
