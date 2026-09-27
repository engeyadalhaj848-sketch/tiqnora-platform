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


test('WhatsApp auto reply keeps conversation context instead of repeating the welcome template', () => {
  assert.equal(webhook.includes('whatsappContextFallback'), true);
  assert.equal(webhook.includes('recentConversationHistory'), true);
  assert.equal(webhook.includes('followUp: whatsappFollowUp'), true);
  assert.equal(webhook.includes('هذه محادثة مستمرة. لا تعيد رسالة الترحيب'), true);
  assert.equal(webhook.includes("reason: 'welcome_already_sent_within_24h'"), false);
  assert.equal(webhook.includes('نقدم تصميم وتطوير المواقع والمتاجر، أتمتة واتساب وCRM'), true);
});


test('WhatsApp auto reply stays Arabic and avoids quoted-message UI', () => {
  assert.equal(webhook.includes('const wrongLanguage ='), true);
  assert.equal(webhook.includes('بدون تكرار أو لف ودوران'), true);
  assert.equal(webhook.includes("payload.context = { message_id: rawMessage.wamid }"), false);
});


test('WhatsApp support escalation stays queued for staff follow-up', () => {
  assert.equal(webhook.includes('SPECIALIST_HANDOFF_TEXT'), true);
  assert.equal(webhook.includes("actionType: 'specialist_handoff'"), true);
  assert.equal(webhook.includes("processing_status: specialistHandoff ? 'new' : 'processed'"), true);
});


test('WhatsApp emotion-only frustration is not escalated as an unknown work request', () => {
  assert.equal(webhook.includes('isWhatsappEmotionalMessage'), true);
  assert.equal(webhook.includes('ماتفهم'), true);
  assert.equal(webhook.includes('المشاعر أو المزاح أو عدم الفهم ليست سببًا للتحويل'), true);
  assert.equal(webhook.includes('أفهم إن الرد السابق ضايقك'), true);
});


test('WhatsApp agent is AI-first with deeper conversation context', () => {
  const openaiPos = webhook.indexOf('if (process.env.OPENAI_API_KEY)');
  const geminiPos = webhook.indexOf('const geminiKey =');
  assert.equal(openaiPos >= 0 && geminiPos > openaiPos, true);
  assert.equal(webhook.includes("process.env.OPENAI_MODEL || 'chat-latest'"), true);
  assert.equal(webhook.includes('limit = 16'), true);
  assert.equal(webhook.includes('Math.min(20'), true);
  assert.equal(webhook.includes('تصرف كمساعد محادثة ذكي جدًا، وليس كبوت ردود جاهزة'), true);
  assert.equal(webhook.includes("event.platform === 'whatsapp' && isWhatsappEmotionalMessage(event.content)"), false);
});


test('WhatsApp follow-up questions recover from bad AI handoffs', () => {
  assert.equal(webhook.includes('conversationRecoveryFallback'), true);
  assert.equal(webhook.includes('looksLikeBusinessWorkRequest'), true);
  assert.equal(webhook.includes('عن ايش تعتذر'), true);
  assert.equal(webhook.includes('unjustifiedHandoff'), true);
  assert.equal(webhook.includes('محاولة تصحيح إلزامية'), true);
});


test('OpenAI chat-latest uses max_completion_tokens and logs provider success', () => {
  assert.equal(webhook.includes('max_completion_tokens: maxTokens'), true);
  assert.equal(webhook.includes("provider: 'openai'"), true);
  assert.equal(webhook.includes("Social AI provider success"), true);
});


test('OpenAI chat-latest omits unsupported temperature', () => {
  const start = webhook.indexOf("if (process.env.OPENAI_API_KEY)");
  const end = webhook.indexOf("const geminiKey =", start);
  const openaiBlock = webhook.slice(start, end);
  assert.equal(openaiBlock.includes('max_completion_tokens: maxTokens'), true);
  assert.equal(openaiBlock.includes('\n          temperature,'), false);
});
