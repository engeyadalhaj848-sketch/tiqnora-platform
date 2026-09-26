/**
 * Tiqnora V6 — Brand Brain
 * Central brand identity for all content agents. Deterministic defaults from project identity.
 * No invented claims, awards, or customer counts.
 */

export const CONTENT_STATUSES = Object.freeze([
  'idea', 'draft', 'review', 'changes_requested', 'approved',
  'scheduled', 'publishing', 'published', 'failed', 'archived'
]);

export const DEFAULT_TIQNORA_BRAND = Object.freeze({
  brand_name: 'Tiqnora AI',
  brand_description:
    'منصة سعودية لأتمتة النمو بالأعمال: مبيعات، واتساب، محتوى، وذكاء اصطناعي.',
  brand_mission: 'تمكين المنشآت من إدارة النمو عبر فريق AI متعاون مع موافقة بشرية.',
  brand_positioning: 'Premium AI Business Growth OS — تقنية حديثة بهوية Cyber Luxury.',
  target_audience: ['عيادات', 'عقارات', 'مطاعم', 'فنادق', 'خدمات مهنية', 'تجزئة'],
  target_markets: ['Saudi Arabia'],
  target_cities: ['المدينة المنورة'],
  industries: ['clinics', 'dental_clinic', 'real_estate', 'restaurants', 'hotels', 'salons', 'retail', 'professional_services'],
  tone_of_voice: ['premium', 'modern', 'professional', 'clear', 'confident'],
  writing_style: 'عربي تجاري واضح، مختصر، بدون مبالغة أو ضمانات وهمية.',
  preferred_language: 'ar',
  secondary_language: 'en',
  approved_claims: [
    'منصة Tiqnora AI لإدارة نمو الأعمال',
    'دعم أتمتة واتساب والمبيعات والمحتوى',
    'موافقة بشرية قبل أي إرسال خارجي'
  ],
  restricted_claims: [
    'رقم 1',
    'الأفضل في المملكة',
    'نضمن نتائج',
    'زيادة المبيعات 300%',
    'آلاف العملاء',
    'شهادات وهمية',
    'ROI مضمون'
  ],
  banned_phrases: ['保证', 'guaranteed million', 'get rich', 'بدون جهد'],
  services: [
    'website',
    'whatsapp_automation',
    'booking_system',
    'crm',
    'local_seo',
    'social_media',
    'ai_agents'
  ],
  value_propositions: [
    'دورة نمو مترابطة من Lead إلى محتوى وتحليل',
    'وكلاء AI مع بوابة موافقة بشرية',
    'هوية بصرية وتقنية موحّدة'
  ],
  proof_points: [], // empty — do not invent
  cta_library: [
    { id: 'discuss', ar: 'ناقش مشروعك', en: 'Discuss your project' },
    { id: 'quote', ar: 'اطلب عرض سعر مخصص', en: 'Request a custom quote' },
    { id: 'demo', ar: 'احجز استشارة', en: 'Book a consultation' },
    { id: 'learn', ar: 'اعرف أكثر', en: 'Learn more' }
  ],
  hashtags: ['#Tiqnora', '#TiqnoraAI', '#أتمتة', '#ذكاء_اصطناعي', '#السعودية'],
  keywords: ['أتمتة واتساب', 'نمو الأعمال', 'CRM', 'محتوى', 'عيادات', 'المدينة المنورة'],
  visual_identity: {
    colors: {
      electric_blue: '#0A5CFF',
      cyber_cyan: '#00D2FF',
      midnight_navy: '#060B1E',
      pure_white: '#FFFFFF'
    },
    style: ['premium', 'modern', 'AI', 'cyber luxury', 'clean', 'professional'],
    logo_usage: 'استخدم شعار Tiqnora بوضوح على خلفية داكنة أو بيضاء نظيفة.',
    image_style: 'إضاءة تقنية، تدرجات أزرق/سماوي، مساحات نظيفة، بدون فوضى.',
    video_style: 'مقاطع قصيرة، Hook سريع، نصوص واضحة، هوية داكنة مع لمسات cyan.'
  },
  do: [
    'استخدم ألوان الهوية',
    'ركّز على فائدة واضحة للعميل',
    'أضف CTA موافق عليه',
    'حافظ على نبرة احترافية'
  ],
  dont: [
    'لا تخترع أرقام عملاء أو جوائز',
    'لا تضمن نتائج مالية',
    'لا تنشر بدون موافقة بشرية',
    'لا تستخدم ادّعاءات "الأفضل/رقم 1" غير الموثقة'
  ],
  legal_notes: [
    'المحتوى التسويقي يخضع لموافقة بشرية قبل النشر',
    'لا تُدرج بيانات عملاء حقيقيين في أمثلة عامة'
  ]
});

export function getDefaultBrandProfile() {
  return JSON.parse(JSON.stringify(DEFAULT_TIQNORA_BRAND));
}

/**
 * Merge stored profile over defaults (shallow + nested visual_identity).
 */
export function buildBrandProfile(stored = {}) {
  const base = getDefaultBrandProfile();
  const p = stored?.profile && typeof stored.profile === 'object' ? stored.profile : stored;
  const out = { ...base, ...p };
  out.visual_identity = {
    ...base.visual_identity,
    ...(p.visual_identity || {}),
    colors: {
      ...base.visual_identity.colors,
      ...(p.visual_identity?.colors || {})
    }
  };
  out.cta_library = Array.isArray(p.cta_library) && p.cta_library.length ? p.cta_library : base.cta_library;
  out.restricted_claims = Array.isArray(p.restricted_claims) ? p.restricted_claims : base.restricted_claims;
  out.approved_claims = Array.isArray(p.approved_claims) ? p.approved_claims : base.approved_claims;
  out.brand_name = out.brand_name || base.brand_name;
  return out;
}

export function buildBrandContext(profileInput = {}, options = {}) {
  const brand = buildBrandProfile(profileInput);
  const lang = options.language || brand.preferred_language || 'ar';
  return {
    brand_name: brand.brand_name,
    language: lang,
    tone: brand.tone_of_voice,
    writing_style: brand.writing_style,
    audience: brand.target_audience,
    cities: brand.target_cities,
    markets: brand.target_markets,
    services: brand.services,
    value_propositions: brand.value_propositions,
    approved_claims: brand.approved_claims,
    restricted_claims: brand.restricted_claims,
    banned_phrases: brand.banned_phrases,
    ctas: brand.cta_library,
    hashtags: brand.hashtags,
    keywords: brand.keywords,
    colors: brand.visual_identity?.colors,
    visual_style: brand.visual_identity?.style,
    do: brand.do,
    dont: brand.dont,
    legal_notes: brand.legal_notes
  };
}

export function getApprovedCTA(profileInput = {}, idOrLang = 'ar') {
  const brand = buildBrandProfile(profileInput);
  const list = brand.cta_library || [];
  if (typeof idOrLang === 'string' && ['ar', 'en'].includes(idOrLang)) {
    const first = list[0];
    return first ? first[idOrLang] || first.ar || first.en : null;
  }
  const found = list.find((c) => c.id === idOrLang);
  return found || list[0] || null;
}

export function getChannelGuidelines(platform = 'instagram') {
  const p = String(platform || '').toLowerCase();
  const map = {
    instagram: { style: 'visual_concise', max_hashtags: 8, notes: 'نص مختصر + بصري قوي + هاشتاقات محدودة' },
    facebook: { style: 'conversational', max_hashtags: 3, notes: 'أسلوب حواري أوضح' },
    linkedin: { style: 'professional_insight', max_hashtags: 3, notes: 'مهني / رؤى عملية' },
    tiktok: { style: 'hook_first', max_hashtags: 5, notes: 'Hook أول ثانيتين + فكرة فيديو قصيرة' },
    whatsapp: { style: 'short_personal', max_hashtags: 0, notes: 'رسالة قصيرة وشخصية — ليست بثًا تلقائيًا' },
    telegram: { style: 'informative', max_hashtags: 2, notes: 'مختصر ومعلوماتي' }
  };
  return map[p] || { style: 'professional', max_hashtags: 5, notes: 'افتراضي احترافي' };
}

/**
 * Validate content against brand rules (deterministic).
 */
export function validateBrandContent(text, profileInput = {}, options = {}) {
  const brand = buildBrandProfile(profileInput);
  const body = String(text || '');
  const warnings = [];
  const flags = [];

  for (const claim of brand.restricted_claims || []) {
    if (claim && body.includes(claim)) {
      flags.push({ type: 'restricted_claim', value: claim });
      warnings.push(`ادّعاء مقيد: ${claim}`);
    }
  }
  for (const phrase of brand.banned_phrases || []) {
    if (phrase && body.toLowerCase().includes(String(phrase).toLowerCase())) {
      flags.push({ type: 'banned_phrase', value: phrase });
      warnings.push(`عبارة غير مسموحة: ${phrase}`);
    }
  }

  // Pattern guards — invented social proof / guarantees
  const risky = [
    /\b\d{2,}\s*%\s*(زيادة|نمو|ROI|مبيعات)/i,
    /نضمن|ضمان\s*النتائج|رقم\s*1|الأفضل\s*في/i,
    /\b\d{3,}\s*(عميل|عملاء|customer)/i
  ];
  for (const re of risky) {
    if (re.test(body)) {
      flags.push({ type: 'unverified_metric_or_guarantee', value: re.toString() });
      warnings.push('صيغة قد تتضمن رقمًا أو ضمانًا غير موثق');
    }
  }

  const hasCta = (brand.cta_library || []).some((c) => {
    const ar = c.ar || '';
    const en = c.en || '';
    return (ar && body.includes(ar)) || (en && body.includes(en));
  }) || /اطلب|احجز|تواصل|discuss|book|quote/i.test(body);

  if (options.require_cta && !hasCta) {
    warnings.push('لا يوجد CTA واضح');
  }

  const toneHints = brand.tone_of_voice || [];
  const tone_match = toneHints.length
    ? true // soft: we don't NLP-score; structural only
    : true;

  return {
    ok: flags.length === 0,
    warnings,
    flags,
    tone_match,
    missing_cta: options.require_cta ? !hasCta : false,
    restricted_hit: flags.some((f) => f.type === 'restricted_claim'),
    brand_name: brand.brand_name
  };
}

export function checkRestrictedClaims(text, profileInput = {}) {
  return validateBrandContent(text, profileInput).flags.filter((f) => f.type === 'restricted_claim');
}

export default {
  CONTENT_STATUSES,
  DEFAULT_TIQNORA_BRAND,
  getDefaultBrandProfile,
  buildBrandProfile,
  buildBrandContext,
  getApprovedCTA,
  getChannelGuidelines,
  validateBrandContent,
  checkRestrictedClaims
};
