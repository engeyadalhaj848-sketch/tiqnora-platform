/**
 * Tiqnora V6 — Inbox -> CRM Intelligence
 * Pure analysis and payload builders. No DB writes. No outbound actions.
 */

const LEAD_INTENTS = new Set(['sales', 'quote_request', 'booking']);
const NO_LEAD = new Set(['support', 'complaint', 'existing_customer', 'spam', 'general_question']);

const SERVICES = [
  ['website', /(site|website|web|موقع|تصميم موقع|متجر إلكتروني)/i],
  ['whatsapp_automation', /(واتس|واتساب|whatsapp).*(ربط|أتمت|متابع)|(?:ربط|أتمت|متابع).*(واتس|واتساب|whatsapp)/i],
  ['booking', /(حجز|موعد|مواعيد|booking|appointment)/i],
  ['crm', /(crm|إدارة العملاء|متابعة العملاء)/i],
  ['social_media', /(انست|instagram|فيس|facebook|تيك ?توك|tiktok|سوشيال)/i],
  ['seo', /(seo|سيو|ظهور جوجل|جوجل ماب|google maps)/i],
  ['ai_agent', /(وكيل|agent|ذكاء اصطناعي| ai )/i]
];

const INDUSTRIES = [
  ['dental_clinic', /(عيادة أسنان|اسنان|أسنان|dentist|dental)/i],
  ['clinic', /(عيادة|مستوصف|مركز طبي|clinic|medical center)/i],
  ['restaurant', /(مطعم|مطاعم|restaurant|cafe|كافيه|مقهى)/i],
  ['real_estate', /(عقار|عقارات|مكتب عقاري|real estate|property)/i],
  ['hotel', /(فندق|فنادق|hotel|hospitality)/i],
  ['salon', /(صالون|مشغل|beauty|salon|spa)/i],
  ['retail', /(متجر|محل|retail|shop)/i],
  ['contracting', /(مقاول|مقاولات|construction|contracting)/i]
];

function messageText(event = {}) {
  return String(event.content ?? event.message ?? event.body ?? '').trim();
}

export function normalizePhone(value, options = {}) {
  if (!value) return null;
  const country = options.defaultCountry || 'SA';
  let digits = String(value).replace(/[^0-9+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (country === 'SA') {
    if (/^05\d{8}$/.test(digits)) return '966' + digits.slice(1);
    if (/^5\d{8}$/.test(digits)) return '966' + digits;
    if (/^9665\d{8}$/.test(digits)) return digits;
  }
  return digits.length >= 8 ? digits : null;
}

export function normalizeEmail(value) {
  if (!value) return null;
  const email = String(value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeContact(event = {}) {
  return {
    name: String(event.author_name || event.contact_name || event.name || '').trim() || null,
    phone: normalizePhone(event.phone || event.whatsapp),
    email: normalizeEmail(event.email),
    platform: String(event.platform || 'unknown').trim().toLowerCase(),
    external_user_id: event.external_user_id ? String(event.external_user_id) : null,
    username: event.username ? String(event.username).trim().toLowerCase() : null
  };
}

export function classifyIntentDeterministic(event = {}) {
  const text = messageText(event);
  if (!text) return { intent: 'general_question', confidence: 0.35 };

  if (/free money|crypto giveaway|ربحت.*جائزة|اضغط.*الرابط.*للفوز|زيادة متابعين.*فوري/i.test(text)) {
    return { intent: 'spam', confidence: 0.98 };
  }

  const existing = /(حجزت|طلبت|اشتركت|دفعت|عميل عندكم|موعدي|حجزي|طلبي|أمس)/i.test(text);
  const support = /(ما اشتغل|مايشتغل|لا يعمل|عطلان|مشكلة|خطأ|تعطل|not working|support)/i.test(text);
  const complaint = /(شكوى|سيئ|سيئة|غير راضي|مو راضي|تأخر|تأخير|complaint)/i.test(text);
  const booking = /(احجز|حجز|موعد|appointment|booking|schedule)/i.test(text);
  const quote = /(كم سعر|السعر|عرض سعر|تكلفة|بكم|quote|price|pricing)/i.test(text);
  const sales = /(أبغى|ابغى|أريد|اريد|احتاج|أحتاج|حاب|مهتم|أبي|ابي).*(موقع|واتس|نظام|تسويق|حجز|متجر|خدمة|seo|crm|وكيل)/i.test(text);

  if (existing && (support || booking || /(غير|تغيير|أغير|عدل|تعديل)/i.test(text))) {
    return { intent: 'existing_customer', confidence: 0.94 };
  }
  if (complaint) return { intent: 'complaint', confidence: 0.92 };
  if (support) return { intent: 'support', confidence: 0.92 };
  if (quote) return { intent: 'quote_request', confidence: 0.95 };
  if (booking) return { intent: 'booking', confidence: 0.90 };
  if (sales) return { intent: 'sales', confidence: 0.90 };
  return { intent: 'general_question', confidence: 0.55 };
}

export function extractEntities(event = {}) {
  const text = messageText(event);
  const service_interest = SERVICES.filter(function (x) { return x[1].test(text); }).map(function (x) { return x[0]; });
  const industryRow = INDUSTRIES.find(function (x) { return x[1].test(text); });

  let city = null;
  if (/المدينة المنورة|المدينه المنوره|medina|madinah/i.test(text)) city = 'المدينة المنورة';
  else if (/الرياض|riyadh/i.test(text)) city = 'الرياض';
  else if (/جدة|جده|jeddah/i.test(text)) city = 'جدة';
  else if (/مكة|مكه|makkah|mecca/i.test(text)) city = 'مكة';

  const budget = text.match(/(?:ميزانية|budget|حوالي)\s*[:\-]?\s*([0-9][0-9,.]*)\s*(?:ريال|sar)?/i);
  const timeline = text.match(/(?:خلال|بعد|مدة|timeline)\s+([^،,.]{2,30})/i);

  const pain_points = [];
  if (/واتس|واتساب/i.test(text) && /(ربط|أتمت|متابع)/i.test(text)) pain_points.push('الحاجة إلى ربط أو أتمتة واتساب');
  if (/متابعة العملاء|crm/i.test(text)) pain_points.push('الحاجة إلى تنظيم ومتابعة العملاء');
  if (/(لا يوجد|ما عندنا|مشكلة)/i.test(text) && /(حجز|موعد)/i.test(text)) pain_points.push('الحاجة إلى تحسين نظام الحجز');

  return {
    industry: industryRow ? industryRow[0] : null,
    service_interest: Array.from(new Set(service_interest)),
    location: { city: city, country: city ? 'SA' : null },
    qualification: {
      budget: budget ? budget[1].replaceAll(',', '') : null,
      timeline: timeline ? timeline[1].trim() : null,
      decision_maker: /(أنا المالك|انا المالك|أنا صاحب|انا صاحب|المدير)/i.test(text) ? true : null,
      pain_points: pain_points
    }
  };
}

function lower(value) {
  return value == null ? null : String(value).trim().toLowerCase();
}

export function matchExistingLead(contact = {}, existingCandidates = []) {
  const rows = Array.isArray(existingCandidates) ? existingCandidates : [];

  for (const row of rows) {
    const phone = normalizePhone(row.phone || row.whatsapp);
    if (contact.phone && phone && contact.phone === phone) return { matched: true, candidate: row, match_type: 'phone', confidence: 1, auto_merge: true };
  }
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (contact.email && email && contact.email === email) return { matched: true, candidate: row, match_type: 'email', confidence: 1, auto_merge: true };
  }
  for (const row of rows) {
    const meta = row.metadata || row.custom_fields || {};
    const platform = lower(row.platform || meta.platform);
    const external = row.external_user_id || meta.external_user_id;
    if (contact.external_user_id && platform === contact.platform && String(external || '') === contact.external_user_id) {
      return { matched: true, candidate: row, match_type: 'platform_external_user_id', confidence: 1, auto_merge: true };
    }
  }
  for (const row of rows) {
    const meta = row.metadata || row.custom_fields || {};
    const platform = lower(row.platform || meta.platform);
    const username = lower(row.username || meta.username);
    if (contact.username && platform === contact.platform && username === contact.username) {
      return { matched: true, candidate: row, match_type: 'platform_username', confidence: 0.97, auto_merge: true };
    }
  }

  const byName = rows.find(function (row) {
    return contact.name && lower(row.contact_name || row.name) === lower(contact.name);
  });
  if (byName) return { matched: true, candidate: byName, match_type: 'name_suggestion', confidence: 0.45, auto_merge: false };

  return { matched: false, candidate: null, match_type: null, confidence: 0, auto_merge: false };
}

export function calculateInitialOpportunityScore(input = {}) {
  const event = input.event || {};
  const intent = input.intent;
  const contact = input.contact || {};
  const entities = input.entities || {};
  const q = entities.qualification || {};
  let score = 0;
  const reasons = [];

  if (intent === 'sales') { score += 18; reasons.push('نية شراء / اهتمام واضح'); }
  if (intent === 'quote_request') { score += 24; reasons.push('طلب عرض سعر واضح'); }
  if (intent === 'booking') { score += 20; reasons.push('طلب حجز / موعد'); }

  const services = entities.service_interest || [];
  if (services.length >= 2) { score += 12; reasons.push('طلب أكثر من خدمة'); }
  else if (services.length === 1) { score += 6; reasons.push('خدمة مطلوبة محددة'); }

  if (entities.industry) { score += 8; reasons.push('سياق عمل / قطاع واضح'); }
  if (contact.phone) { score += 8; reasons.push('هاتف'); }
  if (String(event.platform || '').toLowerCase() === 'whatsapp') { score += 6; reasons.push('واتساب'); }
  if (q.timeline) { score += 8; reasons.push('إطار زمني مذكور'); }
  if (q.budget) { score += 10; reasons.push('ميزانية مذكورة'); }
  if (q.decision_maker === true) { score += 6; reasons.push('صاحب قرار'); }
  if (/(شركة|مؤسسة|مطعم|عيادة|مكتب|فندق|نشاط|business)/i.test(messageText(event))) { score += 6; reasons.push('سياق شركة / نشاط تجاري'); }

  if (NO_LEAD.has(intent)) score = 0;
  return { score: Math.min(100, Math.max(0, score)), reasons: reasons };
}

export function buildCrmRecommendation(input = {}) {
  const salesLike = LEAD_INTENTS.has(input.intent);
  const matched = Boolean(input.existingMatch && input.existingMatch.matched && input.existingMatch.auto_merge);
  const score = input.opportunityScore ? input.opportunityScore.score : 0;

  return {
    should_create_lead: salesLike && !matched,
    should_update_existing: salesLike && matched,
    should_create_opportunity: salesLike && score >= 70,
    suggested_stage: salesLike ? (score >= 70 ? 'qualified' : 'contacted') : null,
    next_best_action:
      input.intent === 'booking' ? 'propose_meeting' :
      input.intent === 'sales' || input.intent === 'quote_request' ? 'ask_qualification' :
      input.intent === 'spam' ? 'ignore' :
      input.intent === 'support' || input.intent === 'complaint' || input.intent === 'existing_customer' ? 'escalate' : 'reply'
  };
}

export function buildLeadPayload(input = {}) {
  if (!LEAD_INTENTS.has(input.intent)) return null;
  const event = input.event || {};
  const contact = input.contact || {};
  const entities = input.entities || {};
  const score = input.opportunityScore || { score: 0, reasons: [] };
  return {
    contact_name: contact.name || null,
    company_name: null,
    phone: contact.phone || null,
    whatsapp: String(event.platform || '').toLowerCase() === 'whatsapp' ? contact.phone || null : null,
    email: contact.email || null,
    city: entities.location ? entities.location.city : null,
    country: entities.location && entities.location.country ? entities.location.country : 'SA',
    industry: entities.industry || null,
    source: event.platform ? 'social:' + String(event.platform).toLowerCase() : 'inbox',
    pipeline_stage: 'contacted',
    opportunity_score: score.score,
    score_breakdown: score,
    custom_fields: {
      external_user_id: contact.external_user_id || null,
      username: contact.username || null,
      platform: contact.platform || null,
      service_interest: entities.service_interest || [],
      qualification: entities.qualification || {},
      detected_intent: input.intent
    }
  };
}

export function buildConversationPayload(input = {}) {
  const event = input.event || {};
  const analysis = input.analysis || {};
  const contact = input.contact || {};
  return {
    platform: String(event.platform || 'unknown').toLowerCase(),
    external_thread_id: event.external_thread_id ? String(event.external_thread_id) : null,
    contact_id: input.contactId || null,
    lead_id: input.leadId || null,
    company_id: input.companyId || null,
    sentiment: analysis.sentiment || null,
    intent: analysis.intent || null,
    priority: analysis.intent === 'quote_request' ? 'high' : 'normal',
    status: analysis.intent === 'spam' ? 'spam' : 'open',
    last_message_at: event.received_at || new Date().toISOString(),
    unread_count: 1,
    metadata: { external_user_id: contact.external_user_id || null, username: contact.username || null }
  };
}

export function buildMessagePayload(input = {}) {
  const event = input.event || {};
  return {
    conversation_id: input.conversationId || null,
    direction: 'inbound',
    body: messageText(event) || null,
    external_message_id: event.external_message_id ? String(event.external_message_id) : null,
    sender_name: event.author_name || event.contact_name || event.name || null,
    ai_meta: {},
    created_at: event.received_at || new Date().toISOString()
  };
}

async function maybeAi(event, base, useAI) {
  if (!useAI) return base;
  try {
    const provider = await import('../ai/provider.js');
    const result = await provider.generateStructured({
      system: 'Analyze this inbound business message conservatively. Never invent missing facts. Return null for unknown values.',
      prompt: 'Platform: ' + String(event.platform || 'unknown') + '\nMessage: ' + messageText(event),
      schemaHint: '{"intent":"sales|quote_request|booking|support|complaint|existing_customer|spam|general_question","confidence":0.0,"industry":"string|null","service_interest":["string"],"city":"string|null","budget":"string|null","timeline":"string|null","decision_maker":"boolean|null","pain_points":["string"]}'
    });
    const ai = result.data || {};
    const allowed = new Set(['sales','quote_request','booking','support','complaint','existing_customer','spam','general_question']);
    const entities = Object.assign({}, base.entities);
    if (ai.industry) entities.industry = ai.industry;
    if (Array.isArray(ai.service_interest) && ai.service_interest.length) entities.service_interest = ai.service_interest;
    entities.location = Object.assign({}, entities.location, ai.city ? { city: ai.city, country: 'SA' } : {});
    entities.qualification = Object.assign({}, entities.qualification, {
      budget: ai.budget ?? entities.qualification.budget,
      timeline: ai.timeline ?? entities.qualification.timeline,
      decision_maker: ai.decision_maker ?? entities.qualification.decision_maker,
      pain_points: Array.isArray(ai.pain_points) && ai.pain_points.length ? ai.pain_points : entities.qualification.pain_points
    });
    return {
      intent: allowed.has(ai.intent) ? ai.intent : base.intent,
      confidence: Math.max(Number(base.confidence || 0), Number(ai.confidence || 0)),
      entities: entities,
      ai: { provider: result.provider, model: result.model }
    };
  } catch (error) {
    return Object.assign({}, base, { ai_error: error.code || error.message || 'AI_ERROR' });
  }
}

export async function analyzeInboxEvent(event = {}, options = {}) {
  const contact = normalizeContact(event);
  const baseIntent = classifyIntentDeterministic(event);
  const entities = extractEntities(event);
  const enhanced = await maybeAi(event, { intent: baseIntent.intent, confidence: baseIntent.confidence, entities: entities }, Boolean(options.useAI));
  const intent = enhanced.intent;
  const finalEntities = enhanced.entities || entities;
  const existingMatch = matchExistingLead(contact, options.existingCandidates || []);
  const opportunity_score = calculateInitialOpportunityScore({ event: event, intent: intent, contact: contact, entities: finalEntities });
  const crm = buildCrmRecommendation({ intent: intent, existingMatch: existingMatch, opportunityScore: opportunity_score });
  const temperature = opportunity_score.score >= 70 ? 'hot' : opportunity_score.score >= 35 ? 'warm' : 'cold';

  const analysis = {
    contact: contact,
    intent: intent,
    lead_temperature: temperature,
    industry: finalEntities.industry,
    service_interest: finalEntities.service_interest,
    location: finalEntities.location,
    qualification: finalEntities.qualification,
    crm: crm,
    opportunity_score: opportunity_score,
    confidence: enhanced.confidence,
    existing_match: existingMatch
  };

  return Object.assign({}, analysis, {
    lead_payload: crm.should_create_lead || crm.should_update_existing
      ? buildLeadPayload({ event: event, contact: contact, intent: intent, entities: finalEntities, opportunityScore: opportunity_score })
      : null,
    conversation_payload: buildConversationPayload({ event: event, contact: contact, analysis: analysis }),
    message_payload: buildMessagePayload({ event: event })
  }, enhanced.ai ? { ai: enhanced.ai } : {}, enhanced.ai_error ? { ai_error: enhanced.ai_error } : {});
}

export default {
  analyzeInboxEvent,
  normalizeContact,
  normalizePhone,
  normalizeEmail,
  matchExistingLead,
  buildLeadPayload,
  buildConversationPayload,
  buildMessagePayload,
  buildCrmRecommendation,
  calculateInitialOpportunityScore,
  classifyIntentDeterministic,
  extractEntities
};
