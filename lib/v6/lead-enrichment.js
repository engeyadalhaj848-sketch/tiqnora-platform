/**
 * Tiqnora V6 — Lead Enrichment + Vertical Packs
 * Deterministic by default. No DB writes. Optional AI may enrich classification only.
 */

const SALES_INTENTS = new Set(['sales', 'quote_request', 'booking']);
const NON_SALES_INTENTS = new Set(['support', 'complaint', 'existing_customer', 'spam', 'general_question']);

export const VERTICALS = Object.freeze({
  clinics: {
    id: 'clinics',
    name: 'Tiqnora for Clinics',
    pipeline: 'clinic_sales',
    agents: ['sales', 'booking', 'reputation', 'social'],
    services: ['website', 'booking_system', 'whatsapp_automation', 'review_management', 'local_seo', 'social_media'],
    qualification: [
      ['has_booking', 'هل يوجد لديكم نظام حجز حالي؟'],
      ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business حاليًا؟'],
      ['branch_count', 'كم عدد الفروع؟'],
      ['has_website', 'هل لديكم موقع إلكتروني حالي؟'],
      ['has_google_business', 'هل لديكم ملف Google Business Profile؟']
    ]
  },
  dental_clinic: {
    id: 'dental_clinic',
    name: 'Tiqnora for Dental Clinics',
    pipeline: 'clinic_sales',
    agents: ['sales', 'booking', 'reputation', 'social'],
    services: ['website', 'booking_system', 'whatsapp_automation', 'review_management', 'local_seo', 'social_media'],
    qualification: [
      ['has_booking', 'هل يوجد لديكم نظام حجز حالي؟'],
      ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business حاليًا؟'],
      ['branch_count', 'كم عدد فروع العيادة؟'],
      ['has_website', 'هل لدى العيادة موقع إلكتروني حالي؟'],
      ['has_google_business', 'هل لديكم ملف Google Business Profile للعيادة؟']
    ]
  },
  real_estate: {
    id: 'real_estate',
    name: 'Tiqnora for Real Estate',
    pipeline: 'real_estate_sales',
    agents: ['sales', 'lead_research', 'follow_up', 'social'],
    services: ['crm', 'whatsapp_automation', 'lead_generation', 'booking_system', 'social_media', 'website'],
    qualification: [
      ['inventory_type', 'هل تركزون على بيع العقارات أم التأجير أم كليهما؟'],
      ['lead_volume', 'كم عدد العملاء المحتملين الذين تستقبلونهم تقريبًا شهريًا؟'],
      ['has_crm', 'هل تستخدمون CRM حاليًا؟'],
      ['has_whatsapp_business', 'هل لديكم WhatsApp Business للمبيعات؟'],
      ['sales_team_size', 'كم عدد أفراد فريق المبيعات؟']
    ]
  },
  restaurants: {
    id: 'restaurants',
    name: 'Tiqnora for Restaurants',
    pipeline: 'restaurant_sales',
    agents: ['sales', 'social', 'reputation', 'booking'],
    services: ['website', 'whatsapp_automation', 'booking_system', 'review_management', 'social_media', 'local_seo'],
    qualification: [
      ['branch_count', 'كم عدد الفروع؟'],
      ['has_website', 'هل لديكم موقع أو منيو إلكتروني؟'],
      ['has_whatsapp_business', 'هل تستقبلون الطلبات أو الاستفسارات عبر WhatsApp Business؟'],
      ['has_google_business', 'هل ملفات Google Maps للفروع محدثة؟'],
      ['reservation_model', 'هل تحتاجون حجز طاولات أم طلبات فقط؟']
    ]
  },
  hotels: {
    id: 'hotels',
    name: 'Tiqnora for Hotels',
    pipeline: 'hospitality_sales',
    agents: ['sales', 'booking', 'reputation', 'social'],
    services: ['website', 'booking_system', 'whatsapp_automation', 'review_management', 'local_seo', 'social_media'],
    qualification: [
      ['room_count', 'كم عدد الغرف أو الوحدات؟'],
      ['booking_engine', 'هل لديكم محرك حجز مباشر حاليًا؟'],
      ['ota_channels', 'ما منصات الحجز الخارجية المستخدمة حاليًا؟'],
      ['has_whatsapp_business', 'هل لديكم WhatsApp Business لخدمة النزلاء؟'],
      ['has_google_business', 'هل تتم إدارة تقييمات Google بانتظام؟']
    ]
  },
  salons: {
    id: 'salons',
    name: 'Tiqnora for Salons',
    pipeline: 'salon_sales',
    agents: ['sales', 'booking', 'social', 'reputation'],
    services: ['booking_system', 'whatsapp_automation', 'social_media', 'website', 'review_management', 'local_seo'],
    qualification: [
      ['branch_count', 'كم عدد الفروع؟'],
      ['has_booking', 'هل يوجد نظام حجز حالي؟'],
      ['staff_count', 'كم عدد الموظفين أو مقدمي الخدمات؟'],
      ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business للحجوزات؟'],
      ['has_google_business', 'هل لديكم ملف Google Business Profile؟']
    ]
  },
  retail: {
    id: 'retail',
    name: 'Tiqnora for Retail',
    pipeline: 'retail_sales',
    agents: ['sales', 'social', 'support', 'follow_up'],
    services: ['ecommerce', 'whatsapp_automation', 'social_media', 'crm', 'customer_support', 'local_seo'],
    qualification: [
      ['has_ecommerce', 'هل لديكم متجر إلكتروني حالي؟'],
      ['sku_count', 'كم عدد المنتجات تقريبًا؟'],
      ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business للمبيعات والدعم؟'],
      ['delivery_model', 'كيف تتم إدارة الشحن والتوصيل حاليًا؟'],
      ['branch_count', 'كم عدد الفروع؟']
    ]
  },
  contracting: {
    id: 'contracting',
    name: 'Tiqnora for Contracting',
    pipeline: 'b2b_sales',
    agents: ['sales', 'lead_research', 'follow_up', 'content'],
    services: ['website', 'crm', 'whatsapp_automation', 'quote_automation', 'lead_generation', 'local_seo'],
    qualification: [
      ['project_type', 'ما نوع المشاريع التي تستهدفونها؟'],
      ['sales_cycle', 'كم تستغرق دورة البيع عادة؟'],
      ['has_crm', 'هل تستخدمون CRM لمتابعة الفرص والعروض؟'],
      ['quote_process', 'كيف يتم تجهيز عروض الأسعار حاليًا؟'],
      ['decision_process', 'من يشارك عادة في قرار التعاقد؟']
    ]
  },
  professional_services: {
    id: 'professional_services',
    name: 'Tiqnora for Professional Services',
    pipeline: 'b2b_sales',
    agents: ['sales', 'booking', 'content', 'follow_up'],
    services: ['website', 'booking_system', 'crm', 'whatsapp_automation', 'local_seo', 'content_marketing'],
    qualification: [
      ['service_type', 'ما الخدمات الرئيسية التي تقدمونها؟'],
      ['lead_source', 'من أين تأتي أغلب الاستفسارات الحالية؟'],
      ['has_crm', 'هل لديكم CRM لمتابعة العملاء؟'],
      ['has_booking', 'هل تحتاجون نظام حجز أو استشارات؟'],
      ['sales_team_size', 'كم عدد أفراد فريق المبيعات أو خدمة العملاء؟']
    ]
  },
  general: {
    id: 'general',
    name: 'Tiqnora Business Growth',
    pipeline: 'default',
    agents: ['sales', 'follow_up'],
    services: ['website', 'whatsapp_automation', 'crm', 'social_media', 'local_seo'],
    qualification: [
      ['business_type', 'ما نوع النشاط التجاري؟'],
      ['main_goal', 'ما أهم هدف تريد تحقيقه الآن؟'],
      ['budget', 'هل لديكم ميزانية تقريبية للمشروع؟'],
      ['timeline', 'متى ترغبون ببدء المشروع؟'],
      ['decision_maker', 'هل أنت صاحب القرار في المشروع؟']
    ]
  }
});

const SERVICE_ALIASES = Object.freeze({
  booking: 'booking_system',
  social: 'social_media',
  seo: 'local_seo',
  whatsapp: 'whatsapp_automation',
  web: 'website',
  site: 'website',
  store: 'ecommerce'
});

function clean(value) {
  return value == null ? null : String(value).trim();
}

function normalizeService(value) {
  const key = clean(value)?.toLowerCase();
  if (!key) return null;
  return SERVICE_ALIASES[key] || key;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function getInbox(input = {}) {
  return input.inbox_analysis || input.inboxAnalysis || {};
}

function getLead(input = {}) {
  const inbox = getInbox(input);
  return {
    ...(inbox.lead_payload || {}),
    ...(input.lead || {})
  };
}

function getQualification(input = {}) {
  const inbox = getInbox(input);
  return {
    ...(inbox.qualification || {}),
    ...(input.qualification || {}),
    ...(input.lead?.custom_fields?.qualification || {})
  };
}

function getIntent(input = {}) {
  const inbox = getInbox(input);
  return clean(input.intent || inbox.intent || input.lead?.custom_fields?.detected_intent || 'general_question')?.toLowerCase();
}

function getServices(input = {}) {
  const inbox = getInbox(input);
  const raw = [
    ...(Array.isArray(inbox.service_interest) ? inbox.service_interest : []),
    ...(Array.isArray(input.service_interest) ? input.service_interest : []),
    ...(Array.isArray(input.lead?.custom_fields?.service_interest) ? input.lead.custom_fields.service_interest : [])
  ];
  return unique(raw.map(normalizeService));
}

function rawIndustry(input = {}) {
  const inbox = getInbox(input);
  return clean(input.industry || input.lead?.industry || inbox.industry || inbox.lead_payload?.industry)?.toLowerCase();
}

const INDUSTRY_MAP = Object.freeze({
  clinic: 'clinics',
  clinics: 'clinics',
  medical: 'clinics',
  medical_center: 'clinics',
  dental: 'dental_clinic',
  dental_clinic: 'dental_clinic',
  dentist: 'dental_clinic',
  real_estate: 'real_estate',
  property: 'real_estate',
  restaurant: 'restaurants',
  restaurants: 'restaurants',
  cafe: 'restaurants',
  hotel: 'hotels',
  hospitality: 'hotels',
  salon: 'salons',
  beauty: 'salons',
  spa: 'salons',
  retail: 'retail',
  shop: 'retail',
  ecommerce: 'retail',
  contracting: 'contracting',
  construction: 'contracting',
  professional_services: 'professional_services',
  consulting: 'professional_services',
  legal: 'professional_services',
  accounting: 'professional_services'
});

export function detectVertical(input = {}) {
  const industry = rawIndustry(input);
  if (industry && INDUSTRY_MAP[industry]) {
    return { id: INDUSTRY_MAP[industry], confidence: 0.95, reason: 'industry' };
  }

  const lead = getLead(input);
  const text = [
    lead.company_name,
    input.company_name,
    input.context_text,
    getInbox(input).contact?.name
  ].filter(Boolean).join(' ');

  const rules = [
    ['dental_clinic', /(أسنان|اسنان|dental|dentist)/i],
    ['clinics', /(عيادة|مستوصف|مركز طبي|clinic|medical)/i],
    ['real_estate', /(عقار|عقارات|real estate|property)/i],
    ['restaurants', /(مطعم|كافيه|مقهى|restaurant|cafe)/i],
    ['hotels', /(فندق|hotel|hospitality)/i],
    ['salons', /(صالون|مشغل|beauty|salon|spa)/i],
    ['retail', /(متجر|محل|shop|retail|ecommerce)/i],
    ['contracting', /(مقاول|مقاولات|construction|contracting)/i],
    ['professional_services', /(استشارات|محام|قانون|محاسب|consulting|legal|accounting)/i]
  ];
  const row = rules.find(([, rx]) => rx.test(text));
  if (row) return { id: row[0], confidence: 0.80, reason: 'context' };

  return { id: 'general', confidence: 0.45, reason: 'fallback' };
}

function valuePresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
}

function qualificationValue(input, key) {
  const q = getQualification(input);
  const lead = getLead(input);
  const fields = {
    ...lead.custom_fields,
    ...(input.custom_fields || {}),
    ...q
  };
  return fields[key];
}

export function findMissingQualification(input = {}, verticalInput = null) {
  const vertical = verticalInput || detectVertical(input);
  const config = VERTICALS[vertical.id] || VERTICALS.general;
  const q = getQualification(input);

  const common = [
    ['budget', 'هل لديكم ميزانية تقريبية للمشروع؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['decision_maker', 'هل أنت صاحب القرار في المشروع؟']
  ];

  const required = [...common, ...config.qualification];
  const missing = [];
  const recommended_questions = [];

  for (const [key, question] of required) {
    let value;
    if (key === 'budget' || key === 'timeline' || key === 'decision_maker') value = q[key];
    else value = qualificationValue(input, key);
    if (!valuePresent(value)) {
      missing.push(key);
      recommended_questions.push(question);
    }
  }

  return {
    missing: unique(missing),
    recommended_questions: unique(recommended_questions).slice(0, 5)
  };
}

function currentOpportunityScore(input = {}) {
  const inbox = getInbox(input);
  const n = Number(
    input.opportunity_score ??
    inbox.opportunity_score?.score ??
    input.lead?.opportunity_score ??
    inbox.lead_payload?.opportunity_score ??
    0
  );
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

export function scoreLeadQuality(input = {}) {
  const intent = getIntent(input);
  if (NON_SALES_INTENTS.has(intent)) {
    return {
      score: 0,
      grade: 'low',
      reasons: ['ليست فرصة مبيعات جديدة'],
      missing_data: []
    };
  }

  const lead = getLead(input);
  const inbox = getInbox(input);
  const q = getQualification(input);
  const services = getServices(input);
  const vertical = detectVertical(input);
  const missing = findMissingQualification(input, vertical).missing;
  const reasons = [];

  let score = Math.round(currentOpportunityScore(input) * 0.35);
  if (score > 0) reasons.push('درجة فرصة أولية موجودة');

  if (intent === 'quote_request') { score += 16; reasons.push('طلب عرض سعر'); }
  else if (intent === 'booking') { score += 14; reasons.push('طلب حجز أو موعد'); }
  else if (intent === 'sales') { score += 10; reasons.push('نية مبيعات واضحة'); }

  const phone = lead.phone || lead.whatsapp || inbox.contact?.phone;
  const email = lead.email || inbox.contact?.email;
  const company = lead.company_name || input.company_name;
  const city = lead.city || inbox.location?.city;
  const website = lead.website || input.website;

  if (phone) { score += 8; reasons.push('رقم هاتف متاح'); }
  if (email) { score += 5; reasons.push('بريد إلكتروني متاح'); }
  if (company) { score += 6; reasons.push('اسم منشأة متاح'); }
  if (city) { score += 5; reasons.push('المدينة معروفة'); }
  if (vertical.id !== 'general') { score += 6; reasons.push('القطاع محدد'); }
  if (website) { score += 4; reasons.push('موقع المنشأة معروف'); }

  if (services.length >= 2) { score += 8; reasons.push('اهتمام بأكثر من خدمة'); }
  else if (services.length === 1) { score += 4; reasons.push('خدمة مطلوبة محددة'); }

  if (q.budget) { score += 10; reasons.push('الميزانية معروفة'); }
  if (q.timeline) { score += 8; reasons.push('الإطار الزمني معروف'); }
  if (q.decision_maker === true) { score += 8; reasons.push('صاحب قرار'); }

  const engagement = Number(input.engagement_count ?? input.prior_conversation_engagement ?? 0);
  if (engagement >= 3) { score += 6; reasons.push('تفاعل سابق متعدد'); }
  else if (engagement >= 1) { score += 3; reasons.push('يوجد تفاعل سابق'); }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? 'very_high' : score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

  return { score, grade, reasons: unique(reasons), missing_data: missing };
}

function serviceReason(service, vertical, requested) {
  if (requested.includes(service)) return 'الخدمة مطلوبة أو مذكورة في اهتمام العميل';
  const labels = {
    website: 'واجهة رقمية أساسية للقطاع',
    ecommerce: 'مناسب للمبيعات والكتالوج الإلكتروني',
    booking_system: 'يقلل الاحتكاك في الحجز والمواعيد',
    whatsapp_automation: 'يسرّع الرد والمتابعة عبر واتساب',
    review_management: 'يحسن إدارة السمعة والتقييمات',
    local_seo: 'يزيد الظهور المحلي والبحث الجغرافي',
    social_media: 'يدعم الاكتساب والمحتوى المستمر',
    crm: 'ينظم العملاء والفرص والمتابعات',
    lead_generation: 'يزيد تدفق العملاء المحتملين',
    quote_automation: 'يسرّع تجهيز عروض الأسعار والمتابعة',
    customer_support: 'يحسن خدمة العملاء بعد البيع',
    content_marketing: 'يبني الثقة والطلب للخدمات المهنية'
  };
  return labels[service] || ('ملائم لقطاع ' + vertical.id);
}

export function recommendServices(input = {}, verticalInput = null) {
  const intent = getIntent(input);
  if (!SALES_INTENTS.has(intent)) return { primary: [], secondary: [], reasons: {} };

  const vertical = verticalInput || detectVertical(input);
  const config = VERTICALS[vertical.id] || VERTICALS.general;
  const requested = getServices(input);
  const configured = config.services;

  const primary = unique([
    ...requested.filter(s => configured.includes(s)),
    ...configured.slice(0, 3)
  ]).slice(0, 4);

  const secondary = configured.filter(s => !primary.includes(s)).slice(0, 4);
  const reasons = {};
  for (const service of [...primary, ...secondary]) {
    reasons[service] = serviceReason(service, vertical, requested);
  }
  return { primary, secondary, reasons };
}

export function recommendNextAction(input = {}, qualityInput = null, missingInput = null) {
  const intent = getIntent(input);
  const quality = qualityInput || scoreLeadQuality(input);
  const missing = missingInput || findMissingQualification(input);

  if (intent === 'support' || intent === 'complaint' || intent === 'existing_customer') {
    return { action: 'support_handoff', reason: 'الحالة تتعلق بعميل قائم أو دعم وليست فرصة مبيعات جديدة' };
  }
  if (intent === 'spam' || intent === 'general_question') {
    return { action: 'no_action', reason: 'لا توجد إشارة مبيعات كافية لإنشاء إجراء تجاري' };
  }
  if (intent === 'booking') {
    return { action: 'propose_meeting', reason: 'العميل أظهر نية مباشرة للحجز أو الموعد' };
  }
  if (intent === 'quote_request' && missing.missing.length <= 1) {
    return { action: 'prepare_quote', reason: 'طلب تسعير والبيانات الأساسية شبه مكتملة' };
  }
  if (quality.score >= 80 && missing.missing.length <= 2) {
    return { action: 'create_opportunity', reason: 'جودة الفرصة مرتفعة وبيانات التأهيل كافية' };
  }
  if (missing.missing.length > 0) {
    return {
      action: 'ask_qualification',
      reason: intent === 'quote_request' ? 'طلب تسعير مع نقص بيانات تأهيل' : 'بيانات تأهيل ناقصة'
    };
  }
  if (quality.score >= 60) return { action: 'propose_meeting', reason: 'فرصة جيدة وجاهزة للمحادثة البيعية' };
  if (quality.score >= 30) return { action: 'follow_up', reason: 'الفرصة متوسطة وتحتاج متابعة' };
  return { action: 'nurture', reason: 'الفرصة منخفضة حاليًا وتحتاج رعاية قبل البيع' };
}

export function buildVerticalPack(verticalInput) {
  const vertical = typeof verticalInput === 'string' ? { id: verticalInput } : verticalInput;
  const config = VERTICALS[vertical?.id] || VERTICALS.general;
  return {
    name: config.name,
    recommended_pipeline: config.pipeline,
    recommended_agents: [...config.agents]
  };
}

export function buildEnrichmentPayload(result = {}) {
  return {
    opportunity_score: result.quality?.score ?? 0,
    score_breakdown: {
      grade: result.quality?.grade || 'low',
      reasons: result.quality?.reasons || [],
      missing_data: result.quality?.missing_data || []
    },
    industry: result.vertical?.id === 'general' ? null : result.vertical?.id || null,
    custom_fields: {
      vertical_pack: result.pack || null,
      recommended_services: result.services || null,
      missing_qualification: result.missing || null,
      next_best_action: result.next_best_action || null
    }
  };
}

async function maybeAiVertical(input, base, useAI) {
  if (!useAI) return base;
  try {
    const provider = await import('../ai/provider.js');
    const result = await provider.generateStructured({
      system: 'Classify the business vertical conservatively. Do not invent details. Prefer the supplied deterministic result when evidence is weak.',
      prompt: JSON.stringify({
        deterministic_vertical: base.id,
        industry: rawIndustry(input),
        company_name: getLead(input).company_name || null,
        services: getServices(input)
      }),
      schemaHint: '{"vertical":"clinics|dental_clinic|real_estate|restaurants|hotels|salons|retail|contracting|professional_services|general","confidence":0.0}'
    });
    const candidate = result.data || {};
    if (VERTICALS[candidate.vertical] && Number(candidate.confidence) >= 0.75) {
      return {
        id: candidate.vertical,
        confidence: Math.max(base.confidence, Number(candidate.confidence)),
        reason: 'ai_enriched',
        ai: { provider: result.provider, model: result.model }
      };
    }
    return base;
  } catch (error) {
    return { ...base, ai_error: error.code || error.message || 'AI_ERROR' };
  }
}

export async function enrichLead(input = {}, options = {}) {
  const deterministicVertical = detectVertical(input);
  const vertical = await maybeAiVertical(input, deterministicVertical, Boolean(options.useAI));
  const missing = findMissingQualification(input, vertical);
  const quality = scoreLeadQuality({ ...input, industry: vertical.id === 'general' ? rawIndustry(input) : vertical.id });
  const services = recommendServices(input, vertical);
  const next_best_action = recommendNextAction(input, quality, missing);
  const pack = buildVerticalPack(vertical);

  const result = {
    vertical: {
      id: vertical.id,
      confidence: vertical.confidence,
      reason: vertical.reason
    },
    pack,
    quality,
    services,
    missing,
    next_best_action
  };

  if (vertical.ai) result.ai = vertical.ai;
  if (vertical.ai_error) result.ai_error = vertical.ai_error;
  result.enrichment_payload = buildEnrichmentPayload(result);
  return result;
}

export default {
  VERTICALS,
  enrichLead,
  detectVertical,
  scoreLeadQuality,
  findMissingQualification,
  recommendServices,
  recommendNextAction,
  buildVerticalPack,
  buildEnrichmentPayload
};
