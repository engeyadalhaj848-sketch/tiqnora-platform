/**
 * Tiqnora V6 — Sales Playbooks + Follow-up Intelligence
 * Deterministic only. No DB writes, no scheduling, no outbound messaging.
 */
import { VERTICALS, detectVertical, findMissingQualification, scoreLeadQuality } from './lead-enrichment.js';

const SALES_INTENTS = new Set(['sales', 'quote_request', 'booking']);
const SUPPORT_INTENTS = new Set(['support', 'complaint', 'existing_customer']);

const PLAYBOOK_QUESTIONS = Object.freeze({
  dental_clinic: [
    ['has_website', 'هل لديكم موقع حالي؟'],
    ['has_booking', 'هل يوجد لديكم نظام حجز حالي؟'],
    ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business حاليًا؟'],
    ['branch_count', 'كم عدد فروع العيادة؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  clinics: [
    ['has_website', 'هل لديكم موقع حالي؟'],
    ['has_booking', 'هل يوجد لديكم نظام حجز حالي؟'],
    ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business حاليًا؟'],
    ['branch_count', 'كم عدد الفروع؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  real_estate: [
    ['has_crm', 'هل تستخدمون CRM حاليًا لمتابعة العملاء والفرص؟'],
    ['inventory_type', 'هل تركزون على البيع أم التأجير أم كليهما؟'],
    ['lead_volume', 'كم عدد العملاء المحتملين الذين تستقبلونهم تقريبًا شهريًا؟'],
    ['sales_team_size', 'كم عدد أفراد فريق المبيعات؟'],
    ['timeline', 'متى ترغبون ببدء الحل؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  restaurants: [
    ['has_website', 'هل لديكم موقع أو منيو إلكتروني حالي؟'],
    ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business للطلبات أو الاستفسارات؟'],
    ['branch_count', 'كم عدد الفروع؟'],
    ['reservation_model', 'هل تحتاجون حجز طاولات أم طلبات فقط؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  hotels: [
    ['booking_engine', 'هل لديكم محرك حجز مباشر حاليًا؟'],
    ['room_count', 'كم عدد الغرف أو الوحدات؟'],
    ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business لخدمة النزلاء؟'],
    ['ota_channels', 'ما منصات الحجز الخارجية المستخدمة حاليًا؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  salons: [
    ['has_booking', 'هل يوجد لديكم نظام حجز حالي؟'],
    ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business للحجوزات؟'],
    ['branch_count', 'كم عدد الفروع؟'],
    ['staff_count', 'كم عدد الموظفين أو مقدمي الخدمات؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  retail: [
    ['has_ecommerce', 'هل لديكم متجر إلكتروني حالي؟'],
    ['sku_count', 'كم عدد المنتجات تقريبًا؟'],
    ['has_whatsapp_business', 'هل تستخدمون WhatsApp Business للمبيعات والدعم؟'],
    ['delivery_model', 'كيف تتم إدارة الشحن والتوصيل حاليًا؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  contracting: [
    ['project_type', 'ما نوع المشاريع التي تستهدفونها؟'],
    ['has_crm', 'هل تستخدمون CRM لمتابعة الفرص والعروض؟'],
    ['quote_process', 'كيف يتم تجهيز عروض الأسعار حاليًا؟'],
    ['decision_maker', 'هل أنت صاحب القرار في المشروع؟'],
    ['timeline', 'متى ترغبون ببدء الحل؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  professional_services: [
    ['service_type', 'ما الخدمات الرئيسية التي تقدمونها؟'],
    ['lead_source', 'من أين تأتي أغلب الاستفسارات الحالية؟'],
    ['has_crm', 'هل لديكم CRM لمتابعة العملاء؟'],
    ['has_booking', 'هل تحتاجون نظام حجز أو استشارات؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ],
  general: [
    ['business_type', 'ما نوع النشاط التجاري؟'],
    ['main_goal', 'ما أهم هدف تريد تحقيقه الآن؟'],
    ['decision_maker', 'هل أنت صاحب القرار في المشروع؟'],
    ['timeline', 'متى ترغبون ببدء المشروع؟'],
    ['budget', 'هل توجد ميزانية تقريبية للمشروع؟']
  ]
});

function clean(value) {
  return value === null || value === undefined ? null : String(value).trim();
}

function getInbox(input = {}) {
  return input.inbox_analysis || input.inboxAnalysis || {};
}

function getIntent(input = {}) {
  const inbox = getInbox(input);
  return clean(input.intent || inbox.intent || input.lead?.custom_fields?.detected_intent || 'general_question')?.toLowerCase();
}

function getVerticalId(input = {}) {
  return input.enrichment?.vertical?.id || detectVertical(input).id || 'general';
}

function getQuality(input = {}) {
  return input.enrichment?.quality || scoreLeadQuality(input);
}

function getServices(input = {}) {
  const inbox = getInbox(input);
  return [
    ...(input.enrichment?.services?.primary || []),
    ...(Array.isArray(inbox.service_interest) ? inbox.service_interest : [])
  ].filter(Boolean);
}

function mergedFields(input = {}) {
  const inbox = getInbox(input);
  const lead = input.lead || {};
  return {
    ...(lead.custom_fields || {}),
    ...(lead.custom_fields?.qualification || {}),
    ...(inbox.qualification || {}),
    ...(input.qualification || {}),
    ...(input.custom_fields || {}),
    has_website: input.has_website ?? lead.custom_fields?.has_website ?? Boolean(lead.website) || undefined,
    has_whatsapp_business: input.has_whatsapp_business ?? lead.custom_fields?.has_whatsapp_business ?? Boolean(lead.whatsapp) || undefined,
    company_name: lead.company_name || inbox.lead_payload?.company_name || null,
    city: lead.city || inbox.location?.city || null
  };
}

function present(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
}

export function selectSalesPlaybook(input = {}) {
  const verticalId = getVerticalId(input);
  const config = VERTICALS[verticalId] || VERTICALS.general;
  const enrichment = input.enrichment || {};
  return {
    vertical_id: verticalId,
    pack_name: enrichment.pack?.name || config.name,
    pipeline: enrichment.pack?.recommended_pipeline || config.pipeline,
    agents: enrichment.pack?.recommended_agents || [...config.agents],
    primary_services: enrichment.services?.primary || [...config.services].slice(0, 3)
  };
}

export function buildQualificationPlan(input = {}) {
  const verticalId = getVerticalId(input);
  const questions = PLAYBOOK_QUESTIONS[verticalId] || PLAYBOOK_QUESTIONS.general;
  const fields = mergedFields(input);

  const unanswered = questions.filter(([key]) => !present(fields[key]));
  const answered = questions.length - unanswered.length;
  const qualification_progress = questions.length
    ? Math.round((answered / questions.length) * 100)
    : 100;

  return {
    next_key: unanswered[0]?.[0] || null,
    next_question: unanswered[0]?.[1] || null,
    remaining_questions: unanswered.slice(1).map(([key, question]) => ({ key, question })),
    qualification_progress,
    answered_count: answered,
    total_questions: questions.length,
    max_questions_per_reply: 1
  };
}

export function buildConversationStrategy(input = {}, qualificationInput = null) {
  const intent = getIntent(input);
  const qualification = qualificationInput || buildQualificationPlan(input);

  if (SUPPORT_INTENTS.has(intent)) {
    return {
      tone: 'helpful',
      objective: 'handoff_support',
      max_questions_per_reply: 1,
      cta: 'clarify_issue',
      avoid: ['invent_prices', 'pressure_customer', 'send_without_approval']
    };
  }
  if (intent === 'spam') {
    return {
      tone: 'none',
      objective: 'ignore',
      max_questions_per_reply: 0,
      cta: 'none',
      avoid: ['reply_to_spam', 'send_without_approval']
    };
  }
  if (intent === 'booking') {
    return {
      tone: 'consultative',
      objective: 'book',
      max_questions_per_reply: 1,
      cta: 'propose_meeting',
      avoid: ['invent_availability', 'invent_prices', 'pressure_customer', 'send_without_approval']
    };
  }
  if (intent === 'quote_request' && qualification.next_question === null) {
    return {
      tone: 'consultative',
      objective: 'prepare_quote',
      max_questions_per_reply: 1,
      cta: 'confirm_scope',
      avoid: ['invent_prices', 'pressure_customer', 'send_without_approval']
    };
  }

  return {
    tone: 'consultative',
    objective: qualification.next_question ? 'qualify' : 'advance_sale',
    max_questions_per_reply: 1,
    cta: qualification.next_question ? 'answer_question' : 'propose_meeting',
    avoid: ['invent_prices', 'pressure_customer', 'send_without_approval']
  };
}

export function evaluateQuoteReadiness(input = {}) {
  const intent = getIntent(input);
  if (!SALES_INTENTS.has(intent)) {
    return {
      ready: false,
      score: 0,
      missing: [],
      reason: 'الحالة ليست فرصة مبيعات جديدة'
    };
  }

  const fields = mergedFields(input);
  const services = getServices(input);
  const verticalId = getVerticalId(input);
  let score = 0;
  const missing = [];

  if (verticalId !== 'general') score += 15;
  else missing.push('industry');

  if (services.length > 0) score += 20;
  else missing.push('service_interest');

  if (present(fields.timeline)) score += 20;
  else missing.push('timeline');

  if (present(fields.budget)) score += 20;
  else missing.push('budget');

  if (fields.decision_maker === true) score += 15;
  else missing.push('decision_maker');

  const lead = input.lead || {};
  const inbox = getInbox(input);
  if (lead.phone || lead.whatsapp || inbox.contact?.phone || lead.email || inbox.contact?.email) score += 10;
  else missing.push('contact_method');

  score = Math.min(100, score);
  const criticalMissing = missing.filter(x => ['industry', 'service_interest', 'timeline'].includes(x));
  const ready = score >= 70 && criticalMissing.length === 0;

  return {
    ready,
    score,
    missing,
    reason: ready
      ? 'بيانات النطاق والتوقيت والتواصل كافية لتجهيز عرض مبدئي بدون اختراع سعر'
      : 'توجد بيانات تأهيل ناقصة قبل تجهيز العرض'
  };
}

export function recommendFollowUp(input = {}) {
  const intent = getIntent(input);
  const quality = getQuality(input);
  const conversation = input.conversation || {};

  if (SUPPORT_INTENTS.has(intent)) {
    return {
      recommended: false,
      cadence: 'no_follow_up',
      delay_hours: 0,
      reason: 'هذه حالة دعم أو عميل قائم وتحتاج مسار خدمة لا متابعة مبيعات',
      draft_goal: 'support_handoff'
    };
  }
  if (intent === 'spam' || intent === 'general_question') {
    return {
      recommended: false,
      cadence: 'no_follow_up',
      delay_hours: 0,
      reason: 'لا توجد فرصة مبيعات مؤكدة تستحق متابعة آلية',
      draft_goal: 'no_action'
    };
  }

  if (intent === 'booking') {
    return {
      recommended: true,
      cadence: 'same_day',
      delay_hours: 6,
      reason: 'طلب الحجز حساس للوقت',
      draft_goal: 'confirm_booking_interest'
    };
  }

  if (intent === 'quote_request') {
    return {
      recommended: true,
      cadence: quality.score >= 60 ? 'next_day' : '2_days',
      delay_hours: quality.score >= 60 ? 24 : 48,
      reason: 'طلب عرض السعر يحتاج متابعة إذا لم يكتمل التأهيل أو لم يصل رد',
      draft_goal: 'complete_quote_qualification'
    };
  }

  if (conversation.unanswered_inbound === true) {
    return {
      recommended: true,
      cadence: 'next_day',
      delay_hours: 24,
      reason: 'هناك استفسار أو سؤال تأهيل بلا رد',
      draft_goal: 'resume_qualification'
    };
  }

  if (quality.score >= 80) {
    return {
      recommended: true,
      cadence: 'next_day',
      delay_hours: 24,
      reason: 'فرصة عالية الجودة وتستحق متابعة سريعة',
      draft_goal: 'advance_high_intent_lead'
    };
  }
  if (quality.score >= 60) {
    return {
      recommended: true,
      cadence: '2_days',
      delay_hours: 48,
      reason: 'فرصة جيدة تحتاج متابعة منتظمة',
      draft_goal: 'advance_qualified_lead'
    };
  }
  if (quality.score >= 30) {
    return {
      recommended: true,
      cadence: '3_days',
      delay_hours: 72,
      reason: 'فرصة متوسطة تحتاج متابعة غير ضاغطة',
      draft_goal: 'nurture_and_qualify'
    };
  }

  return {
    recommended: true,
    cadence: '7_days',
    delay_hours: 168,
    reason: 'فرصة منخفضة وتناسبها متابعة خفيفة',
    draft_goal: 'nurture'
  };
}

export function recommendSalesAction(input = {}, quoteInput = null, qualificationInput = null) {
  const intent = getIntent(input);
  const quote = quoteInput || evaluateQuoteReadiness(input);
  const qualification = qualificationInput || buildQualificationPlan(input);
  const quality = getQuality(input);

  let action;
  let reason;

  if (SUPPORT_INTENTS.has(intent)) {
    action = 'support_handoff';
    reason = 'عميل قائم أو حالة دعم';
  } else if (intent === 'spam' || intent === 'general_question') {
    action = 'no_action';
    reason = 'لا توجد إشارة مبيعات كافية';
  } else if (intent === 'booking') {
    action = 'propose_meeting';
    reason = 'العميل طلب حجزًا أو موعدًا';
  } else if (intent === 'quote_request' && quote.ready) {
    action = 'prepare_quote';
    reason = 'بيانات العرض الأساسية جاهزة';
  } else if (qualification.next_question) {
    action = 'ask_qualification';
    reason = 'لا تزال هناك بيانات تأهيل ناقصة';
  } else if (quality.score >= 80) {
    action = 'create_opportunity';
    reason = 'جودة الفرصة مرتفعة والبيانات كافية';
  } else if (quality.score >= 60) {
    action = 'propose_meeting';
    reason = 'الفرصة جيدة وتحتاج انتقالًا لمحادثة بيعية';
  } else if (quality.score >= 30) {
    action = 'follow_up';
    reason = 'الفرصة متوسطة وتحتاج متابعة';
  } else {
    action = 'nurture';
    reason = 'الفرصة منخفضة وتحتاج رعاية';
  }

  return {
    action,
    reason,
    requires_approval: action !== 'no_action',
    execute_automatically: false
  };
}

export function buildSalesPlaybookResult(input = {}) {
  const playbook = selectSalesPlaybook(input);
  const qualification = buildQualificationPlan(input);
  const strategy = buildConversationStrategy(input, qualification);
  const quote_readiness = evaluateQuoteReadiness(input);
  const follow_up = recommendFollowUp(input);
  const action = recommendSalesAction(input, quote_readiness, qualification);

  return {
    playbook,
    qualification,
    strategy,
    quote_readiness,
    follow_up,
    action,
    approval: {
      requires_approval: action.requires_approval,
      auto_send: false,
      auto_schedule: false,
      invent_prices: false
    }
  };
}

export default {
  selectSalesPlaybook,
  buildQualificationPlan,
  buildConversationStrategy,
  recommendFollowUp,
  evaluateQuoteReadiness,
  recommendSalesAction,
  buildSalesPlaybookResult
};
