import { generateText } from './ai/provider.js';
import {
  buildSkillsPrompt,
  allowedMcpTools,
  createA2AEnvelope,
  planMultiAgentDelegation,
  runAgentHarness,
  buildLearningEvent
} from './v6/agent-runtime.js';

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
  return /^\/discuss(@\w+)?(\s|$)/i.test(value) || /(ناقشوا|تناقشوا|اجتماع.*(الوكلاء|الاجنتس)|كل.*(الوكلاء|الاجنتس).*(ناقش|رأي)|(?:وش|ايش|ما)?\s*رأيكم)/i.test(value);
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
  if (/(السلام|مرحبا|هلا|كيف حال|صباح|مساء)/i.test(value)) add('assistant', 'sales', 'marketing');
  add('marketing', 'sales', 'content');
  const selected = slugs.map(slug => agents.find(a => a.slug === slug)).filter(Boolean).slice(0, 4);
  return selected.length >= 2 ? selected : agents.filter(a => a.slug !== 'manager').slice(0, 3);
}

function needsGrounding(text) {
  return /(ابحث|بحث|دور|تحقق|تأكد|اليوم|احدث|أحدث|حالي|current|latest|search|find)/i.test(String(text || ''));
}

async function callProvider(agent, system, prompt, grounded, maxOutputTokens) {
  const groundingRule = grounded
    ? '\n\nإذا كان الموضوع يحتاج معلومات حديثة ولا توجد بيانات موثوقة في السياق، صرّح بعدم توفرها ولا تختلق نتائج بحث.'
    : '';
  return generateText({
    system: String(system || '') + groundingRule,
    prompt,
    temperature: Number(agent?.temperature ?? 0.5),
    maxTokens: maxOutputTokens || 1200,
    allowDeterministic: false
  });
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
      provider: result ? (result.provider || agent.provider || 'unknown') : (agent.provider || 'unknown'),
      model: result ? result.model : (agent.model || process.env.OPENAI_MODEL || process.env.GEMINI_MODEL || 'unknown'),
      status: error ? 'failed' : 'completed',
      error_message: error ? String(error.message || error).slice(0, 1000) : null
    })
  }).catch(() => {});
}

async function persistA2A(agent, manager, envelope, status, result) {
  const row = {
    organization_id: agent.organization_id,
    protocol: envelope.protocol,
    correlation_id: envelope.correlation_id,
    message_id: envelope.id,
    from_agent_id: manager?.id || null,
    to_agent_id: agent.id || null,
    message_type: envelope.type,
    task: envelope.task,
    message: envelope.message,
    artifact: result?.text ? { text: String(result.text).slice(0, 10000) } : null,
    hop: envelope.hop,
    status,
    requires_approval: Boolean(envelope.requires_approval),
    metadata: { source: 'telegram_agent_room' },
    ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {})
  };
  if (status === 'queued') {
    await rest('ai_agent_messages', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(row)
    }).catch(() => {});
    return;
  }
  await rest('ai_agent_messages?organization_id=eq.' + encodeURIComponent(agent.organization_id) + '&message_id=eq.' + encodeURIComponent(envelope.id), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  }).catch(() => {});
}

async function persistAgentEval(agent, evaluation) {
  if (!evaluation) return;
  const rows = await rest('ai_agent_evals?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: agent.organization_id,
      agent_id: agent.id,
      rubric: evaluation.rubric,
      score: evaluation.score,
      passed: evaluation.pass,
      dimensions: evaluation.dimensions,
      failures: evaluation.failures,
      metadata: { source: 'telegram_agent_room' }
    })
  }).catch(() => []);

  const learning = buildLearningEvent(evaluation, { agent_slug: agent.slug });
  if (learning) {
    await rest('ai_agent_learning_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        organization_id: agent.organization_id,
        agent_id: agent.id,
        source_eval_id: rows?.[0]?.id || null,
        lesson_key: learning.lesson_key,
        lesson: learning.lesson,
        status: 'proposed',
        auto_apply: false,
        metadata: { source: 'telegram_agent_room', score: learning.source_score }
      })
    }).catch(() => {});
  }
}

export async function runAgentRoomDiscussion(message, agents) {
  const chatId = String(message.chat.id);
  const topic = cleanTopic(message.text);
  if (!topic) {
    await sendText(chatId, 'اكتب موضوع النقاش بعد /discuss. مثال: /discuss كيف نزيد مبيعات تصميم المواقع؟', message.message_id);
    return { ok: false, reason: 'missing_topic' };
  }
  const manager = agents.find(a => a.slug === 'manager') || null;
  const runtimePlan = planMultiAgentDelegation(topic, agents);
  const plannedParticipants = runtimePlan.participants
    .map(card => agents.find(agent => agent.slug === card.slug))
    .filter(Boolean)
    .filter(agent => agent.slug !== 'manager')
    .slice(0, 4);
  const participants = plannedParticipants.length >= 2 ? plannedParticipants : selectParticipants(topic, agents);
  const context = await sharedContext();
  const transcript = [];
  await sendText(chatId, '🧠 بدأت جلسة الوكلاء حول:\n' + topic + '\n\nالمشاركون: ' + participants.map(a => a.name_ar || a.name || a.slug).join('، ') + (manager ? '، ثم مدير الوكلاء للخلاصة.' : '.'), message.message_id);
  for (const agent of participants) {
    const label = agent.name_ar || agent.name || agent.slug;
    const previous = transcript.length ? transcript.map(x => x.label + ': ' + x.text).join('\n\n') : 'أنت أول متحدث.';
    try {
      await typing(chatId);
      const envelope = createA2AEnvelope({
        from: manager?.slug || 'telegram-room',
        to: agent.slug,
        task: 'specialist_discussion',
        message: topic,
        correlationId: 'telegram:' + String(message.message_id || '') + ':' + String(chatId)
      });
      await persistA2A(agent, manager, envelope, 'queued', null);
      const harnessRun = await runAgentHarness({
        agent,
        message: topic,
        knowledge: [],
        invoke: async ({ attempt, feedback }) => callProvider(agent, [
          agent.system_prompt || agent.description_ar || agent.description || 'أنت وكيل متخصص داخل Tiqnora AI.',
          'أنت في غرفة نقاش داخلية على Telegram مع مالك Tiqnora ووكلاء آخرين.',
          buildSkillsPrompt(agent.slug),
          'نطاقات أدوات MCP المسموحة لهذا الوكيل: ' + allowedMcpTools(agent.slug).join(', ') + '. لا تدّع استخدام أداة خارج هذه النطاقات.',
          'ناقش الموضوع من زاوية تخصصك وعلّق على مداخلات زملائك بدون تكرار.',
          'اكتب 3 إلى 6 نقاط عملية فقط. لا تدّع تنفيذ شيء خارجي لم يحدث ولا تختلق أرقاماً.',
          attempt > 1 && feedback.length ? 'إعادة جودة: حسّن هذه الجوانب: ' + feedback.join(', ') : '',
          context
        ].filter(Boolean).join('\n\n'), 'الموضوع:\n' + topic + '\n\nالمداخلات السابقة:\n' + previous + '\n\nقدّم مداخلتك الآن.', needsGrounding(topic), 1100)
      });
      const result = harnessRun.result;
      transcript.push({ slug: agent.slug, label, text: result.text });
      await Promise.all([
        saveDiscussion(agent, topic, result, null),
        persistA2A(agent, manager, envelope, 'completed', result),
        persistAgentEval(agent, harnessRun.evaluation)
      ]);
      await sendText(chatId, '💬 ' + label + '\n\n' + result.text);
    } catch (error) {
      await saveDiscussion(agent, topic, null, error);
      await sendText(chatId, '⚠️ ' + label + ': المزود غير متاح مؤقتاً، تم تجاوز هذه المداخلة ومتابعة بقية الفريق.');
    }
  }
  if (manager && transcript.length) {
    const label = manager.name_ar || manager.name || manager.slug;
    try {
      await typing(chatId);
      const harnessRun = await runAgentHarness({
        agent: manager,
        message: topic,
        knowledge: [],
        invoke: async ({ attempt, feedback }) => callProvider(manager, [
          manager.system_prompt || manager.description_ar || manager.description || 'أنت مدير الوكلاء في Tiqnora AI.',
          buildSkillsPrompt(manager.slug),
          'نطاقات أدوات MCP المسموحة لمدير الوكلاء: ' + allowedMcpTools(manager.slug).join(', ') + '.',
          'أنت تدير اجتماعاً داخلياً. لخّص الاتفاق والاختلاف ثم حوّل النقاش إلى قرار وخطوات تالية واضحة.',
          'لا تدّع تنفيذ شيء لم يحدث. اجعل الخلاصة قصيرة وعملية.',
          attempt > 1 && feedback.length ? 'إعادة جودة: حسّن هذه الجوانب: ' + feedback.join(', ') : '',
          context
        ].filter(Boolean).join('\n\n'), 'الموضوع:\n' + topic + '\n\nمداخلات الفريق:\n' + transcript.map(x => x.label + ':\n' + x.text).join('\n\n') + '\n\nاختم الاجتماع بخلاصة تنفيذية.', false, 1300)
      });
      const result = harnessRun.result;
      await Promise.all([
        saveDiscussion(manager, topic, result, null),
        persistAgentEval(manager, harnessRun.evaluation)
      ]);
      await sendText(chatId, '🧭 ' + label + ' — خلاصة النقاش\n\n' + result.text);
      transcript.push({ slug: manager.slug, label, text: result.text });
    } catch (error) {
      await saveDiscussion(manager, topic, null, error);
    }
  }
  return { ok: true, mode: 'agent_room_discussion', topic, agents: transcript.map(x => x.slug) };
}