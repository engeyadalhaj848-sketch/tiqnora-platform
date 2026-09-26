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
  return Boolean(req.headers['x-vercel-cron-schedule']);
}

function timedStep(step, startMs, extra = {}) {
  const duration_ms = Math.max(0, Date.now() - startMs);
  const payload = {
    step,
    duration_ms,
    status: extra.status || 'ok',
    provider: extra.provider || null,
    fallback_used: Boolean(extra.fallback_used),
    ...extra
  };
  console.info('cron_timing', JSON.stringify(payload));
  return payload;
}

async function runGrowthCron(res, publishing = { processed: 0, results: [] }) {
  const cronStarted = Date.now();
  const timings = [];

  let workforce = { agents_enabled: [], tasks_created: 0, tasks_existing: 0, error: null };
  let growth = {
    degraded: true,
    prospecting: { candidates: 0, saved: 0, degraded: true },
    tasks: { completed: 0, failed: 0, due: 0 },
    error: null
  };

  const tParallel = Date.now();
  const settled = await Promise.allSettled([
    ensureDailyWorkforceTasks(),
    runAutonomousGrowth({ taskLimit: 3, skipProspectingIfRecent: true })
  ]);

  if (settled[0].status === 'fulfilled') {
    workforce = settled[0].value || workforce;
    timings.push(timedStep('ensureDailyWorkforceTasks', tParallel, {
      status: 'ok',
      tasks_created: workforce.tasks_created,
      tasks_existing: workforce.tasks_existing
    }));
  } else {
    const error = settled[0].reason;
    console.error('ensureDailyWorkforceTasks failed', { message: error?.message, stack: error?.stack });
    workforce = {
      agents_enabled: [],
      tasks_created: 0,
      tasks_existing: 0,
      error: String(error?.message || error).slice(0, 500)
    };
    timings.push(timedStep('ensureDailyWorkforceTasks', tParallel, { status: 'error' }));
  }

  if (settled[1].status === 'fulfilled') {
    growth = settled[1].value || growth;
    timings.push(timedStep('runAutonomousGrowth', tParallel, {
      status: growth?.degraded ? 'degraded' : 'ok',
      provider: growth?.prospecting?.provider || growth?.tasks?.runs?.[0]?.provider || null,
      fallback_used: Boolean(growth?.prospecting?.fallback_used || growth?.degraded),
      candidates: growth?.prospecting?.candidates,
      tasks_completed: growth?.tasks?.completed
    }));
  } else {
    const error = settled[1].reason;
    console.error('runAutonomousGrowth failed', { message: error?.message, stack: error?.stack });
    growth = {
      degraded: true,
      prospecting: {
        candidates: 0,
        saved: 0,
        degraded: true,
        error_code: error?.code || 'GROWTH_FAILED',
        error_message: String(error?.message || error).slice(0, 500)
      },
      tasks: { completed: 0, failed: 1, due: 0 },
      error: String(error?.message || error).slice(0, 500)
    };
    timings.push(timedStep('runAutonomousGrowth', tParallel, { status: 'error' }));
  }

  if (Array.isArray(growth?.timings)) timings.push(...growth.timings);

  const saved = growth?.prospecting?.saved || 0;
  const completed = growth?.tasks?.completed || 0;
  const failed = growth?.tasks?.failed || 0;
  const provider = growth?.prospecting?.provider || growth?.tasks?.runs?.[0]?.provider || 'unknown';
  const fallback = Boolean(growth?.degraded || growth?.prospecting?.fallback_used || growth?.prospecting?.degraded);

  const tTelegram = Date.now();
  await telegramIfConfigured([
    '<b>Tiqnora Daily Workforce</b>',
    '',
    `Agents enabled: <b>${workforce?.agents_enabled?.length || 0}</b>`,
    `New daily tasks: <b>${workforce?.tasks_created || 0}</b>`,
    `Existing daily tasks: <b>${workforce?.tasks_existing || 0}</b>`,
    `AI prospects: <b>${growth?.prospecting?.candidates || 0}</b>`,
    `Saved/updated prospects: <b>${saved}</b>`,
    `AI mode: <b>${growth?.degraded ? 'degraded' : 'normal'}</b>`,
    `Provider: <b>${provider}</b>${fallback ? ' (fallback)' : ''}`,
    `Completed agent tasks: <b>${completed}</b>`,
    `Failed tasks: <b>${failed}</b>`,
    `Scheduled social jobs processed: <b>${publishing.processed || 0}</b>`,
    workforce?.error ? `Workforce note: ${String(workforce.error).slice(0, 200)}` : null,
    growth?.prospecting?.error_message ? `Prospecting note: ${String(growth.prospecting.error_message).slice(0, 200)}` : null,
    growth?.prospecting?.skipped_reason ? `Prospecting: ${String(growth.prospecting.skipped_reason).slice(0, 120)}` : null,
    '',
    'Drafts stay under review. No automatic publishing or customer outreach before approval.'
  ].filter(Boolean).join('\n')).catch(error => console.warn('Growth Telegram notification failed', { message: error.message }));
  timings.push(timedStep('telegram_notify', tTelegram, { status: 'ok' }));
  timings.push(timedStep('growth_cron_total', cronStarted, { status: 'ok' }));

  return json(res, 200, {
    ok: true,
    mode: 'growth',
    workforce,
    growth,
    publishing,
    timings
  });
}

async function runDailyReport(res, publishing = { processed: 0, results: [] }) {
  const taskRun = await runQueuedTasks({ limit: 3 }).catch(error => ({
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
      paired_in_database: false,
      paired: false,
      chat_id_source: null,
      reachable: null,
      last_success: null,
      last_error: null
    }));
    return json(res, 200, {
      ok: true,
      telegram_configured: status.configured,
      configured: status.configured,
      paired: Boolean(status.paired || status.chat_id_configured),
      bot_token_configured: status.bot_token_configured,
      chat_id_configured: status.chat_id_configured,
      chat_id_source: status.chat_id_source || null,
      paired_in_database: status.paired_in_database,
      reachable: status.reachable,
      last_success: status.last_success,
      last_error: status.last_error,
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
      return json(res, 200, { ok: false, error: error.message });
    }
  }

  if (!isAuthorizedCron(req)) return json(res, 401, { error: 'Unauthorized' });

  try {
    const schedule = String(req.headers['x-vercel-cron-schedule'] || '');
    const tPub = Date.now();
    const publishing = await processPublishingQueue({ limit: 5 }).catch(error => ({
      ok: false,
      processed: 0,
      results: [],
      error: error.message
    }));
    console.info('cron_timing', JSON.stringify({
      step: 'processPublishingQueue',
      duration_ms: Date.now() - tPub,
      status: publishing?.error ? 'error' : 'ok',
      processed: publishing?.processed || 0
    }));
    if (schedule === '0 5 * * *') return await runGrowthCron(res, publishing);
    return await runDailyReport(res, publishing);
  } catch (error) {
    console.error('Scheduled Tiqnora job failed', { message: error.message, stack: error.stack });
    return json(res, 503, { sent: false, error: error.message });
  }
}
