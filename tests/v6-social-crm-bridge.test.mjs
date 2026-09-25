import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCrmActionableEvent,
  buildExternalThreadId,
  socialEventToInboxEvent,
  planSocialCrmEvent
} from '../lib/v6/social-crm-bridge.js';

test('1 WhatsApp inbound maps phone and stable DM thread', () => {
  const event = {
    platform:'whatsapp', event_type:'message.received',
    external_event_id:'wamid.1', author_external_id:'+966512345678',
    author_name:'محمد', content:'أبغى موقع لمطعمي', occurred_at:'2026-09-25T08:00:00Z'
  };
  const mapped = socialEventToInboxEvent(event);
  assert.equal(mapped.phone, '966512345678');
  assert.equal(mapped.external_thread_id, 'dm:+966512345678');
  assert.equal(mapped.external_message_id, 'whatsapp:wamid.1');
});

test('2 comment thread separates authors on same post', () => {
  const a = buildExternalThreadId({ platform:'instagram', event_type:'comment.created', external_parent_id:'post-1', author_external_id:'u1', external_event_id:'c1' });
  const b = buildExternalThreadId({ platform:'instagram', event_type:'comment.created', external_parent_id:'post-1', author_external_id:'u2', external_event_id:'c2' });
  assert.notEqual(a, b);
  assert.equal(a, 'comment:post-1:u1');
});

test('3 passive and outbound echo events are not CRM actionable', () => {
  assert.equal(isCrmActionableEvent({ event_type:'message.status.delivered', content:'delivered' }), false);
  assert.equal(isCrmActionableEvent({ event_type:'message.sent', content:'hi' }), false);
  assert.equal(isCrmActionableEvent({
    event_type:'message.received', content:'hi', raw_payload:{ kind:'app_echo' }
  }), false);
});

test('4 own-account comment echo is not CRM actionable', () => {
  assert.equal(isCrmActionableEvent({
    event_type:'comment.created', content:'رد تيكنورا',
    author_external_id:'page1', account_external_id:'page1'
  }), false);
});

test('5 sales event reuses Inbox CRM and Lead Enrichment', async () => {
  const out = await planSocialCrmEvent({
    platform:'whatsapp', event_type:'message.received',
    external_event_id:'m2', author_external_id:'966512345678',
    author_name:'محمد', content:'أبغى موقع لمطعم وربطه بالواتساب'
  });
  assert.equal(out.skipped, false);
  assert.equal(out.analysis.intent, 'sales');
  assert.equal(out.analysis.industry, 'restaurant');
  assert.equal(out.enrichment.vertical.id, 'restaurants');
  assert.equal(out.analysis.crm.should_create_lead, true);
  assert.equal(out.playbook.playbook.vertical_id, 'restaurants');
  assert.equal(out.playbook.approval.auto_send, false);
});

test('6 support event stays out of sales lead creation', async () => {
  const out = await planSocialCrmEvent({
    platform:'instagram', event_type:'message.received',
    external_event_id:'m3', author_external_id:'ig-1',
    author_name:'سارة', content:'الخدمة ما اشتغلت عندي'
  });
  assert.equal(out.analysis.intent, 'support');
  assert.equal(out.analysis.crm.should_create_lead, false);
  assert.equal(out.enrichment.next_best_action.action, 'support_handoff');
});


test('7 sales bridge carries qualification and follow-up plan without auto-send', async () => {
  const out = await planSocialCrmEvent({
    platform:'instagram', event_type:'message.received',
    external_event_id:'m4', author_external_id:'ig-44',
    author_name:'عبدالله', content:'كم سعر موقع لعيادة أسنان؟'
  });
  assert.equal(out.analysis.intent, 'quote_request');
  assert.equal(out.playbook.playbook.vertical_id, 'dental_clinic');
  assert.ok(out.playbook.qualification.next_question);
  assert.equal(out.playbook.action.execute_automatically, false);
  assert.equal(out.playbook.approval.auto_schedule, false);
});
