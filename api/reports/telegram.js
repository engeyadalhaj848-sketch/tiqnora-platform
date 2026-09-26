import { ensureDailyWorkforceTasks, runAutonomousGrowth, runQueuedTasks } from '../../lib/autonomous-sales.js';
import { processPublishingQueue } from '../../lib/v6/social-runtime.js';
import {
  handleTelegramUpdate,
  telegramConfigurationStatus,
  telegramTargetChatId,
  verifyTelegramWebhook
} from '../../lib/telegram-command-center.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function supabaseUrl() {
  return (process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/, '');
}

function supabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';
}

async function query(table, params) {
  const key = supabaseKey();
  const r = await fetch(`${supabaseUrl()}/rest/v1/${table}?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!r.ok) throw new Error(`Supabase ${table}: ${r.status}`);
  return r.json();
}

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = await telegramTargetChatId();
  if (!token || !chatId) throw new Error('Telegram bot is not paired yet');
  const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}`);
  return r.json();
}

async function telegramIfConfigured(text) {
  const status = await telegramConfigurationStatus();
  if (!status.configured) return false;
  await telegram(text);
  return true;
}

function dayAgoIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function isAuthorizedCron(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    return req.headers.authorization === `Bearer ${cronSecret}` || req.headers['x-cron-secret'] === cronSecret;
  }
  // Fallback for existing deployments where CRON_SECRET has not been added yet.
  // Vercel adds this header to scheduled invocations. Add CRON_SECRET in Vercel
  // for strong protection against spoofed requests.
  return Boolean(req.headers['x-vercel-cron-schedule']);
}

async function runGrowthCron(res, publishing = { processed: 0, results: [] }) {
  const workforce = await ensureDailyWorkforceTasks();
  const growth = await runAutonomousGrowth();
  const saved = growth?.prospecting?.saved || 0;
  const completed = growth?.tasks?.completed || 0;
  const failed = growth?.tasks?.failed || 0;

  await telegramIfConfigured([
    '<b>Tiqnora Daily Workforce</b>',
    '',
    `Agents enabled: <b>${workforce?.agents_enabled?.length || 0}</b>`,
    `New daily tasks: <b>${workforce?.tasks_created || 0}</b>`,
    `AI prospects: <b>${growth?.prospecting?.candidates || 0}</b>`,
    `Saved/updated prospects: <b>${saved}</b>`,
    `AI mode: <b>${growth?.degraded ? 'degraded' : 'normal'}</b>`,
    `Completed agent tasks: <b>${completed}</b>`,
    `Failed tasks: <b>${failed}</b>`,
    `Scheduled social jobs processed: <b>${publishing.processed || 0}</b>`,
    '',
    'Drafts stay under review. No automatic publishing or customer outreach before approval.'
  ].join('\n')).catch(error => console.warn('Growth Telegram notification failed', { message: error.message }));

  return json(res, 200, { ok: true, mode: 'growth', workforce, growth, publishing });
}

async function runDailyReport(res, publishing = { processed: 0, results: [] }) {
  const taskRun = await runQueuedTasks().catch(error => ({
    due: 0,
    completed: 0,
    failed: 1,
    runs: [{ failed: true, error: error.message }]
  }));

  const since = dayAgoIso();
  const [orders, leads, events, customers, aiConv, aiFailed, agents, prospects, tasks] = await Promise.all([
    query('orders', 'select=id,total,status,created_at&order=created_at.desc&limit=100'),
    query('leads', 'select=id,status,created_at&order=created_at.desc&limit=100').catch(() => []),
    query('social_events', 'select=id,platform,event_type,processing_status,created_at&order=created_at.desc&limit=100').catch(() => []),
    query('profiles', 'select=id&role=eq.customer&is_active=eq.true').catch(() => []),
    query('ai_conversations', `select=id,status,provider,model,created_at&created_at=gte.${since}&order=created_at.desc&limit=200`).catch(() => []),
    query('ai_conversations', `select=id&status=eq.failed&created_at=gte.${since}`).catch(() => []),
    query('ai_agents', 'select=slug,name,status,is_enabled,provider,model').catch(() => []),
    query('prospects', 'select=id,priority,status,opportunity_score&order=opportunity_score.desc&limit=500').catch(() => []),
    query('ai_tasks', 'select=id,status,priority&order=created_at.desc&limit=200').catch(() => [])
  ]);

  const day = new Date().toLocaleDateString('ar-SA', { dateStyle: 'full', timeZone: 'Asia/Riyadh' });
  const total = (orders || []).reduce((sum, x) => sum + Number(x.total || 0), 0);
  const pendingOrders = (orders || []).filter(o => o.status === 'pending').length;
  const activeAgents = (agents || []).filter(a => a.is_enabled && a.status === 'active').length;
  const aiOk = (aiConv || []).filter(c => c.status === 'completed').length;
  const highProspects = (prospects || []).filter(p => p.priority === 'HIGH').length;
  const todoTasks = (tasks || []).filter(t => t.status === 'todo').length;
  const providersConfigured = [
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY ? 'Gemini' : null,
    process.env.OPENAI_API_KEY ? 'OpenAI' : null,
    process.env.ANTHROPIC_API_KEY ? 'Claude' : null,
    process.env.XAI_API_KEY ? 'Grok' : null
  ].filter(Boolean);

  const message = [
    `<b>تقرير Tiqnora AI اليومي</b>`,
    `<b>${day}</b>`,
    '',
    `📦 الطلبات (آخر 100): <b>${orders?.length || 0}</b>`,
    `⏳ بانتظار المعالجة: <b>${pendingOrders}</b>`,
    `💰 إجمالي المعروض: <b>${total.toFixed(2)} ر.س</b>`,
    `✉️ الاستفسارات: <b>${leads?.length || 0}</b>`,
    `👥 العملاء النشطون: <b>${customers?.length || 0}</b>`,
    `📣 أحداث التواصل: <b>${events?.length || 0}</b>`,
    `📤 منشورات مجدولة تمت معالجتها: <b>${publishing.processed || 0}</b>`,
    '',
    `<b>Growth Engine</b>`,
    `🎯 فرص CRM: <b>${prospects?.length || 0}</b>`,
    `🔥 فرص HIGH: <b>${highProspects}</b>`,
    `✅ مهام نُفذت في هذا التشغيل: <b>${taskRun.completed || 0}</b>`,
    `📝 مهام متبقية: <b>${todoTasks}</b>`,
    '',
    `<b>فريق العمل الذكي (24 ساعة)</b>`,
    `🤖 وكلاء نشطون: <b>${activeAgents}</b> / ${agents?.length || 0}`,
    `💬 محادثات ناجحة: <b>${aiOk}</b>`,
    `⚠️ محادثات فاشلة: <b>${aiFailed?.length || 0}</b>`,
    `🔑 مزودون مُعدّون: <b>${providersConfigured.length ? providersConfigured.join(', ') : 'لا يوجد'}</b>`,
    '',
    `🌐 الموقع: tiqnora.com`,
    `✅ تمت القراءة من قاعدة البيانات بنجاح.`
  ].join('\n');

  await telegram(message);
  return json(res, 200, {
    sent: true,
    mode: 'report',
    report: {
      orders: orders?.length || 0,
      pendingOrders,
      leads: leads?.length || 0,
      social_events: events?.length || 0,
      customers: customers?.length || 0,
      prospects: prospects?.length || 0,
      high_prospects: highProspects,
      task_run: taskRun,
      todo_tasks: todoTasks,
      ai_completed_24h: aiOk,
      ai_failed_24h: aiFailed?.length || 0,
      active_agents: activeAgents,
      providers: providersConfigured,
      publishing
    }
  });
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });

  const route = String(req.query?.route || '');

  if (route === 'telegram_health') {
    const status = await telegramConfigurationStatus().catch(() => ({
      configured: false,
      bot_token_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      chat_id_configured: false,
      paired_in_database: false
    }));
    return json(res, 200, {
      ok: true,
      telegram_configured: status.configured,
      bot_token_configured: status.bot_token_configured,
      chat_id_configured: status.chat_id_configured,
      paired_in_database: status.paired_in_database,
      webhook_url: 'https://tiqnora.com/api/telegram/webhook'
    });
  }

  if (route === 'telegram_webhook') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST required' });
    if (!verifyTelegramWebhook(req)) return json(res, 401, { error: 'Invalid Telegram webhook secret' });

    try {
      const result = await handleTelegramUpdate(req.body || {});
      return json(res, 200, { ok: true, result });
    } catch (error) {
      console.error('Telegram command center failed', { message: error.message, stack: error.stack });
      // Return 200 after logging to avoid Telegram retry storms for application errors.
      return json(res, 200, { ok: false, error: error.message });
    }
  }

  if (!isAuthorizedCron(req)) return json(res, 401, { error: 'Unauthorized' });

  try {
    const publishing = await processPublishingQueue({ limit: 10 }).catch(error => ({
      ok: false,
      processed: 0,
      results: [],
      error: error.message
    }));
    const schedule = String(req.headers['x-vercel-cron-schedule'] || '');
    if (schedule === '0 5 * * *') return await runGrowthCron(res, publishing);
    return await runDailyReport(res, publishing);
  } catch (error) {
    console.error('Scheduled Tiqnora job failed', { message: error.message, stack: error.stack });
    return json(res, 503, { sent: false, error: error.message });
  }
}
