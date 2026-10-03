import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const autopilot = readFileSync(new URL('../lib/v6/social-autopilot.js', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../api/reports/telegram.js', import.meta.url), 'utf8');
const workforceChat = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/060_daily_social_autopilot.sql', import.meta.url), 'utf8');
const migration64 = readFileSync(new URL('../supabase/migrations/064_social_every_2h_scheduler.sql', import.meta.url), 'utf8');
const migration67 = readFileSync(new URL('../supabase/migrations/067_social_quality_gate_pause.sql', import.meta.url), 'utf8');
const reviewBatch = readFileSync(new URL('../lib/social-review-batch.js', import.meta.url), 'utf8');
const assetScript = readFileSync(new URL('../scripts/generate-social-review-assets.mjs', import.meta.url), 'utf8');

test('daily social autopilot is collaborative and OpenAI-backed through shared provider', () => {
  assert.equal(autopilot.includes('managerDirective'), true);
  assert.equal(autopilot.includes('marketingBrief'), true);
  assert.equal(autopilot.includes('socialPackage'), true);
  assert.equal(autopilot.includes("generateStructured"), true);
  assert.equal(autopilot.includes("collaboration:['manager','marketing','content','social-media','image-designer']"), true);
});

test('daily social autopilot prepares connected Facebook, Instagram and TikTok feeds behind owner approval', () => {
  assert.equal(autopilot.includes("['facebook','instagram','tiktok']"), true);
  assert.equal(autopilot.includes("platforms.has('facebook')"), true);
  assert.equal(autopilot.includes("platforms.has('instagram')"), true);
  assert.equal(autopilot.includes("platforms.has('tiktok')"), true);
  assert.equal(autopilot.includes("requires_approval:ownerApprovalRequired"), true);
  assert.equal(autopilot.includes("user_authorized_auto_publish:false"), true);
});

test('morning cron prepares social content before processing publish queue', () => {
  const make = reports.indexOf('ensureDailySocialAutopilot()');
  const publish = reports.indexOf('processPublishingQueue({ limit: 5 })');
  assert.equal(make >= 0 && publish > make, true);
  assert.equal(reports.includes("schedule === '0 5 * * *'"), true);
});

test('chief of staff exists as a specialist orchestrator', () => {
  assert.equal(workforceChat.includes('Tiqnora AI Chief of Staff and Multi-Agent Orchestrator'), true);
  assert.equal(migration.includes("'manager'"), true);
  assert.equal(migration.includes("'openai'"), true);
  assert.equal(migration.includes("'chat-latest'"), true);
});

test('autopilot is explicitly scoped in organization settings', () => {
  assert.equal(migration.includes("'social_autopilot'"), true);
  assert.equal(migration.includes("'facebook','instagram'"), true);
  assert.equal(migration.includes("'daily_time', '08:00'"), true);
  assert.equal(migration.includes("'authorized_scope'"), true);
});


test('chief of staff reviews and can return weak social work to a specialist before publish', () => {
  assert.equal(autopilot.includes('managerQualityReview'), true);
  assert.equal(autopilot.includes('managerReviewLoop'), true);
  assert.equal(autopilot.includes('reviseSocialPackage'), true);
  assert.equal(autopilot.includes("approve|revise"), true);
  assert.equal(autopilot.includes("'returned_to_specialist'"), true);
  assert.equal(autopilot.includes("reason:'manager_review_not_approved'"), true);
  assert.equal(autopilot.includes('manager_approved:true'), true);
});


test('two-hour social scheduler is persisted with Riyadh-aligned cadence and secure scheduler token', () => {
  assert.equal(autopilot.includes('slotRiyadh'), true);
  assert.equal(autopilot.includes("config.interval_hours||2"), true);
  assert.equal(autopilot.includes('autopilot_slot'), true);
  assert.equal(reports.includes("route === 'social_autopilot_tick'"), true);
  assert.equal(reports.includes('isAuthorizedSocialScheduler'), true);
  assert.equal(migration64.includes("'0 1-23/2 * * *'"), true);
  assert.equal(migration64.includes("tiqnora_social_scheduler_token"), true);
  assert.equal(migration64.includes("organic_every_2h"), true);
});


test('social autopilot fails closed until a Gold Standard visual is explicitly approved', () => {
  assert.ok(autopilot.includes('approved_visual_missing'));
  assert.ok(autopilot.includes('SOCIAL_VISUAL_NOT_APPROVED'));
  assert.ok(autopilot.includes('legacy_placeholder_assets_blocked') || migration67.includes('legacy_placeholder_assets_blocked'));
  assert.ok(autopilot.includes('wireframes'));
  assert.ok(autopilot.includes('platformSpecific'));
  assert.ok(migration67.includes("'{social_autopilot,enabled}'"));
  assert.ok(migration67.includes("'false'::jsonb"));
  assert.ok(migration67.includes("cron.unschedule('tiqnora-social-autopilot-every-2h')"));
});


test('autopilot sends every approved-quality post to Telegram for owner approval instead of auto-publishing', () => {
  assert.equal(autopilot.includes("notifySocialApproval"), true);
  assert.equal(autopilot.includes("ownerApprovalRequired"), true);
  assert.equal(autopilot.includes("status:ownerApprovalRequired?'waiting_approval':'queued'"), true);
  assert.equal(autopilot.includes("requires_approval:ownerApprovalRequired"), true);
  assert.equal(autopilot.includes("user_authorized_auto_publish:false"), true);
  assert.equal(autopilot.includes("approval_channel:'telegram_group'"), true);
});


test('agent review batch prepares three owner-gated posts with generated quality-reviewed artwork', () => {
  assert.equal(reviewBatch.includes('prepareSocialReviewBatch'), true);
  assert.equal(reviewBatch.includes("['facebook','instagram','tiktok']"), true);
  assert.equal(reviewBatch.includes("status:'waiting_approval'"), true);
  assert.equal(reviewBatch.includes('notifySocialApproval'), true);
  assert.equal(reviewBatch.includes('generateDesignAsset'), true);
  assert.equal(reviewBatch.includes("SOCIAL_BUCKET='social-creatives'"), true);
  assert.equal(reviewBatch.includes("manager_review_status:'passed'"), true);
  assert.equal(reviewBatch.includes('image_quality_score'), true);
  assert.equal(reviewBatch.includes('forceNew:true'), true);
  assert.equal(assetScript.includes("review-web-design.png"), true);
  assert.equal(assetScript.includes("review-whatsapp-automation.png"), true);
  assert.equal(assetScript.includes("review-ai-agents.png"), true);
});
