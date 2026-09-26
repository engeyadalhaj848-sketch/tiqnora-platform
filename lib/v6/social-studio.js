/**
 * Tiqnora V6 — Social AI Studio workflow (offline-safe, approval-gated)
 * Brand Brain → Campaign → Ideas → Draft → Variants → Creative Brief → Review → Schedule → Mock Publish
 */

import {
  buildBrandProfile,
  buildBrandContext,
  getApprovedCTA,
  getChannelGuidelines,
  validateBrandContent,
  CONTENT_STATUSES
} from './brand-brain.js';

export const CAMPAIGN_OBJECTIVES = Object.freeze([
  'awareness',
  'lead_generation',
  'engagement',
  'traffic',
  'conversion',
  'product_promotion',
  'service_promotion',
  'seasonal_campaign',
  'reputation',
  'education'
]);

export const CONTENT_TYPES = Object.freeze([
  'social_post',
  'carousel',
  'short_video',
  'reel',
  'tiktok',
  'story',
  'linkedin_post',
  'educational_post',
  'offer',
  'case_study',
  'testimonial',
  'FAQ',
  'blog_idea',
  'email_idea',
  'whatsapp_broadcast_draft'
]);

const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'whatsapp', 'telegram'];

function asString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function createCampaign(input = {}, brandProfile = {}) {
  const brand = buildBrandProfile(brandProfile);
  const objective = CAMPAIGN_OBJECTIVES.includes(input.objective)
    ? input.objective
    : 'awareness';
  const platforms = Array.isArray(input.platforms)
    ? input.platforms.map((p) => String(p).toLowerCase()).filter((p) => PLATFORMS.includes(p))
    : ['instagram', 'facebook'];

  return {
    id: input.id || null,
    name: asString(input.name) || 'حملة جديدة',
    objective,
    status: input.status || 'draft',
    target_audience: asString(input.target_audience) || (brand.target_audience || []).slice(0, 3).join('، '),
    industry: asString(input.industry),
    location: asString(input.location) || (brand.target_cities || [])[0] || null,
    platforms,
    offer: asString(input.offer),
    cta: asString(input.cta) || getApprovedCTA(brand, 'ar'),
    campaign_brief: asString(input.campaign_brief) || '',
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    brand_name: brand.brand_name,
    requires_approval: true,
    auto_publish: false,
    created_at: new Date().toISOString()
  };
}

/**
 * Deterministic structured content ideas from campaign (no invented claims).
 */
export function generateContentIdeas(campaign = {}, brandProfile = {}, options = {}) {
  const brand = buildBrandProfile(brandProfile);
  const n = Math.min(Math.max(parseInt(options.count || 10, 10) || 10, 1), 15);
  const location = campaign.location || brand.target_cities?.[0] || 'السعودية';
  const industry = campaign.industry || 'الأعمال';
  const objective = campaign.objective || 'awareness';
  const service = (brand.services || ['whatsapp_automation'])[0];

  const templates = [
    {
      title: `لماذا ${service} يهم ${industry} في ${location}`,
      angle: 'education',
      content_type: 'educational_post',
      funnel_stage: 'awareness',
      platform: 'instagram'
    },
    {
      title: `3 أخطاء شائعة في تواصل ${industry}`,
      angle: 'pain_points',
      content_type: 'carousel',
      funnel_stage: 'awareness',
      platform: 'instagram'
    },
    {
      title: `كيف تنظّم الردود بدون فوضى`,
      angle: 'how_to',
      content_type: 'short_video',
      funnel_stage: 'consideration',
      platform: 'tiktok'
    },
    {
      title: `قبل / بعد: تنظيم المبيعات`,
      angle: 'transformation',
      content_type: 'carousel',
      funnel_stage: 'consideration',
      platform: 'facebook'
    },
    {
      title: `سؤال شائع من عملاء ${industry}`,
      angle: 'faq',
      content_type: 'FAQ',
      funnel_stage: 'consideration',
      platform: 'instagram'
    },
    {
      title: `عرض موجّه: ${campaign.offer || 'استشارة مخصصة'}`,
      angle: 'offer',
      content_type: 'offer',
      funnel_stage: 'conversion',
      platform: 'facebook'
    },
    {
      title: `نصيحة مهنية لفرق ${industry}`,
      angle: 'insight',
      content_type: 'linkedin_post',
      funnel_stage: 'awareness',
      platform: 'linkedin'
    },
    {
      title: `قصة استخدام (بدون أرقام مختلقة)`,
      angle: 'story',
      content_type: 'case_study',
      funnel_stage: 'consideration',
      platform: 'linkedin'
    },
    {
      title: `Checklist سريع للحضور الرقمي`,
      angle: 'checklist',
      content_type: 'carousel',
      funnel_stage: 'awareness',
      platform: 'instagram'
    },
    {
      title: `رسالة واتساب قصيرة للتوعية`,
      angle: 'outreach_soft',
      content_type: 'whatsapp_broadcast_draft',
      funnel_stage: 'conversion',
      platform: 'whatsapp'
    },
    {
      title: `Hook فيديو: أتمتة التواصل`,
      angle: 'hook',
      content_type: 'reel',
      funnel_stage: 'awareness',
      platform: 'instagram'
    },
    {
      title: `تلغراف: ملخص فائدة واحدة`,
      angle: 'digest',
      content_type: 'social_post',
      funnel_stage: 'awareness',
      platform: 'telegram'
    }
  ];

  const ideas = [];
  for (let i = 0; i < n; i++) {
    const t = templates[i % templates.length];
    const cta = campaign.cta || getApprovedCTA(brand, 'ar');
    ideas.push({
      id: `idea-${i + 1}`,
      title: t.title,
      hook: `${t.title.split(':')[0]}—بدون مبالغة.`,
      angle: t.angle,
      content_type: t.content_type,
      target_platform: t.platform,
      funnel_stage: t.funnel_stage,
      CTA: cta,
      recommended_asset: t.content_type.includes('video') || t.content_type === 'reel' ? 'short_video' : 'static_image',
      reason: `يتوافق مع هدف الحملة (${objective}) وجمهور ${industry} في ${location}.`,
      campaign_name: campaign.name,
      status: 'idea',
      requires_approval: true
    });
  }
  return ideas;
}

export function generateContentDraft(idea = {}, campaign = {}, brandProfile = {}) {
  const brand = buildBrandProfile(brandProfile);
  const ctx = buildBrandContext(brand);
  const cta = idea.CTA || campaign.cta || getApprovedCTA(brand, 'ar');
  const location = campaign.location || brand.target_cities?.[0] || '';
  const headline = idea.title || 'مسودة محتوى';
  const hook = idea.hook || headline;
  const body = [
    hook,
    '',
    `في ${location || 'السوق المحلي'}، تحتاج فرق ${campaign.industry || 'العمل'} إلى تواصل أوضح ومتابعة منظمة.`,
    `تركّز ${brand.brand_name} على حلول عملية مثل الأتمتة والمبيعات والمحتوى — مع موافقة بشرية قبل أي إرسال.`,
    '',
    cta
  ].join('\n');

  const hashtags = (brand.hashtags || []).slice(0, 5);
  const validation = validateBrandContent(`${headline}\n${body}`, brand, { require_cta: true });

  return {
    status: 'draft',
    content_type: idea.content_type || 'social_post',
    title: headline,
    headline,
    hook,
    body,
    cta,
    hashtags,
    keywords: (brand.keywords || []).slice(0, 6),
    platform: idea.target_platform || 'instagram',
    language: brand.preferred_language || 'ar',
    tone: (brand.tone_of_voice || []).join(', '),
    campaign: campaign.name || null,
    angle: idea.angle || null,
    funnel_stage: idea.funnel_stage || null,
    brand_validation: validation,
    requires_approval: true,
    auto_publish: false
  };
}

export function adaptToChannels(draft = {}, platforms = [], brandProfile = {}) {
  const brand = buildBrandProfile(brandProfile);
  const list = (platforms.length ? platforms : [draft.platform || 'instagram'])
    .map((p) => String(p).toLowerCase())
    .filter((p, i, a) => PLATFORMS.includes(p) && a.indexOf(p) === i);

  return list.map((platform) => {
    const guide = getChannelGuidelines(platform);
    let body = draft.body || '';
    let hook = draft.hook || draft.headline || '';
    let hashtags = [...(draft.hashtags || [])];

    if (platform === 'tiktok') {
      hook = `وقف! ${hook}`.slice(0, 90);
      body = `${hook}\n\nفكرة سريعة — طبّقها اليوم.\n${draft.cta || ''}`.trim();
      hashtags = hashtags.slice(0, guide.max_hashtags);
    } else if (platform === 'linkedin') {
      body = `${draft.headline || ''}\n\n${body}\n\n#${(brand.keywords || ['AI'])[0]?.replace(/\s/g, '') || 'Business'}`.trim();
      hashtags = hashtags.slice(0, guide.max_hashtags);
    } else if (platform === 'whatsapp') {
      body = `${hook}\n\n${draft.cta || getApprovedCTA(brand, 'ar')}`.slice(0, 500);
      hashtags = [];
    } else if (platform === 'telegram') {
      body = `${draft.headline || hook}\n\n${body}`.slice(0, 800);
      hashtags = hashtags.slice(0, guide.max_hashtags);
    } else if (platform === 'facebook') {
      body = `${body}\n\nشاركنا رأيكم.`;
      hashtags = hashtags.slice(0, guide.max_hashtags);
    } else {
      // instagram default
      hashtags = hashtags.slice(0, guide.max_hashtags);
    }

    const validation = validateBrandContent(body, brand, { require_cta: platform !== 'tiktok' });
    return {
      platform,
      headline: draft.headline || draft.title,
      hook,
      body,
      cta: draft.cta,
      hashtags,
      channel_style: guide.style,
      notes: guide.notes,
      brand_validation: validation,
      status: 'draft',
      requires_approval: true,
      auto_publish: false
    };
  });
}

export function generateCreativeBrief(draft = {}, brandProfile = {}) {
  const brand = buildBrandProfile(brandProfile);
  const colors = brand.visual_identity?.colors || {};
  return {
    image_prompt: `Premium tech marketing visual for ${brand.brand_name}, ${draft.headline || 'business growth'}, clean composition, electric blue ${colors.electric_blue || '#0A5CFF'} and cyan ${colors.cyber_cyan || '#00D2FF'} accents on midnight navy ${colors.midnight_navy || '#060B1E'}, modern AI aesthetic, no fake logos of other brands`,
    video_prompt: `Short vertical video, hook in first 2 seconds about ${draft.hook || draft.headline}, cyber-luxury office/tech mood, on-screen captions in Arabic, end card with CTA`,
    visual_style: (brand.visual_identity?.style || []).join(', '),
    scene: 'modern workspace / soft tech gradients',
    subject: draft.headline || 'Tiqnora service highlight',
    background: 'dark navy with subtle cyan glow',
    camera: 'clean product/marketing framing',
    lighting: 'soft studio + neon accent',
    layout: 'safe margins, logo corner, readable overlay',
    text_overlay: draft.hook || draft.headline || '',
    aspect_ratio: draft.platform === 'tiktok' || draft.content_type === 'reel' ? '9:16' : '1:1',
    brand_colors: colors,
    logo_usage: brand.visual_identity?.logo_usage || '',
    negative_prompt: 'no fake testimonials, no fabricated numbers, no cluttered collage, no low-quality stock spam',
    video_script: {
      hook: draft.hook,
      body_points: [draft.body?.split('\n').filter(Boolean)[0] || ''],
      cta: draft.cta,
      duration_sec: 21
    }
  };
}

/**
 * Detect near-duplicate hooks/titles against recent content.
 */
export function detectDuplicateContent(candidate = {}, recent = []) {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const title = norm(candidate.title || candidate.headline || candidate.hook);
  if (!title) return { duplicate: false, matches: [] };
  const matches = [];
  for (const item of recent || []) {
    const other = norm(item.title || item.headline || item.hook);
    if (!other) continue;
    if (other === title || other.includes(title) || title.includes(other)) {
      matches.push({ id: item.id || null, title: item.title || item.headline });
    }
  }
  return { duplicate: matches.length > 0, matches };
}

export function submitForReview(content = {}) {
  if (content.status === 'published') {
    return { ...content, error: 'already_published' };
  }
  return {
    ...content,
    status: 'review',
    requires_approval: true,
    auto_publish: false,
    submitted_at: new Date().toISOString()
  };
}

export function approveContent(content = {}, approver = null) {
  if (!['review', 'draft', 'changes_requested'].includes(content.status) && content.status !== 'approved') {
    // allow approve from review/draft
  }
  return {
    ...content,
    status: 'approved',
    approved_by: approver,
    approved_at: new Date().toISOString(),
    requires_approval: false,
    auto_publish: false
  };
}

export function editAfterApproval(content = {}, edits = {}) {
  const next = { ...content, ...edits };
  next.status = 'review';
  next.requires_approval = true;
  next.approved_at = null;
  next.approved_by = null;
  next.auto_publish = false;
  next.edited_after_approval = true;
  return next;
}

export function scheduleContent(content = {}, scheduled_at) {
  if (content.status !== 'approved' && content.status !== 'scheduled') {
    return {
      ok: false,
      code: 'approval_required',
      message: 'Cannot schedule before approval',
      content
    };
  }
  return {
    ok: true,
    content: {
      ...content,
      status: 'scheduled',
      scheduled_at: scheduled_at || new Date().toISOString(),
      auto_publish: false
    }
  };
}

/**
 * Mock publish only — never hits live social APIs.
 */
export function mockPublish(content = {}, platform) {
  if (content.status !== 'approved' && content.status !== 'scheduled') {
    return {
      ok: false,
      code: 'approval_required',
      auto_publish: false,
      message: 'Publish blocked: human approval required'
    };
  }
  return {
    ok: true,
    mock: true,
    platform: platform || content.platform,
    status: 'published',
    external_id: `mock_${Date.now()}`,
    published_at: new Date().toISOString(),
    auto_publish: false,
    live: false
  };
}

export function canPublish(content = {}) {
  const allowed = content.status === 'approved' || content.status === 'scheduled';
  return {
    ok: allowed,
    reasons: allowed ? [] : ['human_approval_required'],
    auto_publish: false
  };
}

export function generateDailyPlan(campaign = {}, brandProfile = {}) {
  const ideas = generateContentIdeas(campaign, brandProfile, { count: 5 });
  return {
    date: new Date().toISOString().slice(0, 10),
    ideas: ideas.slice(0, 3),
    primary: ideas[0],
    backup: ideas[1],
    short_video: ideas.find((i) => ['short_video', 'reel', 'tiktok'].includes(i.content_type)) || ideas[2],
    requires_approval: true,
    auto_publish: false
  };
}

/**
 * Workforce-style handoff chain (structured, no live publish).
 */
export function runContentHandoff(campaign = {}, brandProfile = {}) {
  const brand = buildBrandProfile(brandProfile);
  const marketing = {
    agent: 'marketing',
    output: createCampaign(campaign, brand)
  };
  const ideas = generateContentIdeas(marketing.output, brand, { count: 5 });
  const contentAgent = {
    agent: 'content',
    input: ideas[0],
    output: generateContentDraft(ideas[0], marketing.output, brand)
  };
  const design = {
    agent: 'design',
    input: contentAgent.output,
    output: generateCreativeBrief(contentAgent.output, brand)
  };
  const video = {
    agent: 'video',
    input: contentAgent.output,
    output: {
      hook: contentAgent.output.hook,
      script: design.output.video_script,
      shot_list: ['hook visual', 'product/UI', 'CTA card'],
      duration_sec: 21,
      aspect_ratio: design.output.aspect_ratio
    }
  };
  const social = {
    agent: 'social',
    input: contentAgent.output,
    output: adaptToChannels(contentAgent.output, marketing.output.platforms, brand)
  };

  return {
    campaign: marketing.output,
    handoffs: [marketing, contentAgent, design, video, social],
    requires_approval: true,
    auto_publish: false
  };
}

/**
 * Insights only from provided metrics (no fake analytics).
 */
export function buildPerformanceInsight(metricsList = []) {
  const rows = Array.isArray(metricsList) ? metricsList.filter(Boolean) : [];
  if (!rows.length) {
    return {
      ok: false,
      insight: null,
      message: 'لا توجد بيانات أداء كافية'
    };
  }
  const byType = {};
  for (const m of rows) {
    const key = m.content_type || m.format || m.platform || 'unknown';
    byType[key] = byType[key] || { key, engagement: 0, n: 0 };
    const eng = Number(m.likes || 0) + Number(m.comments || 0) + Number(m.shares || 0);
    if (Number.isFinite(eng)) {
      byType[key].engagement += eng;
      byType[key].n += 1;
    }
  }
  const ranked = Object.values(byType)
    .filter((x) => x.n > 0)
    .map((x) => ({ ...x, avg: x.engagement / x.n }))
    .sort((a, b) => b.avg - a.avg);
  if (ranked.length < 1) {
    return { ok: false, insight: null, message: 'لا توجد مقاييس رقمية' };
  }
  const top = ranked[0];
  return {
    ok: true,
    insight: `أعلى متوسط تفاعل ضمن البيانات المتوفرة: ${top.key} (متوسط ${Math.round(top.avg)}).`,
    ranking: ranked,
    recommendation_only: true,
    auto_apply_to_brand: false
  };
}

export default {
  CAMPAIGN_OBJECTIVES,
  CONTENT_TYPES,
  CONTENT_STATUSES,
  createCampaign,
  generateContentIdeas,
  generateContentDraft,
  adaptToChannels,
  generateCreativeBrief,
  detectDuplicateContent,
  submitForReview,
  approveContent,
  editAfterApproval,
  scheduleContent,
  mockPublish,
  canPublish,
  generateDailyPlan,
  runContentHandoff,
  buildPerformanceInsight
};
