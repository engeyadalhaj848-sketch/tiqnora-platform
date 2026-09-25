/**
 * Tiqnora V6 — Quote Drafting + Proposal Composer
 * Pure deterministic business logic. No DB writes, pricing invention, scheduling, or outbound sends.
 */
import { VERTICALS } from './lead-enrichment.js';

const SALES_INTENTS = new Set(['sales', 'quote_request', 'booking']);
const BLOCKED_INTENTS = new Set(['support', 'complaint', 'existing_customer', 'spam']);

const SERVICE_CATALOG = Object.freeze({
  website: {
    ar: {
      label: 'الموقع الإلكتروني',
      scope: ['موقع أعمال متجاوب', 'صفحات الخدمات والمعلومات', 'نماذج تواصل والتقاط العملاء', 'زر تواصل عبر واتساب', 'تهيئة تقنية أساسية لمحركات البحث'],
      deliverables: ['هيكل موقع متجاوب', 'نماذج تواصل', 'ربط CTA للواتساب', 'تهيئة Analytics-ready', 'أساسيات Technical SEO']
    },
    en: {
      label: 'Business Website',
      scope: ['Responsive business website', 'Service and information pages', 'Lead capture forms', 'WhatsApp CTA', 'Basic technical SEO foundation'],
      deliverables: ['Responsive website structure', 'Lead capture forms', 'WhatsApp CTA integration', 'Analytics-ready structure', 'Basic technical SEO']
    }
  },
  ecommerce: {
    ar: {
      label: 'المتجر الإلكتروني',
      scope: ['واجهة متجر متجاوبة', 'كتالوج منتجات', 'تدفق سلة وطلب', 'نماذج التقاط العملاء'],
      deliverables: ['واجهة متجر', 'كتالوج ومنتجات', 'سلة طلب', 'هيكل جاهز للقياس والتحليلات']
    },
    en: {
      label: 'E-commerce',
      scope: ['Responsive storefront', 'Product catalog', 'Cart and order flow', 'Lead capture'],
      deliverables: ['Storefront', 'Catalog structure', 'Cart flow', 'Analytics-ready structure']
    }
  },
  whatsapp_automation: {
    ar: {
      label: 'أتمتة واتساب',
      scope: ['تصميم تدفق المحادثات', 'التقاط بيانات العميل', 'توجيه العميل إلى CRM', 'منطق المتابعة بعد موافقة بشرية'],
      deliverables: ['تصميم Workflow', 'خطة القوالب المعتمدة عند الحاجة', 'ربط التقاط العملاء', 'قواعد التوجيه والمتابعة']
    },
    en: {
      label: 'WhatsApp Automation',
      scope: ['Conversation workflow design', 'Lead data capture', 'CRM routing', 'Approval-controlled follow-up logic'],
      deliverables: ['Workflow design', 'Approved-template planning where required', 'Lead capture mapping', 'Routing and follow-up rules']
    }
  },
  booking_system: {
    ar: {
      label: 'نظام الحجز',
      scope: ['تدفق الحجز', 'التقاط بيانات الموعد', 'منطق الإشعارات', 'ربط الحجز بالـCRM'],
      deliverables: ['واجهة أو تدفق حجز', 'تسجيل المواعيد', 'منطق التنبيهات', 'ربط CRM']
    },
    en: {
      label: 'Booking System',
      scope: ['Booking flow', 'Appointment capture', 'Notification logic', 'CRM linkage'],
      deliverables: ['Booking flow', 'Appointment records', 'Notification rules', 'CRM linkage']
    }
  },
  crm: {
    ar: {
      label: 'إدارة علاقات العملاء CRM',
      scope: ['Pipeline للعملاء المحتملين', 'إدارة جهات الاتصال', 'تتبع الفرص', 'الأنشطة والمتابعات'],
      deliverables: ['Lead pipeline', 'Contacts management', 'Opportunity tracking', 'Activity and follow-up workflow']
    },
    en: {
      label: 'CRM',
      scope: ['Lead pipeline', 'Contact management', 'Opportunity tracking', 'Activities and follow-ups'],
      deliverables: ['Lead pipeline', 'Contact records', 'Opportunity tracking', 'Activity and follow-up workflow']
    }
  },
  local_seo: {
    ar: {
      label: 'السيو المحلي',
      scope: ['خطة تحسين Google Business', 'خريطة كلمات محلية', 'تهيئة صفحات محلية', 'توصيات لإدارة التقييمات'],
      deliverables: ['خطة Google Business', 'Local keyword map', 'On-page local SEO plan', 'Review workflow recommendations']
    },
    en: {
      label: 'Local SEO',
      scope: ['Google Business optimization plan', 'Local keyword mapping', 'Local page optimization', 'Review workflow recommendations'],
      deliverables: ['Google Business plan', 'Local keyword map', 'On-page local SEO plan', 'Review recommendations']
    }
  },
  social_media: {
    ar: {
      label: 'إدارة السوشيال ميديا',
      scope: ['إطار المحتوى', 'خطة المنصات', 'Workflow للمراجعة والنشر', 'إطار التحليلات'],
      deliverables: ['Content framework', 'Platform plan', 'Approval-based publishing workflow', 'Analytics framework']
    },
    en: {
      label: 'Social Media',
      scope: ['Content framework', 'Platform plan', 'Approval-based publishing workflow', 'Analytics framework'],
      deliverables: ['Content framework', 'Platform plan', 'Publishing workflow', 'Analytics framework']
    }
  },
  review_management: {
    ar: {
      label: 'إدارة السمعة والتقييمات',
      scope: ['متابعة التقييمات', 'Workflow للردود', 'تصعيد الحالات الحساسة', 'تقارير السمعة'],
      deliverables: ['Review monitoring workflow', 'Response workflow', 'Escalation rules', 'Reputation reporting framework']
    },
    en: {
      label: 'Review Management',
      scope: ['Review monitoring', 'Response workflow', 'Sensitive-case escalation', 'Reputation reporting'],
      deliverables: ['Review monitoring workflow', 'Response workflow', 'Escalation rules', 'Reporting framework']
    }
  },
  lead_generation: {
    ar: {
      label: 'توليد العملاء المحتملين',
      scope: ['تعريف الشرائح المستهدفة', 'قنوات اكتساب مناسبة', 'التقاط العملاء', 'توجيههم إلى CRM'],
      deliverables: ['Target segment plan', 'Lead capture flow', 'CRM routing', 'Measurement framework']
    },
    en: {
      label: 'Lead Generation',
      scope: ['Target segment definition', 'Relevant acquisition channels', 'Lead capture', 'CRM routing'],
      deliverables: ['Targeting plan', 'Lead capture flow', 'CRM routing', 'Measurement framework']
    }
  },
  quote_automation: {
    ar: {
      label: 'أتمتة عروض الأسعار',
      scope: ['هيكلة بيانات العرض', 'Workflow للمراجعة', 'قوالب عرض', 'تتبع حالة العرض'],
      deliverables: ['Quote data model', 'Human-review workflow', 'Proposal templates', 'Status tracking logic']
    },
    en: {
      label: 'Quote Automation',
      scope: ['Quote data structure', 'Human-review workflow', 'Proposal templates', 'Quote status tracking'],
      deliverables: ['Quote data model', 'Review workflow', 'Proposal templates', 'Tracking logic']
    }
  },
  customer_support: {
    ar: {
      label: 'دعم العملاء',
      scope: ['تصنيف طلبات الدعم', 'Workflow للتصعيد', 'توجيه التذاكر', 'قياس زمن الاستجابة'],
      deliverables: ['Support intake flow', 'Escalation rules', 'Routing workflow', 'Service metrics framework']
    },
    en: {
      label: 'Customer Support',
      scope: ['Support request classification', 'Escalation workflow', 'Ticket routing', 'Response-time measurement'],
      deliverables: ['Support intake flow', 'Escalation rules', 'Routing workflow', 'Service metrics framework']
    }
  },
  content_marketing: {
    ar: {
      label: 'تسويق المحتوى',
      scope: ['محاور المحتوى', 'تقويم تحريري', 'مسار مراجعة', 'قياس الأداء'],
      deliverables: ['Content pillars', 'Editorial calendar framework', 'Review workflow', 'Performance framework']
    },
    en: {
      label: 'Content Marketing',
      scope: ['Content pillars', 'Editorial planning', 'Review workflow', 'Performance measurement'],
      deliverables: ['Content pillars', 'Editorial calendar framework', 'Review workflow', 'Performance framework']
    }
  },
  ai_agent: {
    ar: {
      label: 'وكيل ذكاء اصطناعي',
      scope: ['تعريف مهام الوكيل', 'قواعد التصعيد البشري', 'ربط مصادر البيانات المصرح بها', 'سجل الأنشطة'],
      deliverables: ['Agent workflow', 'Human handoff rules', 'Approved data integrations', 'Activity logging']
    },
    en: {
      label: 'AI Agent',
      scope: ['Agent task definition', 'Human escalation rules', 'Approved data integrations', 'Activity logging'],
      deliverables: ['Agent workflow', 'Human handoff rules', 'Approved integrations', 'Activity logging']
    }
  }
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function langOf(options = {}) {
  return options.language === 'en' ? 'en' : 'ar';
}

function getInbox(input = {}) {
  return input.inbox_analysis || input.inboxAnalysis || {};
}

function getIntent(input = {}) {
  return String(input.intent || getInbox(input).intent || input.lead?.custom_fields?.detected_intent || 'general_question').toLowerCase();
}

function getVertical(input = {}) {
  const id = input.enrichment?.vertical?.id || input.lead?.industry || getInbox(input).industry || 'general';
  const config = VERTICALS[id] || VERTICALS.general;
  return { id: config.id || id, config };
}

function requestedServices(input = {}) {
  const inbox = getInbox(input);
  return [...new Set([
    ...(Array.isArray(inbox.service_interest) ? inbox.service_interest : []),
    ...(Array.isArray(input.service_interest) ? input.service_interest : []),
    ...(Array.isArray(input.lead?.custom_fields?.service_interest) ? input.lead.custom_fields.service_interest : [])
  ].filter(Boolean))];
}

function recommendedServices(input = {}) {
  return [...new Set([
    ...(input.enrichment?.services?.primary || []),
    ...(input.enrichment?.services?.secondary || [])
  ].filter(Boolean))];
}

function allServices(input = {}) {
  const requested = requestedServices(input);
  return [...new Set([...requested, ...recommendedServices(input)])];
}

function getQualification(input = {}) {
  const inbox = getInbox(input);
  return {
    ...(input.lead?.custom_fields?.qualification || {}),
    ...(inbox.qualification || {}),
    ...(input.qualification || {})
  };
}

function contactName(input = {}) {
  return input.contact?.full_name || input.contact?.name || getInbox(input).contact?.name || input.lead?.contact_name || null;
}

function clientName(input = {}) {
  return input.company?.name || input.lead?.company_name || contactName(input) || null;
}

function hasContactMethod(input = {}) {
  const inbox = getInbox(input);
  const lead = input.lead || {};
  return Boolean(
    input.contact?.phone || input.contact?.email ||
    inbox.contact?.phone || inbox.contact?.email ||
    lead.phone || lead.whatsapp || lead.email
  );
}

function serviceSource(service, input = {}) {
  if (requestedServices(input).includes(service)) return 'customer_request';
  if (recommendedServices(input).includes(service)) return 'vertical_recommendation';
  return 'crm_data';
}

function t(lang, ar, en) {
  return lang === 'en' ? en : ar;
}

export function evaluateProposalReadiness(input = {}) {
  const intent = getIntent(input);
  if (BLOCKED_INTENTS.has(intent)) {
    return { ready: false, score: 0, missing: [], blocking: ['non_sales_intent'], reason: 'non_sales_intent' };
  }
  if (!SALES_INTENTS.has(intent)) {
    return { ready: false, score: 10, missing: ['sales_intent'], blocking: ['sales_intent'], reason: 'insufficient_sales_intent' };
  }

  const vertical = getVertical(input);
  const services = allServices(input);
  const q = getQualification(input);
  const missing = [];
  const blocking = [];
  let score = 0;

  if (vertical.id !== 'general') score += 15;
  else { missing.push('industry'); }

  if (services.length) score += 30;
  else { missing.push('project_scope'); blocking.push('project_scope'); }

  if (q.timeline) score += 20;
  else missing.push('timeline');

  if (q.budget || input.confirmed_pricing) score += 15;
  else missing.push('budget');

  if (q.decision_maker === true) score += 10;
  else missing.push('decision_maker');

  if (hasContactMethod(input)) score += 10;
  else missing.push('contact_method');

  score = Math.min(100, score);
  return {
    ready: blocking.length === 0 && score >= 70,
    score,
    missing: [...new Set(missing)],
    blocking: [...new Set(blocking)],
    reason: blocking.length ? 'blocking_information_missing' : score >= 70 ? 'ready_for_draft' : 'qualification_incomplete'
  };
}

export function buildProposalScope(input = {}, options = {}) {
  const lang = langOf(options);
  return allServices(input).map(service => {
    const catalog = SERVICE_CATALOG[service]?.[lang];
    if (!catalog) {
      return {
        service,
        label: service,
        source: serviceSource(service, input),
        items: [{ item: service, status: 'needs_confirmation' }]
      };
    }
    return {
      service,
      label: catalog.label,
      source: serviceSource(service, input),
      items: catalog.scope.map(item => ({ item, status: 'proposed' }))
    };
  });
}

export function buildDeliverables(input = {}, options = {}) {
  const lang = langOf(options);
  return allServices(input).map(service => {
    const catalog = SERVICE_CATALOG[service]?.[lang];
    return {
      service,
      source: serviceSource(service, input),
      deliverables: catalog ? [...catalog.deliverables] : [t(lang, 'المخرجات تحتاج تأكيد', 'Deliverables require confirmation')]
    };
  });
}

export function buildObjectives(input = {}, options = {}) {
  const lang = langOf(options);
  const services = allServices(input);
  const out = [];
  const add = (objective, source, confidence) => {
    if (!out.some(x => x.objective === objective)) out.push({ objective, source, confidence });
  };

  for (const service of services) {
    const source = serviceSource(service, input);
    if (service === 'website') add(t(lang, 'إنشاء حضور رقمي احترافي يسهّل وصول العملاء للمعلومات والتواصل.', 'Create a professional digital presence that makes information and contact easier for customers.'), source, source === 'customer_request' ? 0.95 : 0.75);
    if (service === 'booking_system') add(t(lang, 'تبسيط رحلة الحجز وتنظيم تسجيل المواعيد.', 'Simplify the booking journey and organize appointment capture.'), source, source === 'customer_request' ? 0.95 : 0.75);
    if (service === 'whatsapp_automation') add(t(lang, 'تقليل العمل اليدوي في استقبال الاستفسارات وتوجيهها مع إبقاء الإرسال الخارجي تحت الموافقة.', 'Reduce manual effort in handling and routing inquiries while keeping outbound messaging approval-controlled.'), source, source === 'customer_request' ? 0.95 : 0.75);
    if (service === 'crm') add(t(lang, 'تنظيم العملاء والفرص والمتابعات في مسار موحد.', 'Organize leads, opportunities, and follow-ups in one pipeline.'), source, source === 'customer_request' ? 0.95 : 0.75);
    if (service === 'local_seo') add(t(lang, 'تحسين قابلية الظهور في البحث المحلي بناءً على خطة قابلة للقياس.', 'Improve local search visibility through a measurable optimization plan.'), source, 0.75);
    if (service === 'review_management') add(t(lang, 'تنظيم متابعة التقييمات والردود وحالات التصعيد.', 'Organize review monitoring, responses, and escalation cases.'), source, 0.75);
    if (service === 'social_media') add(t(lang, 'إنشاء إطار منظم للمحتوى والنشر والتحليلات.', 'Create a structured framework for content, publishing, and analytics.'), source, 0.75);
    if (service === 'lead_generation') add(t(lang, 'بناء مسار واضح لالتقاط العملاء المحتملين وتوجيههم للـCRM.', 'Build a clear lead-capture and CRM-routing flow.'), source, 0.75);
    if (service === 'ecommerce') add(t(lang, 'إنشاء رحلة رقمية منظمة لعرض المنتجات واستقبال الطلبات.', 'Create an organized digital journey for product discovery and order capture.'), source, 0.75);
  }
  return out;
}

export function buildImplementationPhases(input = {}, options = {}) {
  const lang = langOf(options);
  const names = lang === 'en'
    ? ['Discovery', 'Setup', 'Implementation', 'Integration', 'Testing', 'Launch', 'Optimization']
    : ['الاستكشاف', 'الإعداد', 'التنفيذ', 'الربط', 'الاختبار', 'الإطلاق', 'التحسين'];
  return names.map((name, index) => ({ order: index + 1, name, duration: null, status: 'duration_not_assumed' }));
}

export function buildAssumptions(input = {}, options = {}) {
  const lang = langOf(options);
  return [
    { text: t(lang, 'يوفر العميل المواد والبيانات والهوية البصرية المتاحة لديه عند الحاجة.', 'The client provides available content, data, and brand assets when required.'), type: 'assumption' },
    { text: t(lang, 'أي تكامل خارجي يعتمد على توفر الصلاحيات والموافقات اللازمة من مزود الخدمة.', 'Any third-party integration depends on the required provider permissions and approvals being available.'), type: 'assumption' }
  ];
}

export function buildExclusions(input = {}, options = {}) {
  const lang = langOf(options);
  const requested = new Set(allServices(input));
  const exclusions = [
    ['paid_advertising', t(lang, 'ميزانيات الإعلانات المدفوعة غير مشمولة ما لم تتم إضافتها صراحةً للنطاق.', 'Paid media budgets are excluded unless explicitly added to scope.')],
    ['third_party_fees', t(lang, 'رسوم الاشتراكات أو التراخيص الخارجية غير مشمولة ما لم تكن مؤكدة في العرض.', 'Third-party subscription or licensing fees are excluded unless explicitly confirmed in the proposal.')]
  ];
  return exclusions
    .filter(([key]) => !requested.has(key))
    .map(([key, text]) => ({ key, text, status: 'excluded_unless_confirmed' }));
}

export function buildOpenQuestions(input = {}, options = {}) {
  const lang = langOf(options);
  const seen = new Set();
  const questions = [];
  const add = (key, question, source) => {
    if (!key || !question || seen.has(key) || questions.length >= 5) return;
    seen.add(key);
    questions.push({ key, question, source });
  };

  const playbook = input.playbook || {};
  if (playbook.qualification?.next_key && playbook.qualification?.next_question) {
    add(playbook.qualification.next_key, playbook.qualification.next_question, 'sales_playbook');
  }
  for (const item of playbook.qualification?.remaining_questions || []) {
    add(item.key, item.question, 'sales_playbook');
  }

  const labels = {
    budget: t(lang, 'هل توجد ميزانية تقريبية للمشروع؟', 'Is there an approximate project budget?'),
    timeline: t(lang, 'متى ترغبون ببدء المشروع أو إطلاقه؟', 'When would you like to start or launch the project?'),
    decision_maker: t(lang, 'من صاحب القرار النهائي للمشروع؟', 'Who is the final decision maker for the project?'),
    project_scope: t(lang, 'ما النطاق أو الخدمات التي تريدون تضمينها بشكل مؤكد؟', 'Which scope or services should definitely be included?'),
    contact_method: t(lang, 'ما وسيلة التواصل المفضلة للمتابعة؟', 'What is the preferred contact method for follow-up?'),
    industry: t(lang, 'ما نوع النشاط أو القطاع؟', 'What is the business type or industry?')
  };

  for (const key of input.enrichment?.missing?.missing || []) add(key, labels[key] || t(lang, `نحتاج تأكيد: ${key}`, `Please confirm: ${key}`), 'lead_enrichment');
  for (const key of input.playbook?.quote_readiness?.missing || []) add(key, labels[key] || t(lang, `نحتاج تأكيد: ${key}`, `Please confirm: ${key}`), 'quote_readiness');
  for (const key of evaluateProposalReadiness(input).missing || []) add(key, labels[key] || t(lang, `نحتاج تأكيد: ${key}`, `Please confirm: ${key}`), 'proposal_readiness');

  return questions.slice(0, 5);
}

export function buildPricingPlaceholder(input = {}) {
  const confirmed = clone(input.confirmed_pricing);
  if (confirmed) {
    return {
      status: 'confirmed_input',
      currency: confirmed.currency || 'SAR',
      subtotal: confirmed.subtotal ?? null,
      vat: confirmed.vat ?? null,
      total: confirmed.total ?? null,
      line_items: Array.isArray(confirmed.line_items)
        ? confirmed.line_items.map(item => ({
            service: item.service,
            price: item.price ?? null,
            status: item.price == null ? 'pricing_required' : 'confirmed_input'
          }))
        : []
    };
  }

  return {
    status: 'requires_human_pricing',
    currency: 'SAR',
    subtotal: null,
    vat: null,
    total: null,
    line_items: allServices(input).map(service => ({ service, price: null, status: 'pricing_required' }))
  };
}

export function buildTimeline(input = {}) {
  const q = getQualification(input);
  const requested = q.timeline || input.lead?.custom_fields?.timeline || null;
  return requested
    ? { status: 'customer_provided', requested_timeline: requested, duration: null }
    : { status: 'needs_confirmation', requested_timeline: null, duration: null };
}

export function buildProposalSections(input = {}, options = {}) {
  return {
    objectives: buildObjectives(input, options),
    scope: buildProposalScope(input, options),
    deliverables: buildDeliverables(input, options),
    implementation_phases: buildImplementationPhases(input, options),
    assumptions: buildAssumptions(input, options),
    exclusions: buildExclusions(input, options),
    open_questions: buildOpenQuestions(input, options)
  };
}

export function buildProposalSummary(input = {}, options = {}) {
  const lang = langOf(options);
  const vertical = getVertical(input);
  const client = clientName(input);
  const requested = requestedServices(input);
  const services = requested.length ? requested : recommendedServices(input);
  const serviceLabels = services.map(s => SERVICE_CATALOG[s]?.[lang]?.label || s);

  if (lang === 'en') {
    return client
      ? `This draft proposal is prepared for ${client} and focuses on ${serviceLabels.join(', ') || 'the confirmed digital requirements'}. The scope is based only on the available CRM and conversation data and remains subject to human review.`
      : `This draft proposal focuses on ${serviceLabels.join(', ') || 'the confirmed digital requirements'} for the ${vertical.config.name} context. It is based only on the available CRM and conversation data and remains subject to human review.`;
  }

  return client
    ? `تم إعداد مسودة العرض لـ${client} بالاعتماد على الاحتياجات المسجلة، مع التركيز على ${serviceLabels.join('، ') || 'المتطلبات الرقمية المؤكدة'}. النطاق أدناه مبني فقط على بيانات CRM والمحادثة المتاحة ويحتاج مراجعة بشرية قبل الاعتماد.`
    : `تم إعداد مسودة العرض بالاعتماد على الاحتياجات المسجلة لقطاع ${vertical.config.name}، مع التركيز على ${serviceLabels.join('، ') || 'المتطلبات الرقمية المؤكدة'}. النطاق مبني فقط على البيانات المتاحة ويحتاج مراجعة بشرية قبل الاعتماد.`;
}

export function buildProposalDraft(input = {}, options = {}) {
  const safeInput = clone(input);
  const lang = langOf(options);
  const intent = getIntent(safeInput);
  const readiness = evaluateProposalReadiness(safeInput);
  const vertical = getVertical(safeInput);
  const client = clientName(safeInput);
  const blocked = BLOCKED_INTENTS.has(intent);

  let status = 'draft_incomplete';
  if (blocked || readiness.blocking.includes('sales_intent')) status = 'not_ready';
  else if (readiness.ready && readiness.score >= 85) status = 'ready_for_human_review';
  else if (readiness.ready) status = 'draft_ready';

  const sections = buildProposalSections(safeInput, { language: lang });
  const pricing = buildPricingPlaceholder(safeInput);
  const timeline = buildTimeline(safeInput);

  return {
    status,
    readiness,
    language: lang,
    title: t(
      lang,
      `مسودة عرض — ${client || vertical.config.name} (${vertical.config.name})`,
      `Proposal Draft — ${client || vertical.config.name} (${vertical.config.name})`
    ),
    client: {
      name: client,
      contact_name: contactName(safeInput),
      vertical: vertical.id
    },
    executive_summary: buildProposalSummary(safeInput, { language: lang }),
    objectives: sections.objectives,
    recommended_solution: buildProposalScope(safeInput, { language: lang }).map(item => ({
      service: item.service,
      label: item.label,
      source: item.source
    })),
    scope: sections.scope,
    deliverables: sections.deliverables,
    implementation_phases: sections.implementation_phases,
    assumptions: sections.assumptions,
    exclusions: sections.exclusions,
    open_questions: sections.open_questions,
    timeline,
    pricing,
    next_step: blocked
      ? { action: 'no_sales_proposal', requires_approval: true }
      : { action: status === 'draft_incomplete' ? 'collect_missing_information' : 'human_review', requires_approval: true },
    approval: {
      requires_human_review: true,
      can_send: false,
      auto_send: false
    }
  };
}

export default {
  evaluateProposalReadiness,
  buildProposalScope,
  buildProposalSections,
  buildDeliverables,
  buildAssumptions,
  buildExclusions,
  buildOpenQuestions,
  buildPricingPlaceholder,
  buildProposalDraft,
  buildProposalSummary
};
