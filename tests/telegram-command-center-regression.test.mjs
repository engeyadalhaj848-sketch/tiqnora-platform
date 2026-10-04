import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'lib/telegram-command-center.js'), 'utf8');

test('telegram-command-center is not a stub/placeholder', () => {
  assert.equal(src.includes('SURGICAL_PLACEHOLDER'), false);
  assert.equal(src.includes('Temporary thin restore layer'), false);
  assert.equal(src.includes('minimal_handler'), false);
  // Full implementation markers
  assert.ok(src.length > 20000, `file too small: ${src.length}`);
  assert.ok(src.includes('export async function handleTelegramUpdate'));
  assert.ok(src.includes('export async function telegramBotInfo'));
  assert.ok(src.includes('export async function sendTelegramText'));
  assert.ok(src.includes('export function verifyTelegramWebhook'));
  assert.ok(src.includes('export async function telegramTargetChatId'));
  assert.ok(src.includes('tryPairChat') || src.includes('pairing'));
  assert.ok(src.includes('activeAgents') || src.includes('ai_agents'));
  assert.ok(src.includes('processCommand') || src.includes('/status'));
  assert.ok(src.includes('/scan') || src.includes('discoverProspects'));
  assert.ok(src.includes('/daily') || src.includes('ensureDailyWorkforceTasks'));
});

test('telegram-command-center status enrichment fields present', () => {
  assert.ok(src.includes('chat_id_source'));
  assert.ok(src.includes('paired_in_database'));
  assert.ok(src.includes('reachable'));
  assert.ok(src.includes('export async function isTelegramOperational') || src.includes('isTelegramOperational'));
});


test('telegram command center handles owner social approval callbacks and publishes only approved jobs', () => {
  assert.ok(src.includes('handleSocialApprovalCallback'));
  assert.ok(src.includes('processPublishingJob'));
  assert.ok(src.includes("approval.action === 'approve'"));
  assert.ok(src.includes('نتيجة النشر بعد اعتمادك'));
});


test('telegram social-review execution is prioritized before collaboration discussion', () => {
  assert.ok(src.includes("deliverExistingSocialReviewBatch"));
  assert.ok(src.includes("prepareSocialReviewBatch"));
  assert.ok(src.includes("export function isSocialReviewExecutionRequest"));
  assert.ok(src.includes("action: 'social_review_delivery'"));
  const executionIndex = src.indexOf("if (isSocialReviewExecutionRequest(text))");
  const discussionIndex = src.indexOf("if (teamCollaborationRequested || isAgentRoomDiscussionRequest(text) || isAuthorizedAgentRoomMessage(message))");
  assert.ok(executionIndex > 0, 'social review execution handler missing');
  assert.ok(discussionIndex > executionIndex, 'social review execution must run before discussion routing');
  assert.ok(src.includes('لن يتم نشر أي شيء قبل اعتمادك'));
});


test('telegram owner can explicitly publish an image post to all connected social platforms', () => {
  const publisher = readFileSync(join(root, 'lib/telegram-social-publisher.js'), 'utf8');
  assert.ok(src.includes('isTelegramSocialPublishRequest'));
  assert.ok(src.includes('publishTelegramSocialPost'));
  assert.ok(src.includes('نتيجة النشر من Telegram'));
  assert.ok(src.indexOf('if (isTelegramSocialPublishRequest(message))') < src.indexOf("if (!text) return { ok: true, note: 'empty_text' };"));
  assert.ok(publisher.includes("PLATFORMS = ['facebook', 'instagram', 'tiktok']"));
  assert.ok(publisher.includes("telegramApi('getFile'"));
  assert.ok(publisher.includes("SOCIAL_BUCKET = 'social-creatives'"));
  assert.ok(publisher.includes("owner_approved_via: 'telegram_group'"));
  assert.ok(publisher.includes("requires_approval: false"));
  assert.ok(publisher.includes('processPublishingJob'));
  assert.ok(publisher.includes('/publish or انشر'));
});
