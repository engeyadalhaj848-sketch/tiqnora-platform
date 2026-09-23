import { createHash } from 'node:crypto';
import { discoverProspects, runQueuedTasks } from './autonomous-sales.js';

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return key;
}

async function rest(path, options = {}) {
  const key = serviceKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.hint || `Supabase ${response.status}`);
  return data;
}

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function allowedChats() {
  return new Set([
    String(process.env.TELEGRAM_CHAT_ID || '').trim(),
    ...String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map(x => x.trim())
  ].filter(Boolean));
}

async function telegramIntegration() {
  const rows = await rest('integration_connections?provider=eq.telegram&select=*&limit=1').catch(() => []);
  return rows?.[0] || null;
}

export async function telegramTargetChatId() {
  const envChat = [...allowedChats()][0];
  if (envChat) return envChat;
  const row = await telegramIntegration();
  return String(row?.metadata?.paired_chat_id || '').trim() || null;
}

async function isAuthorizedChat(chatId) {
  if (allowedChats().has(String(chatId))) return true;
  const row = await telegramIntegration();
  return String(row?.metadata?.paired_chat_id || '') === String(chatId);
}

export async function telegramConfigurationStatus() {
  const chatId = await telegramTargetChatId();
  return {
    configured: Boolean(botToken() && chatId),
    bot_token_configured: Boolean(botToken()),
    chat_id_configured: Boolean(chatId),
    paired_in_database: Boolean(chatId && !allowedChats().has(chatId))
  };
}

export function telegramWebhookSecret() {
  const token = botToken();
  if (!token) return '';
  return createHash('sha256').update(`tiqnora-telegram-webhook:${token}`).digest('hex');
}

export function isTelegramConfigured() {
  return Boolean(botToken());
}

export function verifyTelegramWebhook(req) {
  const token = botToken();
  if (!token) return false;
  const actual = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  return actual === telegramWebhookSecret();
}

async function telegram(method, payload = {}) {
  const token = botToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.description || `Telegram ${method} failed (${response.status})`);
  }
  return data?.result;
}

function splitTelegramText(text, max = 3900) {
  const input = String(text || '').trim();
  if (!input) return ['—'];
  const chunks = [];
  let restText = input;
  while (restText.length > max) {
    let cut = restText.lastIndexOf('\n', max);
    if (cut < Math.floor(max * 0.65)) cut = restText.lastIndexOf(' ', max);
    if (cut < Math.floor(max * 0.5)) cut = max;
    chunks.push(restText.slice(0, cut).trim());
    restText = restText.slice(cut).trim();
  }
  if (restText) chunks.push(restText);
  return chunks;
}

export async function sendTelegramText(chatId, text, options = {}) {
  let first = true;
  for (const chunk of splitTelegramText(text)) {
    await telegram('sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
      ...(first && options.reply_to_message_id ? {
        reply_parameters: { message_id: options.reply_to_message_id }
      } : {})
    });
    first = false;
  }
}

async function typing(chatId) {
  await telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
}

async function getSession(chatId) {
  const rows = await rest(`telegram_bot_sessions?chat_id=eq.${encodeURIComponent(chatId)}&select=*&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

async function upsertSession(message, defaultAgentSlug) {
  const chatId = String(message.chat?.id || '');
  const user = message.from || {};
  const current = await getSession(chatId);
  const payload = {
    chat_id: chatId,
    telegram_user_id: user.id != null ? String(user.id) : null,
    username: user.username || null,
    first_name: user.first_name || null,
    default_agent_slug: defaultAgentSlug || current?.default_agent_slug || 'auto',
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const rows = await rest('telegram_bot_sessions?on_conflict=chat_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload)
  });
  return rows?.[0] || payload;
}

async function claimTelegramUpdate(updateId, chatId) {
  if (updateId == null) return true;
  const rows = await rest('telegram_processed_updates?on_conflict=update_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      update_id: Number(updateId),
      chat_id: chatId || null,
      received_at: new Date().toISOString()
    })
  }).catch(() => []);
  return Boolean(rows?.length);
}

async function markTelegramConnected(message) {
  const chatId = String(message.chat?.id || '');
  const username = message.from?.username || null;
  const current = await telegramIntegration();
  await rest('integration_connections?provider=eq.telegram', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      enabled: true,
      status: 'connected',
      mode: 'production',
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        ...(current?.metadata || {}),
        purpose: 'owner_command_center',
        daily_reports: true,
        webhook: true,
        authorized_chat_configured: true,
        last_authorized_chat_id: chatId,
        last_authorized_username: username
      }
    })
  }).catch(() => {});
}

async function tryPairChat(message, pairingCode) {
  const chatId = String(message.chat?.id || '');
  const user = message.from || {};
  const row = await telegramIntegration();
  const metadata = row?.metadata || {};
  const expected = String(metadata.pairing_code_hash || '');
  const alreadyPaired = String(metadata.paired_chat_id || '');

  if (alreadyPaired && alreadyPaired !== chatId) {
    return { paired: false, reason: 'already_paired' };
  }
  if (!expected) return { paired: false, reason: 'pairing_not_available' };

  const actual = createHash('sha256')
    .update(`tiqnora-telegram-pair:${String(pairingCode || '').trim()}`)
    .digest('hex');

  if (actual !== expected) return { paired: false, reason: 'invalid_pairing_code' };

  await upsertSession(message, 'auto');
  await rest('integration_connections?provider=eq.telegram', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      enabled: true,
      status: 'connected',
      mode: 'production',
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        pairing_code_hash: null,
        pairing_required: false,
        paired_chat_id: chatId,
        paired_telegram_user_id: user.id != null ? String(user.id) : null,
        paired_username: user.username || null,
        paired_at: new Date().toISOString(),
        webhook: true,
        authorized_chat_configured: true
      }
    })
  });

  await sendTelegramText(
    chatId,
    '✅ تم ربط Telegram مع Tiqnora AI بنجاح.\n\nمن الآن أرسل طلباتك بشكل طبيعي، أو استخدم /help لعرض الأوامر.',
    { reply_to_message_id: message.message_id }
  );
  return { paired: true };
}

async function activeAgents() {
  return rest('ai_agents?select=id,slug,name,name_ar,department,description,description_ar,system_prompt,temperature,organization_id,provider,model&status=eq.active&is_enabled=eq.true&order=created_at.asc');
}

const AGENT_ALIASES = {
  sales: ['sales', 'مبيعات', 'المبيعات', 'بيع', 'عميل', 'عملاء'],
  marketing: ['marketing', 'تسويق', 'التسويق', 'حملة', 'اعلان', 'إعلان', 'seo'],
  'social-media': ['social-media', 'social', 'سوشيال', 'التواصل', 'انستقرام', 'انستجرام', 'فيسبوك', 'تيكتوك'],
  content: ['content', 'محتوى', 'المحتوى', 'مقال', 'سكريبت'],
  developer: ['developer', 'dev', 'تقني', 'المطور', 'برمجة', 'كود', 'فيرسل', 'جيت هب', 'github'],
  commerce: ['commerce', 'تجارة', 'المتجر', 'منتج', 'منتجات', 'مورد', 'دروبشيبنغ']
};

function aliasToSlug(value) {
  const normalized = String(value || '').trim().toLowerCase();
  for (const [slug, aliases] of Object.entries(AGENT_ALIASES)) {
    if (aliases.some(alias => normalized === alias || normalized.includes(alias))) return slug;
  }
  return null;
}

function explicitAgentFromText(text) {
  const trimmed = String(text || '').trim();
  const colon = trimmed.match(/^([^:：]{2,32})[:：]\s*(.+)$/s);
  if (!colon) return null;
  const slug = aliasToSlug(colon[1]);
  if (!slug) return null;
  return { slug, message: colon[2].trim() };
}

function keywordAgent(text) {
  const value = String(text || '').toLowerCase();
  const scores = {};
  for (const [slug, aliases] of Object.entries(AGENT_ALIASES)) {
    scores[slug] = aliases.reduce((sum, alias) => sum + (value.includes(alias.toLowerCase()) ? 1 : 0), 0);
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] > 0 ? ranked[0][0] : null;
}

function needsGrounding(text) {
  return /(ابحث|بحث|دور|دَوّر|تحقق|تأكد|اليوم|احدث|أحدث|حالي|current|latest|search|find)/i.test(String(text || ''));
}

async function callGemini({ agent, prompt, system, grounded = false, maxOutputTokens = 4096 }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  const requested = String(agent?.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash');
  const model = requested.startsWith('gemini-') ? requested : (process.env.GEMINI_MODEL || 'gemini-3.6-flash');
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(grounded ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: Number(agent?.temperature ?? 0.5),
      maxOutputTokens
    }
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini failed (${response.status})`);
  const text = (data?.candidates?.[0]?.content?.parts || []).map(part => part?.text || '').join('\n').trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return { text, model };
}

async function routeWithGemini(text, agents) {
  const choices = agents.map(a => ({ slug: a.slug, name: a.name_ar || a.name, department: a.department }));
  const router = await callGemini({
    prompt: `اختر وكيل واحد فقط لهذه الرسالة. أعد slug فقط دون شرح.\n\nالوكلاء:\n${JSON.stringify(choices)}\n\nالرسالة:\n${text}`,
    system: 'أنت موجّه طلبات داخلي. اختر أقرب وكيل متخصص ولا تنفذ الطلب.',
    grounded: false,
    maxOutputTokens: 50
  });
  const slug = String(router.text || '').trim().replace(/[`"'\s]/g, '');
  return agents.some(a => a.slug === slug) ? slug : null;
}

async function ownerUserId(organizationId) {
  const rows = await rest(
    `organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.owner&select=user_id&limit=1`
  );
  return rows?.[0]?.user_id || null;
}

async function agentContext(agent, userId) {
  const [memory, recent, prospects, tasks] = await Promise.all([
    rest(`ai_memory?agent_id=eq.${encodeURIComponent(agent.id)}&select=memory_key,memory_value&order=created_at.desc&limit=20`).catch(() => []),
    userId ? rest(`ai_conversations?agent_id=eq.${encodeURIComponent(agent.id)}&user_id=eq.${encodeURIComponent(userId)}&select=message,response,created_at&status=eq.completed&order=created_at.desc&limit=6`).catch(() => []) : [],
    ['sales','marketing','social-media','commerce'].includes(agent.slug)
      ? rest('prospects?select=business_name,category,city,phone,whatsapp,website,opportunity_score,priority,audit_summary,missing_opportunities,audit_json&order=opportunity_score.desc&limit=12').catch(() => [])
      : [],
    rest('ai_tasks?select=title,status,priority,due_at&status=in.(todo,in_progress)&order=created_at.asc&limit=12').catch(() => [])
  ]);

  return {
    memory,
    recent: (recent || []).reverse(),
    prospects,
    tasks
  };
}

function formatContext(context) {
  const memory = (context.memory || []).map(x => `- ${x.memory_key}: ${x.memory_value}`).join('\n');
  const history = (context.recent || []).map(x => `المستخدم: ${x.message}\nالوكيل: ${x.response || ''}`).join('\n\n');
  return [
    memory ? `ذاكرة الشركة:\n${memory}` : '',
    history ? `آخر المحادثات:\n${history}` : '',
    context.prospects?.length ? `أعلى فرص CRM الحالية:\n${JSON.stringify(context.prospects, null, 2)}` : '',
    context.tasks?.length ? `المهام المفتوحة:\n${JSON.stringify(context.tasks, null, 2)}` : ''
  ].filter(Boolean).join('\n\n');
}

async function saveConversation(agent, userId, message, result, error) {
  if (!userId) return;
  await rest('ai_conversations', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      organization_id: agent.organization_id,
      agent_id: agent.id,
      user_id: userId,
      message: `[TELEGRAM] ${message}`,
      response: result?.text || null,
      provider: 'google_ai',
      model: result?.model || agent.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      status: error ? 'failed' : 'completed',
      error_message: error ? String(error.message || error).slice(0, 1000) : null
    })
  }).catch(() => {});
}

async function runAgent(chatId, messageId, agent, text) {
  await typing(chatId);
  const userId = await ownerUserId(agent.organization_id);
  const context = await agentContext(agent, userId);
  const system = [
    agent.system_prompt || agent.description_ar || agent.description || 'أنت وكيل متخصص داخل Tiqnora AI.',
    'أنت تتلقى الآن أمراً من مالك Tiqnora عبر Telegram Command Center.',
    'نفّذ ما تستطيع بالمعلومات والأدوات المتاحة ولا تدّعِ تنفيذ إجراء خارجي لم يتم فعلياً.',
    'اكتب بالعربية بشكل عملي ومباشر. إذا أعددت رسالة لعميل فاجعلها مسودة للمراجعة ولا تدّعي إرسالها.',
    formatContext(context)
  ].filter(Boolean).join('\n\n');

  try {
    const result = await callGemini({
      agent,
      system,
      prompt: text,
      grounded: needsGrounding(text),
      maxOutputTokens: 4096
    });
    await saveConversation(agent, userId, text, result, null);
    const label = agent.name_ar || agent.name || agent.slug;
    await sendTelegramText(chatId, `🤖 ${label}\n\n${result.text}`, { reply_to_message_id: messageId });
    return { ok: true, agent: agent.slug };
  } catch (error) {
    await saveConversation(agent, userId, text, null, error);
    await sendTelegramText(chatId, `تعذر تنفيذ الطلب عبر ${agent.name_ar || agent.name || agent.slug}: ${error.message}`, { reply_to_message_id: messageId });
    return { ok: false, error: error.message };
  }
}

async function chooseAgent(text, session, agents) {
  const explicit = explicitAgentFromText(text);
  if (explicit) {
    const agent = agents.find(a => a.slug === explicit.slug);
    if (agent) return { agent, text: explicit.message };
  }

  if (session?.default_agent_slug && session.default_agent_slug !== 'auto') {
    const agent = agents.find(a => a.slug === session.default_agent_slug);
    if (agent) return { agent, text };
  }

  const keyword = keywordAgent(text);
  if (keyword) {
    const agent = agents.find(a => a.slug === keyword);
    if (agent) return { agent, text };
  }

  const routed = await routeWithGemini(text, agents).catch(() => null);
  return { agent: agents.find(a => a.slug === routed) || agents[0], text };
}

async function statusText() {
  const [prospects, tasks, agents, integrations, telegramStatus] = await Promise.all([
    rest('prospects?select=id,priority,status&limit=1000').catch(() => []),
    rest('ai_tasks?select=id,status,priority&limit=1000').catch(() => []),
    activeAgents().catch(() => []),
    rest('integration_connections?select=provider,status,enabled&order=provider.asc').catch(() => []),
    telegramConfigurationStatus()
  ]);
  const high = prospects.filter(x => x.priority === 'HIGH').length;
  const todo = tasks.filter(x => ['todo','in_progress'].includes(x.status)).length;
  const connected = integrations.filter(x => x.status === 'connected').map(x => x.provider);

  return [
    '📊 حالة Tiqnora الآن',
    '',
    `🤖 الوكلاء النشطون: ${agents.length}`,
    `🎯 فرص CRM: ${prospects.length} (HIGH: ${high})`,
    `📝 مهام مفتوحة: ${todo}`,
    `🔌 تكاملات متصلة: ${connected.length ? connected.join(', ') : 'لا يوجد'}`,
    `📨 Telegram: ${telegramStatus.configured ? 'متصل' : (telegramStatus.bot_token_configured ? 'بانتظار الاقتران' : 'ينقص Bot Token')}`
  ].join('\n');
}

async function prospectsText() {
  const rows = await rest('prospects?select=business_name,category,phone,whatsapp,opportunity_score,priority,status&order=opportunity_score.desc&limit=10').catch(() => []);
  if (!rows.length) return 'لا توجد فرص مبيعات محفوظة حالياً.';
  return [
    '🔥 أعلى 10 فرص حالية:',
    '',
    ...rows.map((x, i) => `${i + 1}. ${x.business_name} — ${x.category || '—'} — ${x.opportunity_score || 0}/100 — ${x.priority}\n   ${x.whatsapp || x.phone || 'لا يوجد رقم محفوظ'}`)
  ].join('\n');
}

async function tasksText() {
  const rows = await rest('ai_tasks?select=title,status,priority,due_at&status=in.(todo,in_progress)&order=created_at.asc&limit=20').catch(() => []);
  if (!rows.length) return '✅ لا توجد مهام مفتوحة حالياً.';
  return ['📝 المهام المفتوحة:', '', ...rows.map((x, i) => `${i + 1}. [${x.priority}] ${x.title} — ${x.status}`)].join('\n');
}

function helpText(agents) {
  return [
    '🤖 Tiqnora Telegram Command Center',
    '',
    'أرسل طلبك بشكل طبيعي وسأوجهه تلقائياً للوكيل المناسب.',
    'وتقدر تحدد الوكيل هكذا: «المبيعات: ابحث عن 10 عملاء» أو «التقني: افحص المشكلة».',
    '',
    'الأوامر:',
    '/agents — الوكلاء المتاحون',
    '/agent sales — تثبيت وكيل افتراضي',
    '/auto — توجيه تلقائي',
    '/status — حالة المنصة',
    '/prospects — أفضل فرص المبيعات',
    '/tasks — المهام المفتوحة',
    '/scan — البحث الآن عن عملاء جدد وحفظهم في CRM',
    '/run — تنفيذ المهام المفتوحة الآن',
    '/report — تقرير فوري',
    '/help — هذه المساعدة',
    '',
    `الوكلاء النشطون: ${agents.map(a => `${a.slug} (${a.name_ar || a.name})`).join('، ')}`
  ].join('\n');
}

async function processCommand(message, session, agents) {
  const chatId = String(message.chat.id);
  const messageId = message.message_id;
  const text = String(message.text || '').trim();
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();

  if (['/start','/help'].includes(command)) {
    await sendTelegramText(chatId, helpText(agents), { reply_to_message_id: messageId });
    return true;
  }

  if (command === '/agents') {
    await sendTelegramText(chatId, agents.map(a => `• ${a.slug} — ${a.name_ar || a.name}`).join('\n') || 'لا يوجد وكلاء نشطون.', { reply_to_message_id: messageId });
    return true;
  }

  if (command === '/auto') {
    await upsertSession(message, 'auto');
    await sendTelegramText(chatId, '✅ تم تفعيل التوجيه التلقائي بين الوكلاء.', { reply_to_message_id: messageId });
    return true;
  }

  if (command === '/agent') {
    const slug = aliasToSlug(args.join(' ')) || args[0];
    const agent = agents.find(a => a.slug === slug);
    if (!agent) {
      await sendTelegramText(chatId, 'الوكيل غير موجود أو غير نشط. استخدم /agents.', { reply_to_message_id: messageId });
      return true;
    }
    await upsertSession(message, agent.slug);
    await sendTelegramText(chatId, `✅ الوكيل الافتراضي الآن: ${agent.name_ar || agent.name}`, { reply_to_message_id: messageId });
    return true;
  }

  if (command === '/status' || command === '/report') {
    await typing(chatId);
    await sendTelegramText(chatId, await statusText(), { reply_to_message_id: messageId });
    return true;
  }

  if (command === '/prospects') {
    await sendTelegramText(chatId, await prospectsText(), { reply_to_message_id: messageId });
    return true;
  }

  if (command === '/tasks') {
    await sendTelegramText(chatId, await tasksText(), { reply_to_message_id: messageId });
    return true;
  }

  if (command === '/scan') {
    await typing(chatId);
    await sendTelegramText(chatId, '🔎 بدأت الآن عملية البحث عن عملاء جدد والتحقق منهم…', { reply_to_message_id: messageId });
    const result = await discoverProspects();
    await sendTelegramText(chatId, [
      '✅ انتهى فحص العملاء.',
      `وجد Gemini: ${result.candidates || 0}`,
      `تم حفظ/تحديث: ${result.saved || 0}`,
      `تم تجاهل غير المتحقق: ${result.skipped || 0}`,
      `فشل: ${result.failed || 0}`,
      '',
      'استخدم /prospects لرؤية أفضل الفرص.'
    ].join('\n'));
    return true;
  }

  if (command === '/run') {
    await typing(chatId);
    const result = await runQueuedTasks({ limit: 8 });
    await sendTelegramText(chatId, [
      '🤖 تشغيل مهام الوكلاء انتهى.',
      `المستحقة: ${result.due || 0}`,
      `تمت: ${result.completed || 0}`,
      `فشلت: ${result.failed || 0}`
    ].join('\n'), { reply_to_message_id: messageId });
    return true;
  }

  return false;
}

function isProspectingRequest(text) {
  const value = String(text || '').toLowerCase();
  return /(ابحث|دور|دَوّر|جيب|هات).*(عملا|عملاء|شركات|فرص)|(عملا|عملاء|شركات|فرص).*(ابحث|دور|جيب|هات)/i.test(value);
}

export async function handleTelegramUpdate(update) {
  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id) return { ignored: true, reason: 'no_message' };

  const chatId = String(message.chat.id);
  const text = String(message.text || '').trim();
  const pairMatch = text.match(/^\/(?:pair|start)(?:@\w+)?\s+([A-Za-z0-9_-]{4,64})\s*$/i);

  if (pairMatch) {
    const claimedPair = await claimTelegramUpdate(update?.update_id, chatId);
    if (!claimedPair) return { ignored: true, reason: 'duplicate_update' };
    const pairing = await tryPairChat(message, pairMatch[1]);
    if (!pairing.paired) {
      await sendTelegramText(
        chatId,
        pairing.reason === 'already_paired'
          ? 'هذا البوت مرتبط بحساب Telegram آخر.'
          : 'رمز الاقتران غير صحيح أو منتهي.',
        { reply_to_message_id: message.message_id }
      ).catch(() => {});
    }
    return { ok: pairing.paired, pairing };
  }

  if (!(await isAuthorizedChat(chatId))) {
    console.warn('Rejected Telegram chat', { chatId, userId: message.from?.id || null });
    return { ignored: true, reason: 'unauthorized_chat' };
  }

  const claimed = await claimTelegramUpdate(update?.update_id, chatId);
  if (!claimed) return { ignored: true, reason: 'duplicate_update' };

  if (!message.text) {
    await sendTelegramText(chatId, 'حالياً Command Center يدعم الأوامر والرسائل النصية. أرسل طلبك كنص.');
    return { ok: true, non_text: true };
  }

  const session = await upsertSession(message);
  await markTelegramConnected(message);
  const agents = await activeAgents();

  if (!agents.length) {
    await sendTelegramText(chatId, 'لا يوجد وكلاء نشطون في Tiqnora حالياً.', { reply_to_message_id: message.message_id });
    return { ok: false, reason: 'no_agents' };
  }

  if (String(message.text).startsWith('/')) {
    const handled = await processCommand(message, session, agents);
    if (handled) return { ok: true, command: true };
  }

  if (isProspectingRequest(message.text)) {
    await typing(chatId);
    await sendTelegramText(chatId, '🔎 سأشغّل وكيل البحث عن العملاء الآن وأحفظ النتائج المتحققة في CRM.', { reply_to_message_id: message.message_id });
    const result = await discoverProspects();
    await sendTelegramText(chatId, `✅ اكتمل البحث: ${result.saved || 0} فرصة تم حفظها/تحديثها من ${result.candidates || 0} نتيجة. استخدم /prospects لمراجعتها.`);
    return { ok: true, action: 'prospecting', saved: result.saved || 0 };
  }

  const selected = await chooseAgent(message.text, session, agents);
  if (!selected.agent) {
    await sendTelegramText(chatId, 'تعذر اختيار وكيل مناسب. استخدم /agents ثم /agent.', { reply_to_message_id: message.message_id });
    return { ok: false, reason: 'routing_failed' };
  }

  return runAgent(chatId, message.message_id, selected.agent, selected.text);
}

export async function telegramBotInfo() {
  if (!botToken()) return { configured: false, reason: 'missing_bot_token' };
  const me = await telegram('getMe', {});
  const webhook = await telegram('getWebhookInfo', {});
  const status = await telegramConfigurationStatus();
  return {
    configured: status.configured,
    bot: {
      id: me?.id || null,
      username: me?.username || null,
      first_name: me?.first_name || null
    },
    webhook: {
      url: webhook?.url || '',
      pending_update_count: webhook?.pending_update_count || 0,
      last_error_message: webhook?.last_error_message || null
    }
  };
}
