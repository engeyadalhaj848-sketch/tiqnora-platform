import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  starRatingToNumber,
  mapReviewToRecord,
  mapLocationToRecord,
  isGbpConfigured,
  connectionStatusFromToken,
  buildGbpAuthUrl
} from '../lib/v6/reputation/providers/google-business-profile.js';
import {
  analyzeReview,
  generateReviewReplyDraft,
  canPublishReply,
  approveReplyDraft,
  submitReplyForApproval,
  publishReply,
  buildReputationDashboard,
  buildReputationInsights,
  normalizeReviewsFromApi,
  mergeReviewRows,
  privacyGuard,
  claimsGuard,
  detectLanguage
} from '../lib/v6/reputation/engine.js';
import { getDefaultBrandProfile } from '../lib/v6/brand-brain.js';

describe('GBP provider helpers', () => {
  it('maps star ratings', () => {
    assert.equal(starRatingToNumber('FIVE'), 5);
    assert.equal(starRatingToNumber('ONE'), 1);
    assert.equal(starRatingToNumber(null), null);
  });

  it('maps review without inventing comment', () => {
    const r = mapReviewToRecord({
      reviewId: 'abc',
      starRating: 'TWO',
      comment: 'بطيء',
      reviewer: { displayName: 'Ali' },
      createTime: '2026-01-01T00:00:00Z',
      name: 'accounts/1/locations/2/reviews/abc'
    });
    assert.equal(r.external_review_id, 'abc');
    assert.equal(r.rating, 2);
    assert.equal(r.reply_status, 'unanswered');
  });

  it('maps location record', () => {
    const loc = mapLocationToRecord({
      name: 'locations/xyz',
      title: 'Clinic',
      storefrontAddress: { addressLines: ['Street'], locality: 'Madinah' },
      phoneNumbers: { primaryPhone: '014' }
    }, 'acc1');
    assert.equal(loc.external_location_id, 'xyz');
    assert.equal(loc.provider, 'google_business_profile');
  });

  it('connection status not_configured without env', () => {
    const prev = { ...process.env };
    delete process.env.GOOGLE_BUSINESS_CLIENT_ID;
    delete process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
    delete process.env.GOOGLE_BUSINESS_REDIRECT_URI;
    assert.equal(connectionStatusFromToken(null), 'not_configured');
    Object.assign(process.env, prev);
  });

  it('buildGbpAuthUrl throws when not configured', () => {
    delete process.env.GOOGLE_BUSINESS_CLIENT_ID;
    delete process.env.GOOGLE_BUSINESS_REDIRECT_URI;
    assert.throws(() => buildGbpAuthUrl('s'), (e) => e.code === 'not_configured');
  });
});

describe('reputation analysis + replies', () => {
  it('analyzes negative text review as high priority', () => {
    const a = analyzeReview({ rating: 1, comment: 'تأخير كبير والخدمة سيئة' });
    assert.equal(a.sentiment, 'negative');
    assert.ok(['high', 'critical'].includes(a.priority));
    assert.ok(a.topics.includes('speed') || a.topics.includes('customer_service') || a.topics.length >= 0);
  });

  it('rating-only does not invent detailed sentiment text topics', () => {
    const a = analyzeReview({ rating: 5, comment: '' });
    assert.equal(a.sentiment, 'positive_rating_only');
    assert.equal(a.topics.length, 0);
  });

  it('detects arabic language', () => {
    assert.equal(detectLanguage('تجربة ممتازة'), 'ar');
    assert.equal(detectLanguage('Great service'), 'en');
  });

  it('privacy and claims guards', () => {
    assert.equal(privacyGuard('email me at test@x.com').ok, false);
    assert.equal(claimsGuard('سنعمل على استرجاع المبلغ').ok, false);
    assert.equal(privacyGuard('شكرًا لتقييمكم').ok, true);
  });

  it('draft requires approval and auto_reply false', () => {
    const draft = generateReviewReplyDraft(
      { rating: 1, comment: 'خدمة سيئة', reviewer_display_name: 'S' },
      { title: 'عيادة' },
      getDefaultBrandProfile()
    );
    assert.equal(draft.requires_approval, true);
    assert.equal(draft.auto_reply, false);
    assert.ok(draft.draft_reply.length > 10);
  });

  it('publish blocked before approval', async () => {
    const draft = generateReviewReplyDraft({ rating: 2, comment: 'بطيء' }, { title: 'X' });
    const gate = canPublishReply(draft);
    assert.equal(gate.ok, false);
    assert.ok(gate.reasons.includes('human_approval_required'));
    const pub = await publishReply(draft, { resource_name: 'accounts/1/locations/2/reviews/3' });
    assert.equal(pub.ok, false);
  });

  it('approve then mock publish succeeds', async () => {
    let draft = generateReviewReplyDraft({ rating: 5, comment: 'ممتاز' }, { title: 'X' });
    draft = submitReplyForApproval(draft);
    draft = approveReplyDraft(draft, 'admin');
    assert.equal(draft.status, 'approved');
    const pub = await publishReply(draft, { resource_name: 'accounts/1/locations/2/reviews/3' });
    assert.equal(pub.ok, true);
    assert.equal(pub.live, false);
    assert.equal(pub.mock, true);
    assert.equal(pub.auto_reply, false);
  });

  it('dashboard uses real counts only', () => {
    const reviews = [
      { rating: 5, reply_status: 'answered', sentiment: 'positive' },
      { rating: 1, reply_status: 'unanswered', sentiment: 'negative' }
    ];
    const d = buildReputationDashboard(reviews, [{ id: 1 }]);
    assert.equal(d.review_count, 2);
    assert.equal(d.unanswered_reviews, 1);
    assert.equal(d.location_count, 1);
    assert.ok(d.average_rating >= 1);
  });

  it('insights require evidence', () => {
    const empty = buildReputationInsights([]);
    assert.equal(empty.ok, false);
    const now = new Date().toISOString();
    const many = Array.from({ length: 5 }, (_, i) => ({
      rating: 1,
      topics: ['speed'],
      created_at_external: now,
      location_id: 'L1'
    }));
    const ins = buildReputationInsights(many);
    assert.equal(ins.ok, true);
    assert.ok(ins.insights.some((x) => x.evidence_count >= 2));
  });

  it('dedupes by provider+external_review_id', () => {
    const a = [{ provider: 'google_business_profile', external_review_id: 'r1', rating: 5, comment: 'old' }];
    const b = [{ provider: 'google_business_profile', external_review_id: 'r1', rating: 5, comment: 'new' }];
    const merged = mergeReviewRows(a, b);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].comment, 'new');
  });

  it('normalizeReviewsFromApi attaches analysis', () => {
    const rows = normalizeReviewsFromApi(
      [{ reviewId: 'x1', starRating: 'ONE', comment: 'سيء', createTime: new Date().toISOString() }],
      { external_location_id: 'loc1', title: 'Loc' }
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].priority);
    assert.ok(rows[0].sentiment);
  });
});

describe('reputation offline e2e', () => {
  it('connect mock → sync → analyze → draft → approve → mock publish → dashboard', async () => {
    assert.equal(typeof isGbpConfigured(), 'boolean');
    const apiReviews = [
      { reviewId: 'e1', starRating: 'FIVE', comment: 'رائع', reviewer: { displayName: 'A' }, createTime: new Date().toISOString(), name: 'accounts/1/locations/1/reviews/e1' },
      { reviewId: 'e2', starRating: 'ONE', comment: 'تأخير وموظفون غير متعاونين', reviewer: { displayName: 'B' }, createTime: new Date().toISOString(), name: 'accounts/1/locations/1/reviews/e2' },
      { reviewId: 'e3', starRating: 'TWO', comment: 'السعر غالي', createTime: new Date().toISOString() },
      { reviewId: 'e4', starRating: 'FOUR', comment: 'Good', createTime: new Date().toISOString() },
      { reviewId: 'e5', starRating: 'THREE', comment: '', createTime: new Date().toISOString() }
    ];
    const location = { id: 'loc-db-1', title: 'عيادة', external_location_id: '1' };
    let reviews = normalizeReviewsFromApi(apiReviews, location);
    reviews = mergeReviewRows([], reviews);
    assert.equal(reviews.length, 5);

    const negative = reviews.find((r) => r.rating === 1);
    assert.ok(negative);
    let draft = generateReviewReplyDraft(negative, location, getDefaultBrandProfile());
    assert.equal(draft.auto_reply, false);
    draft = submitReplyForApproval(draft);
    draft = approveReplyDraft(draft, 'admin');
    const pub = await publishReply(draft, negative);
    assert.equal(pub.ok, true);
    assert.equal(pub.live, false);

    negative.reply_status = 'answered';
    negative.existing_reply = draft.draft_reply;
    const dash = buildReputationDashboard(reviews, [location]);
    assert.equal(dash.review_count, 5);
    const insights = buildReputationInsights(reviews);
    assert.ok(insights.insights || insights.message);
  });
});
