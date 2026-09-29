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
  const response = await fetch(supabaseUrl() + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data && (data.message || data.hint)) || ('Supabase ' + response.status));
  return data;
}

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

async function telegram(method, payload) {
  const token = botToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const response = await fetch('https://api.telegram.org/bot' + encodeURIComponent(token) + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || ('Telegram ' + method + ' failed'));
  return data.result;
}

async function sendText(chatId, text, replyTo) {
  await telegram('sendMessage', {
    chat_id: chatId,
    text: String(text || ''),
    disable_web_page_preview: true,
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {})
  });
}

async function typing(chatId) {
  await telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
}

function isGroup(message) {
  const type = String(message && message.chat && message.chat.type || '');
  return type === 'group' || type === 'supergroup';
}

async function telegramIntegration() {
  const rows = await rest('integration_connections?provider=eq.telegram&select=*&limit=1').catch(() => []);
  return rows && rows[0] ? rows[0] : null;
}

export function isAgentRoomSetupCommand(text) {
  return /^\/(group|room)(@\w+)?(\s+(setup|start))?\s*$/i.test(String(text || '').trim());
}

export function isAgentRoomDiscussionRequest(text) {
  const value = String(text || '').trim();
  return /^\/discuss(@\w+)?(\s|$)/i.test(value) || /(ناقشوا|تناقشوا|اجتماع.*(الوكلاء|الاجنتس)|كل.*(الوكلاء|الاجنتس).*(ناقش|رأي))/i.test(value);
}

export async function registerAgentRoom(message) {
  if (!isGroup(message)) return { ok: false, reason: 'not_group' };
  const row = await telegramIntegration();
  const metadata = row && row.metadata ? row.metadata : {};
  const ownerId = String(metadata.paired_telegram_user_id || '');
  const senderId = String(message && message.from && message.from.id || '');
  if (!ownerId || ownerId !== senderId) return { ok: false, reason: 'owner_required' };
  const chatId = String(message.chat.id);
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
        collaboration_chat_id: chatId,
        collaboration_chat_title: message.chat.title || null,
        collaboration_group_enabled: true,
        collaboration_owner_user_id: senderId,
        collaboration_group_registered_at: new Date().toISOString(),
        webhook: true
      }
    })
  });
  await sendText(chatId, [
    '✅ تم اعتماد هذه المجموعة كغرفة عمل Tiqnora AI.',
    '',
    'يمكنك التحدث مع الوكلاء من هنا مباشرة.',
    'لجلسة جماعية: /discuss ثم موضوع النقاش.',
    'ولوكيل محدد: اكتب مثلاً «المبيعات: راجع فرص اليوم».',
    '',
    '🔐 الأوامر التشغيلية داخل المجموعة مقصورة على مالك Tiqnora المرتبط.'
  ].join('\n'), message.message_id);
  return { ok: true, chat_id: chatId };
}

export async function isAuthorizedAgentRoomMessage(message) {
  if (!isGroup(message)) return false;
  const row = await telegramIntegration();
  const metadata = row && row.metadata ? row.metadata : {};
  return String(metadata.collaboration_chat_id || '') === String(message.chat.id || '')
    && String(metadata.collaboration_owner_user_id || metadata.paired_telegram_user_id || '') === String(message.from && message.from.id || '');
}

function cleanTopic(text) {
  return String(text || '').replace(/^\/discuss(@\w+)?\s*/i, '').replace(/^(ناقشوا|تناقشوا)\s*/i, '').trim();
}

function selectParticipants(topic, agents) {
  const value = String(topic || '').toLowerCase();
  const slugs = [];
  const add = (...items) => { for (const slug of items) if (slug && !slugs.includes(slug) && slug !== 'manager') slugs.push(slug); };
  if (/(متجر|منتج|مورد|سعر|شحن|مخزون)/i.test(value)) add('commerce', 'sales', 'marketing');
  if (/(مبيعات|عملا|عملاء|crm|عرض|صفقة|واتس)/i.test(value)) add('sales', 'marketing', 'content');
  if (/(تسويق|حملة|اعلان|إعلان|seo|قنوات)/i.test(value)) add('marketing', 'ads', 'channel', 'content');
  if (/(سوشيال|انست|فيس|تيكتوك|منشور|بوست)/i.test(value)) add('social-media', 'content', 'image-designer', 'video-designer');
  if (/(تصميم|صورة|صور|فيديو|هوية)/i.test(value)) add('image-designer', 'video-designer', 'content', 'marketing');
  if (/(تقني|موقع|منصة|كود|فيرسل|جيت|قاعدة|api|تكامل)/i.test(value)) add('developer', 'assistant', 'marketing');
  add('marketing', 'sales', 'content');
  const selected = slugs.map(slug => agents.find(a => a.slug === slug)).filter(Boolean).slice(0, 4);
  return selected.length >= 2 ? selected : agents.filter(a => a.slug !== 'manager').slice(0, 3);
}

function needsGrounding(text) {
  return /(ابحث|بحث|دور|تحقق|تأكد|اليوم|احدث|أحدث|حالي|current|latest|search|find)/i.test(String(text || ''));
}

async function callGemini(agent, system, prompt, grounded, maxOutputTokens) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  const requested = String(agent && agent.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash');
  const model = requested.startsWith('gemini-') ? requested : (process.env.GEMINI_MODEL || 'gemini-3.6-flash');
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(grounded ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature: Number(agent && agent.temperature != null ? agent.temperature : 0.5), maxOutputTokens: maxOutputTokens || 1200 }
  };
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data && data.error && data.error.message || ('Gemini failed (' + response.status + ')'));
  const text = (((data.candidates || [])[0] || {}).content && (((data.candidates || [])[0] || {}).content.parts || []).map(p => p.text || '').join('\n').trim()) || '';
  if (!text) throw new Error('Gemini returned an empty response.');
  return { text, model };
}

async function sharedContext() {
  const [prospects, tasks] = await Promise.all([
    rest('prospects?select=business_name,category,city,opportunity_score,priority,status&order=opportunity_score.desc&limit=8').catch(() => []),
    rest('ai_tasks?select=title,status,priority,due_at&status=in.(todo,in_progress)&order=created_at.asc&limit=10').catch(() => [])
  ]);
  return [
    prospects.length ? ('CRM opportunities:\n' + JSON.stringify(prospects)) : '',
    tasks.length ? ('Open tasks:\n' + JSON.stringify(tasks)) : ''
  ].filter(Boolean).join('\n\n');
}

async function saveDiscussion(agent, topic, result, error) {
  const owners = await rest('organization_members?organization_id=eq.' + encodeURIComponent(agent.organization_id) + '&role=eq.owner&select=user_id&limit=1').catch(() => []);
  const userId = owners && owners[0] && owners[0].user_id;
  if (!userId) return;
  await rest('ai_conversations', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      organization_id: agent.organization_id,
      agent_id: agent.id,
      user_id: userId,
      message: '[TELEGRAM GROUP DISCUSSION] ' + topic,
      response: result ? result.text : null,
      provider: 'google_ai',
      model: result ? result.model : (agent.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash'),
      status: error ? 'failed' : 'completed',
      error_message: error ? String(error.message || error).slice(0, 1000) : null
    })
  }).catch(() => {});
}

export async function runAgentRoomDiscussion(message, agents) {
  const chatId = String(message.chat.id);
  const topic = cleanTopic(message.text);
  if (!topic) {
    await sendText(chatId, 'اكتب موضوع النقاش بعد /discuss. مثال: /discuss كيف نزيد مبيعات تصميم المواقع؟', message.message_id);
    return { ok: false, reason: 'missing_topic' };
  }
  const participants = selectParticipants(topic, agents);
  const manager = agents.find(a => a.slug === 'manager') || null;
  const context = await sharedContext();
  const transcript = [];
  await sendText(chatId, '🧠 بدأت جلسة الوكلاء حول:\n' + topic + '\n\nالمشاركون: ' + participants.map(a => a.name_ar || a.name || a.slug).join('، ') + (manager ? '، ثم مدير الوكلاء للخلاصة.' : '.'), message.message_id);
  for (const agent of participants) {
    const label = agent.name_ar || agent.name || agent.slug;
    const previous = transcript.length ? transcript.map(x => x.label + ': ' + x.text).join('\n\n') : 'أنت أول متحدث.';
    try {
      await typing(chatId);
      const result = await callGemini(agent, [
        agent.system_prompt || agent.description_ar || agent.description || 'أنت وكيل متخصص داخل Tiqnora AI.',
        'أنت في غرفة نقاش داخلية على Telegram مع مالك Tiqnora ووكلاء آخرين.',
        'ناقش الموضوع من زاوية تخصصك وعلّق على مداخلات زملائك بدون تكرار.',
        'اكتب 3 إلى 6 نقاط عملية فقط. لا تدّع تنفيذ شيء خارجي لم يحدث ولا تختلق أرقاماً.',
        context
      ].join('\n\n'), 'الموضوع:\n' + topic + '\n\nالمداخلات السابقة:\n' + previous + '\n\nقدّم مداخلتك الآن.', needsGrounding(topic), 1100);
      transcript.push({ slug: agent.slug, label, text: result.text });
      await saveDiscussion(agent, topic, result, null);
      await sendText(chatId, '💬 ' + label + '\n\n' + result.text);
    } catch (error) {
      await saveDiscussion(agent, topic, null, error);
      await sendText(chatId, '⚠️ ' + label + ': تعذرت المداخلة (' + String(error.message || error).slice(0, 240) + ').');
    }
  }
  if (manager && transcript.length) {
    const label = manager.name_ar || manager.name || manager.slug;
    try {
      await typing(chatId);
      const result = await callGemini(manager, [
        manager.system_prompt || manager.description_ar || manager.description || 'أنت مدير الوكلاء في Tiqnora AI.',
        'أنت تدير اجتماعاً داخلياً. لخّص الاتفاق والاختلاف ثم حوّل النقاش إلى قرار وخطوات تالية واضحة.',
        'لا تدّع تنفيذ شيء لم يحدث. اجعل الخلاصة قصيرة وعملية.',
        context
      ].join('\n\n'), 'الموضوع:\n' + topic + '\n\nمداخلات الفريق:\n' + transcript.map(x => x.label + ':\n' + x.text).join('\n\n') + '\n\nاختم الاجتماع بخلاصة تنفيذية.', false, 1300);
      await saveDiscussion(manager, topic, result, null);
      await sendText(chatId, '🧭 ' + label + ' — خلاصة النقاش\n\n' + result.text);
      transcript.push({ slug: manager.slug, label, text: result.text });
    } catch (error) {
      await saveDiscussion(manager, topic, null, error);
    }
  }
  return { ok: true, mode: 'agent_room_discussion', topic, agents: transcript.map(x => x.slug) };
}