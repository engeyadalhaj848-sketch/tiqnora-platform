import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandProfile,
  validateBrandContent,
  getDefaultBrandProfile,
  checkRestrictedClaims
} from '../lib/v6/brand-brain.js';
import {
  createCampaign,
  generateContentIdeas,
  generateContentDraft,
  adaptToChannels,
  generateCreativeBrief,
  submitForReview,
  approveContent,
  editAfterApproval,
  scheduleContent,
  mockPublish,
  canPublish,
  detectDuplicateContent,
  runContentHandoff,
  buildPerformanceInsight,
  generateDailyPlan
} from '../lib/v6/social-studio.js';

describe('Brand Brain + Social AI Studio', () => {
  it('seeds Tiqnora brand colors and cities', () => {
    const b = buildBrandProfile();
    assert.equal(b.brand_name, 'Tiqnora AI');
    assert.equal(b.visual_identity.colors.electric_blue, '#0A5CFF');
    assert.ok(b.target_cities.includes('المدينة المنورة'));
  });

  it('flags restricted claims', () => {
    const v = validateBrandContent('نحن رقم 1 ونضمن نتائج', getDefaultBrandProfile());
    assert.equal(v.ok, false);
    assert.ok(v.warnings.length >= 1);
    assert.ok(checkRestrictedClaims('رقم 1').length >= 1);
  });

  it('creates campaign with approval defaults', () => {
    const c = createCampaign({
      name: 'حملة عيادات',
      objective: 'lead_generation',
      industry: 'dental_clinic',
      location: 'المدينة المنورة',
      platforms: ['instagram', 'tiktok']
    });
    assert.equal(c.auto_publish, false);
    assert.equal(c.requires_approval, true);
    assert.ok(c.platforms.includes('instagram'));
  });

  it('generates structured ideas', () => {
    const c = createCampaign({ name: 'X', industry: 'clinics', location: 'المدينة المنورة' });
    const ideas = generateContentIdeas(c, {}, { count: 10 });
    assert.equal(ideas.length, 10);
    assert.ok(ideas[0].title && ideas[0].content_type && ideas[0].CTA);
  });

  it('draft validates brand and sets requires_approval', () => {
    const c = createCampaign({ name: 'X', location: 'المدينة المنورة' });
    const idea = generateContentIdeas(c, {}, { count: 1 })[0];
    const draft = generateContentDraft(idea, c);
    assert.equal(draft.requires_approval, true);
    assert.equal(draft.auto_publish, false);
    assert.ok(draft.brand_validation);
  });

  it('adapts channels differently', () => {
    const draft = generateContentDraft(
      { title: 'عنوان', hook: 'خطاف', content_type: 'social_post', target_platform: 'instagram', CTA: 'اعرف أكثر' },
      createCampaign({ platforms: ['instagram', 'linkedin', 'whatsapp'] })
    );
    const variants = adaptToChannels(draft, ['instagram', 'linkedin', 'whatsapp']);
    assert.equal(variants.length, 3);
    assert.notEqual(variants[0].body, variants[1].body);
  });

  it('creative brief includes brand colors and negative prompt', () => {
    const brief = generateCreativeBrief({ headline: 'Test', hook: 'Hook', platform: 'tiktok' });
    assert.ok(brief.image_prompt);
    assert.ok(brief.negative_prompt.includes('fake'));
    assert.equal(brief.aspect_ratio, '9:16');
  });

  it('approval required before schedule/publish', () => {
    const draft = { status: 'draft', title: 't', body: 'b' };
    const sch = scheduleContent(draft, new Date().toISOString());
    assert.equal(sch.ok, false);
    assert.equal(canPublish(draft).ok, false);
    const reviewed = submitForReview(draft);
    const approved = approveContent(reviewed, 'admin');
    assert.equal(approved.status, 'approved');
    assert.equal(scheduleContent(approved, new Date().toISOString()).ok, true);
    const pub = mockPublish(approved, 'instagram');
    assert.equal(pub.ok, true);
    assert.equal(pub.live, false);
  });

  it('edit after approval resets to review', () => {
    const approved = approveContent({ status: 'review', body: 'x' }, 'a');
    const edited = editAfterApproval(approved, { body: 'y' });
    assert.equal(edited.status, 'review');
    assert.equal(edited.requires_approval, true);
  });

  it('duplicate detection works', () => {
    const d = detectDuplicateContent(
      { title: 'نصيحة للعيادات' },
      [{ id: 1, title: 'نصيحة للعيادات' }]
    );
    assert.equal(d.duplicate, true);
  });

  it('workforce handoff chain returns agents', () => {
    const chain = runContentHandoff({
      name: 'حملة',
      industry: 'dental_clinic',
      location: 'المدينة المنورة',
      platforms: ['instagram', 'facebook']
    });
    assert.equal(chain.auto_publish, false);
    assert.ok(chain.handoffs.some((h) => h.agent === 'marketing'));
    assert.ok(chain.handoffs.some((h) => h.agent === 'social'));
  });

  it('performance insight refuses empty metrics', () => {
    const empty = buildPerformanceInsight([]);
    assert.equal(empty.ok, false);
    const ok = buildPerformanceInsight([
      { content_type: 'short_video', likes: 10, comments: 2, shares: 1 },
      { content_type: 'social_post', likes: 1, comments: 0, shares: 0 }
    ]);
    assert.equal(ok.ok, true);
    assert.equal(ok.auto_apply_to_brand, false);
  });

  it('daily plan requires approval', () => {
    const plan = generateDailyPlan(createCampaign({ name: 'd' }));
    assert.equal(plan.requires_approval, true);
    assert.ok(plan.primary);
  });

  it('e2e offline studio flow', () => {
    const brand = getDefaultBrandProfile();
    const campaign = createCampaign({
      name: 'حملة واتساب للعيادات',
      objective: 'lead_generation',
      industry: 'dental_clinic',
      location: 'المدينة المنورة',
      platforms: ['instagram', 'facebook', 'tiktok']
    }, brand);
    const ideas = generateContentIdeas(campaign, brand, { count: 5 });
    const draft = generateContentDraft(ideas[0], campaign, brand);
    const variants = adaptToChannels(draft, campaign.platforms, brand);
    const brief = generateCreativeBrief(draft, brand);
    const validation = validateBrandContent(draft.body, brand, { require_cta: true });
    let content = submitForReview(draft);
    content = approveContent(content, 'admin-1');
    const scheduled = scheduleContent(content, new Date().toISOString());
    assert.equal(scheduled.ok, true);
    const pub = mockPublish(scheduled.content, 'instagram');
    assert.equal(pub.mock, true);
    assert.equal(pub.live, false);
    assert.ok(variants.length >= 1);
    assert.ok(brief.image_prompt);
    assert.ok(validation);
  });
});
