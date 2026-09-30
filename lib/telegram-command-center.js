import { createHash } from 'node:crypto';
import { discoverProspects, ensureDailyWorkforceTasks, runQueuedTasks } from './autonomous-sales.js';
import { isAgentRoomSetupCommand, isAgentRoomDiscussionRequest, registerAgentRoom, isAuthorizedAgentRoomMessage, runAgentRoomDiscussion } from './telegram-agent-room.js';
import { generateText } from './ai/provider.js';
import { handleSocialApprovalCallback } from './social-approval.js';
import { processPublishingJob } from './v6/social-runtime.js';
import { handleDesignApprovalCallback } from './v6/design-approval.js';
import { tryHandleImageDesignerChat } from './v6/image-designer-chat-hook.js';
import { isImageDesignRequest } from './v6/image-designer.js';

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
  return String(row?.metadata?.collaboration_chat_id || row?.metadata?.paired_chat_id || '').trim() || null;
}

async function isAuthorizedChat(chatId) {
  if (allowedChats().has(String(chatId))) return true;
  const row = await telegramIntegration();
  const metadata = row?.metadata || {};
  return [metadata.paired_chat_id, metadata.collaboration_chat_id]
    .map(value => String(value || '')).includes(String(chatId));
}

export async function telegramConfigurationStatus() {
  const tokenOk = Boolean(botToken());
  const envChat = [...allowedChats()][0] || null;
  let dbChat = null;
  try {
    const row = await telegramIntegration();
    dbChat = String(row?.metadata?.paired_chat_id || '').trim() || null;
  } catch (_) { dbChat = null; }
  const chatId = envChat || dbChat;
  const paired = Boolean(chatId);
  return {
    configured: Boolean(tokenOk && paired),
    bot_token_configured: tokenOk,
    chat_id_configured: paired,
    chat_id_source: envChat ? 'env' : (dbChat ? 'database' : null),
    paired_in_database: Boolean(dbChat),
    paired,
    reachable: null,
    last_success: null,
    last_error: null
  };
}

export async function isTelegramOperational() {
  try {
    const status = await telegramConfigurationStatus();
    return Boolean(status.configured);
  } catch (_) {
    return Boolean(botToken() && ([...allowedChats()][0]));
  }
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
      ...(first && options.reply_to_message_id ? { reply_parameters: { message_id: options.reply_to_message_id } } : {})
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
    body: JSON.stringify({ update_id: Number(updateId), chat_id: chatId || null, received_at: new Date().toISOString() })
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
      enabled: true, status: 'connected', mode: 'production',
      last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      metadata: {
        ...(current?.metadata || {}),
        purpose: 'owner_command_center', daily_reports: true, webhook: true,
        authorized_chat_configured: true,
        last_authorized_chat_id: chatId, last_authorized_username: username
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
  if (alreadyPaired && alreadyPaired !== chatId) return { paired: false, reason: 'already_paired' };
  if (!expected) return { paired: false, reason: 'pairing_not_available' };
  const actual = createHash('sha256').update(`tiqnora-telegram-pair:${String(pairingCode || '').trim()}`).digest('hex');
  if (actual !== expected) return { paired: false, reason: 'invalid_pairing_code' };
  await upsertSession(message, 'auto');
  await rest('integration_connections?provider=eq.telegram', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      enabled: true, status: 'connected', mode: 'production',
      last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      metadata: {
        ...metadata, pairing_code_hash: null, pairing_required: false,
        paired_chat_id: chatId,
        paired_telegram_user_id: user.id != null ? String(user.id) : null,
        paired_username: user.username || null,
        paired_at: new Date().toISOString(), webhook: true, authorized_chat_configured: true
      }
    })
  });
  await sendTelegramText(chatId, '✅ تم ربط Telegram مع Tiqnora AI بنجاح.\n\nمن الآن أرسل طلباتك بشكل طبيعي، أو استخدم /help لعرض الأوامر.', { reply_to_message_id: message.message_id });
  return { paired: true };
}

async function activeAgents() {
  return rest('ai_agents?select=id,slug,name,name_ar,department,description,description_ar,system_prompt,temperature,organization_id,provider,model&status=eq.active&is_enabled=eq.true&order=created_at.asc');
}

const AGENT_ALIASES = {
  sales: ['sales', 'مبيعات', 'المبيعات', 'بيع', 'عميل', 'عملاء', 'مدير المبيعات'],
  marketing: ['marketing', 'تسويق', 'التسويق', 'حملة', 'اعلان', 'إعلان', 'seo', 'مدير التسويق'],
  'social-media': ['social-media', 'social', 'سوشيال', 'التواصل', 'انستقرام', 'انستجرام', 'فيسبوك', 'تيكتوك', 'السوشيال'],
  content: ['content', 'محتوى', 'المحتوى', 'مقال', 'سكريبت', 'كاتب المحتوى'],
  developer: ['developer', 'dev', 'تقني', 'المطور', 'برمجة', 'كود', 'فيرسل', 'جيت هب', 'github'],
  commerce: ['commerce', 'تجارة', 'المتجر', 'منتج', 'منتجات', 'مورد', 'دروبشيبنغ'],
  manager: ['manager', 'مدير الوكلاء', 'مدير الاجنتس', 'مدير الأجنتس'],
  assistant: ['assistant', 'المساعد', 'مساعد'],
  ads: ['ads', 'الإعلانات', 'الاعلانات', 'مدير الإعلانات'],
  channel: ['channel', 'القنوات', 'محلل القنوات'],
  'image-designer': ['image-designer', 'مصمم الصور', 'الصور'],
  'video-designer': ['video-designer', 'مصمم الفيديو', 'الفيديو']
};

function aliasToSlug(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/^@/, '');
  for (const [slug, aliases] of Object.entries(AGENT_ALIASES)) {
    if (aliases.some(alias => normalized === alias || normalized.includes(alias))) return slug;
  }
  return null;
}

function explicitAgentFromText(text) {
  const trimmed = String(text || '').trim();
  const mention = trimmed.match(/^@([^\s,:：]{2,32})[\s,:：]+(.+)$/s);
  if (mention) {
    const slug = aliasToSlug(mention[1]);
    if (slug) return { slug, message: mention[2].trim() };
  }
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

async function callAI({ agent, prompt, system, grounded = false, maxOutputTokens = 4096 }) {
  const groundingRule = grounded
    ? '\n\nإذا كان الطلب يحتاج معلومات حديثة ولا تملك مصدراً موثوقاً داخل السياق، صرّح بذلك ولا تختلق معلومة أو نتيجة بحث.'
    : '';
  return generateText({
    system: String(system || '') + groundingRule,
    prompt,
    temperature: Number(agent?.temperature ?? 0.5),
    maxTokens: maxOutputTokens,
    allowDeterministic: false
  });
}

async function routeWithAI(text, agents) {
  const choices = agents.map(a => ({ slug: a.slug, name: a.name_ar || a.name, department: a.department }));
  const router = await callAI({
    prompt: `اختر وكيل واحد فقط لهذه الرسالة. أعد slug فقط دون شرح.\n\nالوكلاء:\n${JSON.stringify(choices)}\n\nالرسالة:\n${text}`,
    system: 'أنت موجّه طلبات داخلي. اختر أقرب وكيل متخصص ولا تنفذ الطلب.',
    grounded: false,
    maxOutputTokens: 50
  });
  const slug = String(router.text || '').trim().replace(/[`"'\s]/g, '');
  return agents.some(a => a.slug === slug) ? slug : null;
}

async function ownerUserId(organizationId) {
  const rows = await rest(`organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.owner&select=user_id&limit=1`);
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
  return { memory, recent: (recent || []).reverse(), prospects, tasks };
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
      organization_id: agent.organization_id, agent_id: agent.id, user_id: userId,
      message: `[TELEGRAM] ${message}`, response: result?.text || null,
      provider: result?.provider || agent.provider || 'unknown',
      model: result?.model || agent.model || process.env.OPENAI_MODEL || process.env.GEMINI_MODEL || 'unknown',
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
    'ممنوع اختراع حقائق عن العميل مثل النمو أو عدد المشاريع أو الميزانية أو النتائج. لا تذكر ROI أو نسب تحسين أو توفير إلا إذا كانت هناك بيانات موثقة تدعمها.',
    formatContext(context)
  ].filter(Boolean).join('\n\n');
  try {
    const result = await callAI({ agent, system, prompt: text, grounded: needsGrounding(text), maxOutputTokens: 4096 });
    await saveConversation(agent, userId, text, result, null);
    const label = agent.name_ar || agent.name || agent.slug;
    await sendTelegramText(chatId, `🤖 ${label}\n\n${result.text}`, { reply_to_message_id: messageId });
    return { ok: true, agent: agent.slug };
  } catch (error) {
    await saveConversation(agent, userId, text, null, error);
    const label = agent.name_ar || agent.name || agent.slug;
    await sendTelegramText(chatId, `⚠️ ${label} غير متاح مؤقتاً. جرّبت المنصة مزودي الذكاء الاصطناعي المتاحين وسجلت الخطأ داخلياً. حاول بعد قليل.`, { reply_to_message_id: messageId });
    return { ok: false, error: 'ai_provider_unavailable', error_code: error?.code || null };
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
  const byKeyword = keywordAgent(text);
  if (byKeyword) {
    const agent = agents.find(a => a.slug === byKeyword);
    if (agent) return { agent, text };
  }
  try {
    const routed = await routeWithAI(text, agents);
    if (routed) {
      const agent = agents.find(a => a.slug === routed);
      if (agent) return { agent, text };
    }
  } catch (_) {}
  const fallback = agents.find(a => a.slug === 'assistant') || agents.find(a => a.slug === 'manager') || agents[0];
  return { agent: fallback, text };
}

function isCasualGroupMessage(text) {
  return /^(مرحبا|السلام|هلا|شكرا|تمام|ok|okay|hi|hello)\b/i.test(String(text || '').trim());
}

function isProspectingRequest(text) {
  const value = String(text || '').toLowerCase();
  return /(ابحث|دور|دَوّر|جيب|هات).*(عملا|عملاء|شركات|فرص)|(عملا|عملاء|شركات|فرص).*(ابحث|دور|جيب|هات)/i.test(value);
}

export async function handleTelegramUpdate(update) {
  if (update?.callback_query) {
    const designDecision = await handleDesignApprovalCallback(update.callback_query);
    if (designDecision?.handled) return designDecision;
    const approval = await handleSocialApprovalCallback(update.callback_query);
    if (approval?.handled) {
      if (approval.ok && approval.action === 'approve' && Array.isArray(approval.jobs) && approval.jobs.length) {
        const delivery = await Promise.all(approval.jobs.map(job => processPublishingJob(job)));
        const chatId = String(update.callback_query?.message?.chat?.id || '');
        const lines = delivery.map(result => {
          const icon = result.status === 'published' ? '✅' : '⚠️';
          return `${icon} ${result.platform}: ${result.status}`;
        });
        if (chatId) {
          await sendTelegramText(chatId, ['📤 نتيجة النشر بعد اعتمادك:', ...lines].join('\n')).catch(() => {});
        }
        return { ...approval, delivery };
      }
      return approval;
    }
    return { ignored: true, reason: 'unsupported_callback' };
  }

  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id) return { ignored: true, reason: 'no_message' };

  const chatId = String(message.chat.id);
  const text = String(message.text || '').trim();
  const pairMatch = text.match(/^\/(?:pair|start)(?:@\w+)?\s+([A-Za-z0-9_-]{4,64})\s*$/i);

  if (isAgentRoomSetupCommand(text)) {
    const claimedRoom = await claimTelegramUpdate(update?.update_id, chatId);
    if (!claimedRoom) return { ignored: true, reason: 'duplicate_update' };
    return registerAgentRoom(message);
  }

  if (pairMatch) {
    const claimed = await claimTelegramUpdate(update?.update_id, chatId);
    if (!claimed) return { ignored: true, reason: 'duplicate_update' };
    return tryPairChat(message, pairMatch[1]);
  }

  const authorized = await isAuthorizedChat(chatId);
  if (!authorized) return { ignored: true, reason: 'unauthorized_chat' };

  const claimed = await claimTelegramUpdate(update?.update_id, chatId);
  if (!claimed) return { ignored: true, reason: 'duplicate_update' };

  await markTelegramConnected(message);
  const session = await upsertSession(message);
  const agents = await activeAgents();

  if (!text) return { ok: true, note: 'empty_text' };

  if (text.startsWith('/help') || text === '/start') {
    await sendTelegramText(chatId, [
      'Tiqnora Command Center',
      '',
      '/status — حالة النظام',
      '/agents — قائمة الوكلاء',
      '/agent <slug> — تثبيت وكيل افتراضي',
      '/scan — بحث عملاء',
      '/daily — مهام يومية',
      '@sales: رسالة — توجيه مباشر',
      '',
      'أرسل طلب تصميم صور لوكيل image-designer.'
    ].join('\n'), { reply_to_message_id: message.message_id });
    return { ok: true, action: 'help' };
  }

  if (text.startsWith('/status')) {
    const status = await telegramConfigurationStatus();
    await sendTelegramText(chatId, [
      '📡 حالة Telegram Command Center',
      `configured: ${status.configured}`,
      `bot_token: ${status.bot_token_configured}`,
      `chat_id_source: ${status.chat_id_source || '—'}`,
      `paired: ${status.paired}`
    ].join('\n'), { reply_to_message_id: message.message_id });
    return { ok: true, action: 'status' };
  }

  if (text.startsWith('/daily')) {
    await typing(chatId);
    const result = await ensureDailyWorkforceTasks().catch(err => ({ error: String(err.message || err) }));
    await sendTelegramText(chatId, `📅 Daily workforce: ${JSON.stringify(result).slice(0, 500)}`, { reply_to_message_id: message.message_id });
    return { ok: true, action: 'daily' };
  }

  if (text.startsWith('/scan')) {
    await typing(chatId);
    await sendTelegramText(chatId, '🔎 جاري البحث عن عملاء...', { reply_to_message_id: message.message_id });
    const result = await discoverProspects();
    await sendTelegramText(chatId, `✅ scan: ${result.saved || 0} saved`, { reply_to_message_id: message.message_id });
    return { ok: true, action: 'scan', saved: result.saved || 0 };
  }

  if (text.startsWith('/agents')) {
    const lines = agents.map(a => `• ${a.slug} — ${a.name_ar || a.name}`);
    await sendTelegramText(chatId, ['الوكلاء النشطون:', ...lines].join('\n'), { reply_to_message_id: message.message_id });
    return { ok: true, action: 'agents' };
  }

  if (text.startsWith('/agent')) {
    const slug = text.split(/\s+/)[1];
    const agent = agents.find(a => a.slug === slug);
    if (!agent) {
      await sendTelegramText(chatId, 'الوكيل غير موجود. استخدم /agents', { reply_to_message_id: message.message_id });
      return { ok: false, reason: 'unknown_agent' };
    }
    await upsertSession(message, slug);
    await sendTelegramText(chatId, `تم تثبيت الوكيل الافتراضي: ${agent.name_ar || agent.name}`, { reply_to_message_id: message.message_id });
    return { ok: true, action: 'set_agent', agent: slug };
  }

  // Execution intents must take priority over the collaboration-room discussion.
  // Otherwise every message in the authorized room gets swallowed by runAgentRoomDiscussion()
  // and specialist production pipelines (especially image generation) never run.
  const explicitBeforeDiscussion = explicitAgentFromText(text);
  const imageDesignerAgent = agents.find(a => a.slug === 'image-designer');
  const imageExecutionRequested =
    explicitBeforeDiscussion?.slug === 'image-designer' ||
    isImageDesignRequest(text);

  if (imageDesignerAgent && imageExecutionRequested) {
    await typing(chatId);
    const imagePrompt = explicitBeforeDiscussion?.slug === 'image-designer'
      ? explicitBeforeDiscussion.message
      : text;

    try {
      const imageResult = await tryHandleImageDesignerChat({
        agent: imageDesignerAgent,
        message: imagePrompt,
        user: message.from || null,
        token: null
      });

      if (imageResult) {
        await sendTelegramText(chatId, imageResult.text, {
          reply_to_message_id: message.message_id
        });
        return {
          ok: true,
          action: 'image_design',
          ...(imageResult.meta || {})
        };
      }
    } catch (error) {
      console.error('telegram-image-designer', error?.message || error);
      await sendTelegramText(
        chatId,
        `⚠️ تعذر تشغيل إنتاج الصور: ${String(error?.message || error).slice(0, 500)}`,
        { reply_to_message_id: message.message_id }
      ).catch(() => {});
      return { ok: false, action: 'image_design', reason: 'image_pipeline_failed' };
    }
  }

  if (isAgentRoomDiscussionRequest(text) || isAuthorizedAgentRoomMessage(message)) {
    return runAgentRoomDiscussion(message, agents);
  }

  if (isProspectingRequest(text)) {
    await typing(chatId);
    await sendTelegramText(chatId, '🔎 سأشغّل وكيل البحث عن العملاء الآن وأحفظ النتائج المتحققة في CRM.', { reply_to_message_id: message.message_id });
    const result = await discoverProspects();
    await sendTelegramText(chatId, `✅ اكتمل البحث: ${result.saved || 0} فرصة تم حفظها/تحديثها من ${result.candidates || 0} مرشح.`, { reply_to_message_id: message.message_id });
    return { ok: true, action: 'prospecting', saved: result.saved || 0 };
  }

  const isCollaborationGroup = ['group', 'supergroup'].includes(String(message.chat?.type || ''));
  const directAgentTarget = explicitAgentFromText(text);
  if (isCollaborationGroup && !directAgentTarget && !text.startsWith('/')) {
    if (isCasualGroupMessage(text)) {
      const assistant = agents.find(a => a.slug === 'assistant') || agents.find(a => a.slug === 'manager') || agents[0];
      return runAgent(chatId, message.message_id, assistant, text);
    }
    const selectedGroupAgent = await chooseAgent(text, session, agents);
    return runAgent(chatId, message.message_id, selectedGroupAgent.agent, selectedGroupAgent.text);
  }

  const selected = await chooseAgent(text, session, agents);
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
    bot: { id: me?.id || null, username: me?.username || null, first_name: me?.first_name || null },
    webhook: {
      url: webhook?.url || '',
      pending_update_count: webhook?.pending_update_count || 0,
      last_error_message: webhook?.last_error_message || null
    }
  };
}
