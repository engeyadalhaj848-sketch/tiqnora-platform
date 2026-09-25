/**
 * Keyword / intent map + content opportunities (no fake search volumes).
 */

import { CANONICAL_BRAND } from './core.js';

export const DEFAULT_KEYWORDS = Object.freeze([
  { keyword: 'Tiqnora AI', intent: 'brand', category: 'brand', target_page: '/' },
  { keyword: 'تيقنورا', intent: 'brand', category: 'brand', target_page: '/' },
  { keyword: 'وكلاء ذكاء اصطناعي للشركات', intent: 'commercial', category: 'service', target_page: '/services/ai-agents' },
  { keyword: 'أتمتة واتساب للشركات', intent: 'commercial', category: 'service', target_page: '/services/social-automation' },
  { keyword: 'تصميم مواقع المدينة المنورة', intent: 'local', category: 'local', location: 'المدينة المنورة', target_page: '/services/web-design' },
  { keyword: 'تصميم مواقع', intent: 'commercial', category: 'service', target_page: '/services/web-design' },
  { keyword: 'أتمتة السوشيال ميديا بالذكاء الاصطناعي', intent: 'commercial', category: 'service', target_page: '/services/social-automation' },
  { keyword: 'CRM للشركات', intent: 'commercial', category: 'service', target_page: '/' },
  { keyword: 'حلول تقنية للعيادات', intent: 'commercial', category: 'industry', target_page: null, status: 'content_gap' },
  { keyword: 'حلول تقنية للعقارات', intent: 'commercial', category: 'industry', target_page: null, status: 'content_gap' }
]);

export function buildKeywordMap(extra = []) {
  const base = DEFAULT_KEYWORDS.map((k) => ({
    ...k,
    location: k.location || (k.intent === 'local' ? CANONICAL_BRAND.city : null),
    status: k.status || (k.target_page ? 'mapped' : 'content_gap'),
    volume: null // never invent
  }));
  const more = (Array.isArray(extra) ? extra : []).map((k) => ({
    keyword: k.keyword,
    intent: k.intent || 'informational',
    category: k.category || 'general',
    location: k.location || null,
    target_page: k.target_page || null,
    status: k.status || (k.target_page ? 'mapped' : 'content_gap'),
    volume: null
  }));
  return [...base, ...more];
}

export function detectCannibalization(keywords = buildKeywordMap()) {
  const byPage = {};
  for (const k of keywords) {
    if (!k.target_page) continue;
    byPage[k.target_page] = byPage[k.target_page] || [];
    byPage[k.target_page].push(k.keyword);
  }
  // Same normalized topic competing on multiple pages
  const topicMap = {};
  for (const k of keywords) {
    const topic = String(k.keyword)
      .replace(/المدينة المنورة|للشركات|في السعودية/g, '')
      .trim();
    if (!topic) continue;
    topicMap[topic] = topicMap[topic] || new Set();
    if (k.target_page) topicMap[topic].add(k.target_page);
  }
  const conflicts = [];
  for (const [topic, pages] of Object.entries(topicMap)) {
    if (pages.size > 1) {
      conflicts.push({
        topic,
        pages: [...pages],
        recommendation: 'differentiate_or_canonical',
        action: 'Do not delete automatically — review intent and internal linking'
      });
    }
  }
  return { by_page: byPage, conflicts };
}

export function generateContentOpportunities(options = {}) {
  const industries = options.industries || ['عيادات', 'عقارات', 'مطاعم'];
  const city = options.city || CANONICAL_BRAND.city;
  const opportunities = [
    {
      title: `دليل أتمتة واتساب لـ${industries[0]} في ${city}`,
      primary_topic: 'whatsapp_automation',
      search_intent: 'commercial',
      target_audience: industries[0],
      local_context: city,
      recommended_title: `أتمتة واتساب لـ${industries[0]} في ${city}`,
      outline: ['ما هي أتمتة واتساب', 'حالات استخدام', 'كيف تعمل مع الموافقة البشرية', 'خطوات البدء', 'FAQ'],
      internal_links: ['/services/social-automation', '/services/ai-agents', '/about'],
      entities: ['Tiqnora AI', 'WhatsApp', city],
      CTA: 'اطلب عرض سعر مخصص',
      sources_needed: ['وصف خدمة حقيقي من الموقع'],
      status: 'idea',
      requires_approval: true
    },
    {
      title: `تصميم مواقع احترافي لقطاع ${industries[1] || 'الأعمال'}`,
      primary_topic: 'web_design',
      search_intent: 'commercial',
      target_audience: industries[1] || 'أعمال',
      local_context: city,
      recommended_title: `تصميم مواقع لـ${industries[1] || 'الشركات'} — ${city}`,
      outline: ['لماذا الموقع مهم', 'عناصر الموقع الفعال', 'ربط مع واتساب/حجز', 'الأخطاء الشائعة', 'الخطوة التالية'],
      internal_links: ['/services/web-design', '/shop'],
      entities: ['Tiqnora AI', city],
      CTA: 'ناقش مشروعك',
      sources_needed: [],
      status: 'idea',
      requires_approval: true
    },
    {
      title: `ما هي Tiqnora AI؟ شرح واضح للكيان والعلامة`,
      primary_topic: 'brand_entity',
      search_intent: 'informational',
      target_audience: 'صناع قرار',
      local_context: 'السعودية',
      recommended_title: 'ما هي Tiqnora AI؟',
      outline: ['تعريف مختصر', 'الخدمات', 'لمن', 'أين نعمل', 'كيف نختلف (موافقة بشرية)'],
      internal_links: ['/about', '/'],
      entities: ['Tiqnora AI', 'تيقنورا'],
      CTA: 'اعرف أكثر',
      sources_needed: ['About page facts only'],
      status: 'idea',
      requires_approval: true
    }
  ];
  return opportunities.slice(0, options.count || 3);
}

export default {
  DEFAULT_KEYWORDS,
  buildKeywordMap,
  detectCannibalization,
  generateContentOpportunities
};
