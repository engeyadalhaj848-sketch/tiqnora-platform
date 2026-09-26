import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const provider = readFileSync(new URL('../api/social/oauth/[provider].js', import.meta.url), 'utf8');
const webhook = readFileSync(new URL('../api/social/webhook.js', import.meta.url), 'utf8');

test('Approved proposal sends use an Action UUID as the YCloud idempotency reservation', () => {
  assert.equal(provider.includes("action_type: deliveryAction ? 'proposal_send' : 'manual_reply'"), true);
  assert.equal(provider.includes("const reservationId = deliveryAction?.id || event.id"), true);
  assert.equal(provider.includes('loadApprovedProposalAction'), true);
});

test('Outbound replies persist into CRM and YCloud delivery receipts are subscribed', () => {
  assert.equal(provider.includes('persistOutboundCrmMessage'), true);
  assert.equal(provider.includes("source: actionId ? 'approved_proposal' : 'manual_social_reply'"), true);
  assert.equal(webhook.includes("'whatsapp.message.updated'"), true);
  assert.equal(webhook.includes('persistDeliveryStatusEvent'), true);
});


test('Pre-production webhook preserves guarded WhatsApp AI auto reply and V6 CRM bridge together', () => {
  assert.equal(webhook.includes('async function sendYCloudAutoReply'), true);
  assert.equal(webhook.includes("rule.match_mode === 'always'"), true);
  assert.equal(webhook.includes("actionType: 'auto_reply'"), true);
  assert.equal(webhook.includes('persistSocialCrmEvent'), true);
  assert.equal(webhook.includes('persistDeliveryStatusEvent'), true);
  assert.equal(webhook.includes("source: 'auto_reply'"), true);
  assert.equal(webhook.includes('GOOGLE_GEMINI_API_KEY'), true);
});
