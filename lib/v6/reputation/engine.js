/**
 * Tiqnora V6 — Reputation Management Engine
 * Normalize → analyze → draft reply → Brand Brain → approval gate → mock/live publish.
 * auto_reply always false.
 */

import { validateBrandContent, buildBrandProfile, getDefaultBrandProfile } from '../brand-brain.js';
import {
  mapLocationToRecord,
  mapReviewToRecord,
  listReviews,
  updateReviewReply,
  isGbpConfigured,
  connectionStatusFromToken
} from './providers/google-business-profile.js';
export { isGbpConfigured };

const TOPIC_KEYWORDS = Object.freeze({
  customer_service: ['خدمة', 'موظفين', 'تعامل', 'service', 'staff', 'rude', 'helpful'],
  speed: ['تأخير', 'بطيء', 'سريع', 'انتظار', 'slow', 'wait', 'delay', 'fast'],
  quality: ['جودة', 'ممتاز', 'سيء', 'quality', 'excellent', 'poor'],
  price: ['سعر', 'غالي', 'رخيص', 'price', 'expensive', 'cheap'],
  cleanliness: ['نظافة', 'وسخ', 'clean', 'dirty', 'hygiene'],
  booking: ['حجز', 'موعد', 'booking', 'appointment', 'schedule'],
  support: ['دعم', 'support', 'help', 'helpdesk']
});

const PRIVACY_PATTERNS = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
  /\b(?:\+?\d{1,3}[\s-]?)?(?:\d{2,4}[\s-]?){2,4}\d{2,4}\b/,
  /\b(?:MRN|file\s*#|order\s*#|طلب\s*رقم)\s*[:#]?\s*\w+/i
];

const CLAIM_PATTERNS = [
  /استرجاع|تعويض|refund|compensate/i,
  /نعدك|نضمن|guarantee/i,
  /سنخصم|خصم\s*\d+/i,
  /موعدك\s*يوم|appointment\s+on/i
];

export function analyzeReview(review = {}) {
  const comment = String(review.comment || '').trim();
  const rating = review.rating != null ? Number(review.rating) : null;
  const hasText = comment.length > 0;

  let sentiment = 'unknown';
  if (hasText) {
    const neg = /سيء|سيئ|سيئة|فظيع|مريع|سيئه|تأخير|تأخر|lazy|terrible|awful|worst|never|horrible|disappoint|bad\b|poor\b/i.test(comment);
    const pos = /ممتاز|رائع|جيد|جيدة|شكرا|شكراً|excellent|great|amazing|love|thank|good\b/i.test(comment);
    if (neg && !pos) sentiment = 'negative';
    else if (pos && !neg) sentiment = 'positive';
    else if (pos && neg) sentiment = 'mixed';
    else sentiment = 'neutral';
  } else if (rating != null) {
    // Rating-only: explicit, not detailed NLP
    if (rating <= 2) sentiment = 'negative_rating_only';
    else if (rating >= 4) sentiment = 'positive_rating_only';
    else sentiment = 'neutral_rating_only';
  }

  const topics = [];
  if (hasText) {
    const lower = comment.toLowerCase();
    for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
      if (kws.some((k) => lower.includes(String(k).toLowerCase()) || comment.includes(k))) {
        topics.push(topic);
      }
    }
  }

  let priority = 'normal';
  const criticalHints = /سلامة|خطر|تسمم|اعتداء|قانون|محامي|safety|poison|assault|lawyer|sue/i.test(comment);
  if (criticalHints) priority = 'critical';
  else if (rating != null && rating <= 2) priority = 'high';
  else if (sentiment === 'negative' || sentiment === 'negative_rating_only') priority = 'high';
  else if (rating === 3) priority = 'normal';
  else if (rating != null && rating >= 4) priority = 'low';

  return {
    sentiment,
    topics,
    priority,
    response_needed: priority === 'critical' || priority === 'high' || !review.existing_reply,
    complaint_type: topics[0] || (sentiment.startsWith('negative') ? 'general_complaint' : null),
    service_area: topics.includes('booking') ? 'booking' : topics[0] || null,
    suggested_action: priority === 'critical' ? 'human_escalation' : 'draft_reply',
    has_text: hasText,
    rating_signal: rating
  };
}

export function detectLanguage(text = '') {
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[A-Za-z]/.test(text)) return 'en';
  return 'ar';
}

export function privacyGuard(replyText = '') {
  const warnings = [];
  for (const re of PRIVACY_PATTERNS) {
    if (re.test(replyText)) warnings.push('possible_private_data_in_reply');
  }
  return { ok: warnings.length === 0, warnings };
}

export function claimsGuard(replyText = {}) {
  const text = typeof replyText === 'string' ? replyText : '';
  const warnings = [];
  for (const re of CLAIM_PATTERNS) {
    if (re.test(text)) warnings.push('operational_or_financial_promise');
  }
  return { ok: warnings.length === 0, warnings };
}

/**
 * Deterministic reply draft (no invented refunds/appointments).
 */
export function generateReviewReplyDraft(review = {}, location = {}, brandProfile = {}, options = {}) {
  const brand = buildBrandProfile(brandProfile || getDefaultBrandProfile());
  const analysis = review.analysis || analyzeReview(review);
  const lang =
    options.language ||
    (review.comment ? detectLanguage(review.comment) : brand.preferred_language || 'ar');
  const name = review.reviewer_display_name && review.reviewer_display_name !== 'Anonymous'
    ? review.reviewer_display_name
    : null;
  const locTitle = location.title || location.name || brand.brand_name;

  let draft;
  if (lang === 'en') {
    if (analysis.sentiment?.startsWith('positive')) {
      draft = `Thank you${name ? `, ${name}` : ''} for your feedback about ${locTitle}. We appreciate you taking the time to share your experience.`;
    } else if (analysis.priority === 'critical' || analysis.priority === 'high') {
      draft = `Thank you${name ? `, ${name}` : ''} for bringing this to our attention. We take your feedback seriously and would like to understand the details further through a private channel. Please contact us directly so our team can help.`;
    } else {
      draft = `Thank you${name ? `, ${name}` : ''} for your review. We value your feedback and continuously work to improve the experience at ${locTitle}.`;
    }
  } else {
    if (analysis.sentiment?.startsWith('positive')) {
      draft = `شكرًا${name ? ` ${name}` : ''} على تقييمكم لـ ${locTitle}. نسعد بسماع تجربتكم ونتطلع لخدمتكم دائمًا.`;
    } else if (analysis.priority === 'critical' || analysis.priority === 'high') {
      draft = `شكرًا${name ? ` ${name}` : ''} على ملاحظاتكم. نأخذ ملاحظاتكم بجدية ونفضّل استكمال التفاصيل عبر قناة خاصة لحماية خصوصيتكم. يرجى التواصل معنا مباشرة لنتمكن من المساعدة.`;
    } else {
      draft = `شكرًا${name ? ` ${name}` : ''} على تقييمكم. نقدر ملاحظاتكم ونسعى لتحسين التجربة في ${locTitle}.`;
    }
  }

  const brandVal = validateBrandContent(draft, brand, { require_cta: false });
  const priv = privacyGuard(draft);
  const claims = claimsGuard(draft);
  const warnings = [
    ...brandVal.warnings,
    ...priv.warnings,
    ...claims.warnings
  ];

  if (analysis.priority === 'critical') {
    warnings.push('critical_review_requires_human_judgment');
  }

  return {
    draft_reply: draft,
    language: lang,
    tone: analysis.sentiment?.startsWith('positive') ? 'grateful' : 'empathetic_professional',
    reasoning_summary: `Priority=${analysis.priority}; sentiment=${analysis.sentiment}; topics=${(analysis.topics || []).join(',') || 'none'}`,
    warnings,
    brand_validation: brandVal,
    privacy_ok: priv.ok,
    claims_ok: claims.ok,
    analysis,
    requires_approval: true,
    auto_reply: false,
    status: 'draft'
  };
}

export function canPublishReply(draft = {}, review = {}) {
  const reasons = [];
  if (draft.auto_reply === true) reasons.push('auto_reply_forbidden');
  if (draft.status !== 'approved' && draft.status !== 'pending_approval') {
    // pending_approval still cannot publish until approved
  }
  if (draft.status !== 'approved') reasons.push('human_approval_required');
  if (!draft.draft_reply || !String(draft.draft_reply).trim()) reasons.push('empty_reply');
  if (draft.privacy_ok === false) reasons.push('privacy_guard');
  if (draft.claims_ok === false) reasons.push('claims_guard');
  return {
    ok: reasons.length === 0,
    reasons,
    auto_reply: false
  };
}

export function approveReplyDraft(draft = {}, approver = null) {
  return {
    ...draft,
    status: 'approved',
    approved_by: approver,
    approved_at: new Date().toISOString(),
    requires_approval: false,
    auto_reply: false
  };
}

export function submitReplyForApproval(draft = {}) {
  return {
    ...draft,
    status: 'pending_approval',
    requires_approval: true,
    auto_reply: false,
    submitted_at: new Date().toISOString()
  };
}

/** Mock publish — never hits Google unless caller passes live publish fn */
export async function publishReply(draft, review, options = {}) {
  const gate = canPublishReply(draft, review);
  if (!gate.ok) {
    return { ok: false, ...gate, live: false };
  }
  if (options.live && options.accessToken && review.resource_name) {
    const resp = await updateReviewReply(options.accessToken, review.resource_name, draft.draft_reply, {
      fetchImpl: options.fetchImpl
    });
    return {
      ok: true,
      live: true,
      external_reply: draft.draft_reply,
      published_at: new Date().toISOString(),
      provider_response: resp,
      auto_reply: false
    };
  }
  return {
    ok: true,
    live: false,
    mock: true,
    external_reply: draft.draft_reply,
    published_at: new Date().toISOString(),
    provider_response: { mock: true },
    auto_reply: false
  };
}

export function buildReputationDashboard(reviews = [], locations = []) {
  const list = Array.isArray(reviews) ? reviews : [];
  const ratings = list.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const unanswered = list.filter((r) => r.reply_status === 'unanswered' || (!r.existing_reply && r.reply_status !== 'answered'));
  const negative = list.filter((r) => Number(r.rating) <= 2 || String(r.sentiment || '').startsWith('negative'));
  const positive = list.filter((r) => Number(r.rating) >= 4 || String(r.sentiment || '').startsWith('positive'));
  const pending = list.filter((r) => r.reply_status === 'pending_approval');

  return {
    location_count: Array.isArray(locations) ? locations.length : 0,
    review_count: list.length,
    average_rating: avg != null ? Number(avg.toFixed(2)) : null,
    unanswered_reviews: unanswered.length,
    negative_reviews: negative.length,
    positive_reviews: positive.length,
    pending_approval: pending.length,
    response_rate:
      list.length === 0 ? null : Number((((list.length - unanswered.length) / list.length) * 100).toFixed(1)),
    new_reviews: list.filter((r) => {
      if (!r.created_at_external) return false;
      const t = new Date(r.created_at_external).getTime();
      return Date.now() - t < 7 * 86400000;
    }).length
  };
}

export function buildReputationInsights(reviews = [], options = {}) {
  const list = Array.isArray(reviews) ? reviews : [];
  const periodDays = options.period_days || 30;
  const since = Date.now() - periodDays * 86400000;
  const recent = list.filter((r) => {
    const t = r.created_at_external ? new Date(r.created_at_external).getTime() : 0;
    return t >= since;
  });
  if (recent.length < 3) {
    return { ok: false, insights: [], message: 'بيانات غير كافية لإنتاج رؤى موثوقة' };
  }

  const topicCounts = {};
  for (const r of recent) {
    const topics = r.topics || r.analysis?.topics || [];
    for (const t of topics) {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    }
  }
  const insights = [];
  for (const [topic, count] of Object.entries(topicCounts)) {
    if (count >= 2) {
      insights.push({
        type: 'repeated_topic',
        topic,
        evidence_count: count,
        period_days: periodDays,
        affected_locations: [
          ...new Set(recent.filter((r) => (r.topics || r.analysis?.topics || []).includes(topic)).map((r) => r.location_id).filter(Boolean))
        ],
        evidence_strength: count >= 5 ? 'high' : 'moderate',
        summary_ar: `تكرار موضوع «${topic}» في ${count} مراجعة خلال ${periodDays} يومًا.`
      });
    }
  }

  const neg = recent.filter((r) => Number(r.rating) <= 2);
  if (neg.length >= 2) {
    insights.push({
      type: 'negative_cluster',
      evidence_count: neg.length,
      period_days: periodDays,
      affected_locations: [...new Set(neg.map((r) => r.location_id).filter(Boolean))],
      evidence_strength: neg.length >= 4 ? 'high' : 'moderate',
      summary_ar: `${neg.length} مراجعات بتقييم منخفض خلال ${periodDays} يومًا.`
    });
  }

  return {
    ok: insights.length > 0,
    insights,
    recommendation_only: true,
    auto_apply: false
  };
}

/** Offline sync helper: normalize API reviews into upsertable rows */
export function normalizeReviewsFromApi(apiReviews = [], location = {}) {
  return (Array.isArray(apiReviews) ? apiReviews : []).map((r) => {
    const mapped = mapReviewToRecord(r, location);
    const analysis = analyzeReview(mapped);
    return {
      ...mapped,
      location_id: location.id || null,
      sentiment: analysis.sentiment,
      topics: analysis.topics,
      priority: analysis.priority,
      analysis,
      resource_name: mapped.resource_name
    };
  });
}

export function dedupeKey(provider, externalReviewId) {
  return `${provider}::${externalReviewId}`;
}

export function mergeReviewRows(existing = [], incoming = []) {
  const map = new Map();
  for (const row of existing) {
    map.set(dedupeKey(row.provider, row.external_review_id), { ...row });
  }
  for (const row of incoming) {
    const k = dedupeKey(row.provider, row.external_review_id);
    if (map.has(k)) {
      map.set(k, { ...map.get(k), ...row, id: map.get(k).id });
    } else {
      map.set(k, row);
    }
  }
  return [...map.values()];
}

export function connectionStatus(tokenRow) {
  return connectionStatusFromToken(tokenRow);
}

export default {
  analyzeReview,
  detectLanguage,
  privacyGuard,
  claimsGuard,
  generateReviewReplyDraft,
  canPublishReply,
  approveReplyDraft,
  submitReplyForApproval,
  publishReply,
  buildReputationDashboard,
  buildReputationInsights,
  normalizeReviewsFromApi,
  mergeReviewRows,
  connectionStatus,
  isGbpConfigured
};
