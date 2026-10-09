/**
 * Tiqnora WhatsApp sales manager.
 * Pure, testable conversation planner. Never quotes prices or promises outcomes.
 * State lives in conversations.metadata.sales_manager (no migration needed).
 */

export function salesNormalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ').trim();
}

const SERVICE_PATTERNS = [
  ['ecommerce', /متجر الكتروني|متجر اونلاين|متجر|ecommerce|e-commerce/i, 'متجر إلكتروني'],
  ['website', /موقع الكتروني|موقع|website|web design/i, 'موقع إلكتروني'],
  ['whatsapp_automation', /واتساب|whatsapp|ردود اليه|رد آلي|بوت محادثه|chatbot|crm/i, 'أتمتة واتساب والمبيعات'],
  ['voice_agent', /وكيل صوتي|مكالمات آليه|اتصالات آليه|voice agent/i, 'وكيل صوتي'],
  ['ai_agent', /وكيل ذكاء|وكلاء ذكاء|ذكاء اصطناعي|ai agent/i, 'وكيل ذكاء اصطناعي'],
  ['social', /تسويق|اعلانات|سوشيال|انستجرام|انستغرام|فيسبوك|تيكتوك|tiktok|social media/i, 'التسويق وإدارة السوشيال'],
  ['seo', /سيو|seo|محركات البحث|ظهور جوجل/i, 'تحسين الظهور في جوجل'],
  ['technical', /شبكات|كاميرات|سيرفر|نظام نقاط بيع|كاشير|تقنيه معلومات/i, 'خدمات تقنية']
];

const APPROVAL = /^(نعم|اي|ايوه|ايوا|اجل|صحيح|تمام|موافق|اوكي|ok|yes|yep|أكيد|اكيد|بالضبط|صح|توكل|معتمد|حسنا|حسنًا)[\s!،.]*$/i;
const DECLINE = /^(لا|مو|مش|لأ|غير صحيح|غلط|غير دقيق|not correct|no)[\s!،.]*$/i;
const UNKNOWN = /^(ما ادري|ما اعرف|غير محدد|ما عندي|لسه|لاحقا|بعدين|مش متاكد|مو متأكد|ما قررنا|ما حددنا|لا اعلم|بدون|ما يهم)[\s!،.]*$/i;
const STOP = /وقف الرسائل|لا تراسل|لا ترسل|احذف رقمي|الغاء الاشتراك|إلغاء الاشتراك|stop messaging|unsubscribe|do not contact/i;
const HUMAN = /ابي موظف|ابغى موظف|اريد موظف|اكلم موظف|اتكلم مع موظف|ابغى اكلم|اريد اكلم|شخص حقيقي|اكلم شخص|اتكلم مع شخص|كلموني|اتصلوا بي|حولني|حولي|الموظف المختص|مندوب مبيعات|human agent|talk to (a )?person/i;
const SALES_CUE = /احتاج|ابغى|ابي |أبي |اريد|مهتم|عرض سعر|تسعير|سعر|بكم|كم يكلف|اشتراك|نشتري|اعملوا لنا|اعمل لي|شركة|مؤسسة|تطوير الاعمال|مسؤول|المسؤول|طلب|خدماتكم|نبدأ|جاهز|ابدأ/i;

function cleaned(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function isShortAffirmation(text) { return APPROVAL.test(salesNormalize(text)); }
function isDecline(text) { return DECLINE.test(salesNormalize(text)); }
function isUnknown(text) { return UNKNOWN.test(salesNormalize(text)); }
function detectService(text) {
  const value = salesNormalize(text);
  const found = SERVICE_PATTERNS.find(([, rx]) => rx.test(value));
  return found ? { code: found[0], label: found[2] } : null;
}
function detectCompany(text) {
  const value = cleaned(text);
  const match = value.match(/(?:شركتنا|اسم (?:الشركة|المؤسسة|المحل|النشاط)|نحن شركة|انا من شركة|أنا من شركة|شركة)\s*[:：-]?\s*([\p{L}\p{N} \-]{3,58})/iu);
  if (!match) return null;
  const name = cleaned(match[1], 58).replace(/[،.].*$/, '').trim();
  if (/^(في|لنا|عندنا|عندي|القطاع|التجاره|التجارة|تصميم|موقع)$/i.test(name)) return null;
  return name || null;
}
function detectTimeline(text) {
  const input = salesNormalize(text);
  const match = input.match(/(?:خلال|في غضون|بعد|قبل|الاسبوع القادم|الشهر القادم|اسبوعين|شهرين|مستعجل|عاجل|فورا|باسرع وقت)[^،.]{0,55}/i);
  return match ? cleaned(match[0], 65) : null;
}
function detectBudget(text) {
  const input = salesNormalize(text);
  const explicit = input.match(/(?:ميزانيه|حد الميزانيه|budget)\s*[:：-]?\s*([0-9٠-٩][0-9٠-٩,.٬، ]{0,18})\s*(?:ريال|ر\.?س|sar)?/i);
  if (explicit) return cleaned(explicit[1], 30);
  const casual = input.match(/(?:حوالي|تقريبا|تقريباً)\s*([0-9٠-٩][0-9٠-٩,.٬، ]{0,18})\s*(?:ريال|ر\.?س|sar)\b/i);
  return casual ? cleaned(casual[1], 30) : null;
}
function detectsObjective(text) {
  const input = salesNormalize(text);
  if (input.length < 16 || isShortAffirmation(input) || isDecline(input) || isUnknown(input)) return false;
  return /(نحتاج|احتاج|ابغى|اريد|نريد|نبغى|هدف|لـ|علشان|حتى|يساعد|زياده|تطوير|مبيعات|عرض منتجات|طلبات|عملاء|مشكله|نعاني|الحل)/.test(input);
}
function describe(state) {
  return [
    state.service_label && 'الخدمة: ' + state.service_label,
    state.company && 'النشاط: ' + state.company,
    state.goal && 'الهدف: ' + state.goal,
    state.scope && 'التفاصيل: ' + state.scope,
    state.timeline && 'الموعد المفضل: ' + state.timeline,
    state.budget && 'الميزانية المذكورة: ' + state.budget,
    state.decision_maker === true && 'المتحدث: مسؤول/صاحب قرار',
    state.decision_maker === false && 'المتحدث: ليس صاحب القرار'
  ].filter(Boolean).join('\n');
}

export function planWhatsAppSalesTurn({ message = '', history = [], previous = {}, lead = {} } = {}) {
  const raw = cleaned(message, 1400), input = salesNormalize(raw);
  const prior = previous && typeof previous === 'object' ? previous : {};
  const hist = Array.isArray(history) ? history.slice(-20) : [];
  const assistants = hist.filter(x => x.role === 'assistant');
  const lastAssistant = salesNormalize(assistants.at(-1)?.text || '');
  const customers = hist.filter(x => x.role === 'customer').map(x => cleaned(x.text, 1400));
  const state = {
    ...prior,
    service: prior.service || null,
    service_label: prior.service_label || null,
    company: prior.company || cleaned(lead.company_name || '', 90) || null,
    goal: prior.goal || null,
    scope: prior.scope || null,
    timeline: prior.timeline || null,
    budget: prior.budget || null,
    decision_maker: typeof prior.decision_maker === 'boolean' ? prior.decision_maker : null,
    skipped: { ...(prior.skipped || {}) }
  };
  const explicitSales = Boolean(detectService(raw) || SALES_CUE.test(input));
  const continuing = ['qualifying', 'confirming', 'awaiting_team'].includes(prior.stage)
    || /(?:الخدمه|الموقع|المتجر|مشروعك|عرض سعر|تسعير|نشاطك|تطوير الاعمال|الشخص المسؤول)/.test(lastAssistant);
  const active = explicitSales || continuing || HUMAN.test(input) || prior.stage === 'opted_out' || prior.stage === 'awaiting_team';
  if (!active && !STOP.test(input)) return null;

  if (prior.stage === 'awaiting_team' || prior.stage === 'opted_out') {
    return { active: true, suppress: true, state };
  }
  if (STOP.test(input)) {
    return {
      active: true, suppress: false,
      state: { ...state, stage: 'opted_out', step: null, updated_at: new Date().toISOString() },
      reply: 'تم، بنوقف الرسائل الآلية. وإذا احتجت أي خدمة مستقبلًا نحن في خدمتك.',
      deterministic: true
    };
  }

  const questionBefore = prior.step || '';
  // Recover useful facts from earlier inbound messages without treating our own offers as customer commitments.
  for (const entry of customers.concat(raw)) {
    const srv = detectService(entry);
    if (srv && !state.service) { state.service = srv.code; state.service_label = srv.label; }
    if (!state.company) state.company = detectCompany(entry) || null;
    if (!state.timeline) state.timeline = detectTimeline(entry);
    if (!state.budget) state.budget = detectBudget(entry);
  }
  if (questionBefore === 'service' && !state.service) {
    const srv = detectService(raw);
    if (srv) { state.service = srv.code; state.service_label = srv.label; }
  }
  if (questionBefore === 'company' && !state.company && !isShortAffirmation(input) && !isDecline(input) && !isUnknown(input) && input.length >= 3) {
    state.company = cleaned(raw, 90);
  }
  if (questionBefore === 'goal' && !state.goal && !isShortAffirmation(input) && !isDecline(input) && !isUnknown(input)) {
    state.goal = cleaned(raw, 240);
  } else if (!state.goal && detectsObjective(raw) && state.service && !/^(كم سعر|بكم|كم تكلف|اريد عرض سعر|ابي عرض سعر)/.test(input)) {
    state.goal = cleaned(raw, 240);
  }
  if (questionBefore === 'scope' && !state.scope) {
    if (isUnknown(input)) state.skipped.scope = true;
    else if (!isShortAffirmation(input) && !isDecline(input)) state.scope = cleaned(raw, 260);
  }
  if (questionBefore === 'timeline' && !state.timeline && isUnknown(input)) state.skipped.timeline = true;
  if (questionBefore === 'budget' && !state.budget && isUnknown(input)) state.skipped.budget = true;
  if (questionBefore === 'decision_maker') {
    if (isShortAffirmation(input)) state.decision_maker = true;
    else if (isDecline(input)) state.decision_maker = false;
    else if (isUnknown(input)) state.skipped.decision_maker = true;
  }
  if (/(انا المسؤول|أنا المسؤول|مسؤول تطوير الاعمال|مدير تطوير الاعمال|انا صاحب|أنا صاحب|انا المالك|القرار عندي|decision maker)/i.test(input)) state.decision_maker = true;
  if (/^(نعم|ايوه|اي|اجل|صحيح|انا)(\s|$)/.test(input) && /(هل.*(المسؤول|صاحب القرار)|انت.*المسؤول|حضرتك.*المسؤول)/.test(lastAssistant)) state.decision_maker = true;

  state.stage = 'qualifying';
  state.updated_at = new Date().toISOString();
  const turn = (step, reply) => ({ active: true, state: { ...state, step }, reply, deterministic: false });
  const wantsHuman = HUMAN.test(input);
  if (wantsHuman) {
    return {
      active: true, handoff: true, reason: 'customer_requested_human',
      state: { ...state, step: null, stage: 'awaiting_team' },
      reply: 'أكيد، بحوّل طلبك لفريق تيكنورا لاستكمال الحديث معك، ومراجعة التفاصيل والتسعير عند الحاجة.',
      deterministic: true
    };
  }
  if (prior.step === 'confirm' && isShortAffirmation(input)) {
    return {
      active: true, handoff: true, reason: 'customer_confirmed_requirements',
      state: { ...state, step: null, stage: 'awaiting_team' },
      reply: 'ممتاز، اعتمدت تفاصيل طلبك وحولتها لفريق تيكنورا لمراجعة المتطلبات وإعداد التسعير المناسب. سيتابع معك الفريق من نفس المحادثة.',
      deterministic: true
    };
  }
  if (prior.step === 'confirm' && isDecline(input)) {
    state.goal = null;
    return turn('goal', 'شكرًا للتوضيح، إيش الجزء اللي يحتاج تعديل في الملخص؟ اكتب لي التصحيح وأحدثه.');
  }
  if (!state.service) return turn('service', 'يسعدنا نخدمك 🌹 أي خدمة تحتاجها الآن: موقع، متجر، أتمتة واتساب، تسويق، أو حل تقني آخر؟');
  if (!state.goal) return turn('goal', 'ممتاز. إيش أهم نتيجة تبغى تحققها من ' + state.service_label + '، أو المشكلة اللي تحب نحلها لك؟');
  if (!state.company) return turn('company', 'واضح، وش اسم الشركة أو النشاط اللي بنجهز له الحل؟');
  if (!state.scope && !state.skipped.scope) {
    const targeted = {
      website: 'هل تحتاج موقعًا تعريفيًا؟ وما أهم الصفحات أو الوظائف المطلوبة؟',
      ecommerce: 'تقريبًا كم عدد المنتجات؟ وهل البيع للأفراد أو الجملة أو الاثنين؟',
      whatsapp_automation: 'كم عدد المحادثات تقريبًا، وإيش أهم المهام اللي تبغى الوكيل ينفذها؟',
      voice_agent: 'هل المطلوب استقبال المكالمات أو إجراء مكالمات، وما نظام العملاء اللي تستخدمونه؟',
      ai_agent: 'إيش المهام التي تريد الوكيل ينفذها، وعلى أي قناة أو نظام؟',
      social: 'على أي منصات تحتاج الإدارة، وما نوع المحتوى أو الحملات المطلوبة؟',
      seo: 'إيش رابط موقعكم أو نشاطكم على جوجل، وإيش الكلمات أو الخدمات المستهدفة؟',
      technical: 'إيش الأنظمة أو الأجهزة الموجودة حاليًا، وإيش المطلوب إضافته أو إصلاحه؟'
    };
    return turn('scope', targeted[state.service] || 'ما أهم التفاصيل والوظائف التي تتوقعها من الخدمة؟');
  }
  if (!state.timeline && !state.skipped.timeline) return turn('timeline', 'هل عندكم موعد محدد تفضلون إنجاز المشروع فيه، أم الجدول الزمني مرن؟');
  if (!state.budget && !state.skipped.budget) return turn('budget', 'هل عندكم نطاق ميزانية تقريبي يساعد فريقنا على اقتراح الحل المناسب؟ وإذا ما حددتوها بعد، عادي نكمل بدونها.');
  if (state.decision_maker === null && !state.skipped.decision_maker) return turn('decision_maker', 'هل حضرتك الشخص المسؤول عن اعتماد المشروع، أم ننسق أيضًا مع شخص آخر؟');

  return {
    active: true,
    state: { ...state, stage: 'confirming', step: 'confirm' },
    reply: 'هذا ملخص طلبكم للتأكد قبل تحويله لفريق التسعير:\n' + describe(state) + '\n\nهل التفاصيل صحيحة ونقدر نرفعها للفريق؟',
    deterministic: true
  };
}

export function salesHandoffSummary(plan, event = {}) {
  const state = plan?.state || {};
  return {
    company: state.company || null,
    service: state.service || null,
    service_label: state.service_label || null,
    goal: state.goal || null,
    scope: state.scope || null,
    timeline: state.timeline || null,
    budget: state.budget || null,
    decision_maker: state.decision_maker ?? null,
    channel: event.platform || 'whatsapp',
    customer_name: event.author_name || null,
    customer_phone: event.author_external_id || null,
    handoff_reason: plan.reason || 'qualified_lead',
    pricing_status: 'pending_human_review',
    owner_approved_price: false
  };
}
