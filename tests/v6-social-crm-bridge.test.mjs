import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCrmActionableEvent,
  isDeliveryStatusEvent,
  persistDeliveryStatusEvent,
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


test('8 delivery status events are recognized without becoming inbound sales events', () => {
  const event={platform:'whatsapp',event_type:'message.status.delivered',external_parent_id:'wamid.out1'};
  assert.equal(isDeliveryStatusEvent(event),true);
  assert.equal(isCrmActionableEvent(event),false);
});

test('9 delivery status updates outbound CRM message and proposal action audit', async () => {
  const calls=[];
  const rest=async (path, options={}) => {
    calls.push({path,options});
    if (!options.method && path.startsWith('messages?')) {
      return [{
        id:'msg-out',
        conversation_id:'c1',
        ai_meta:{action_id:'a1',provider_message_id:'wamid.out1',delivery_status:'sent'}
      }];
    }
    if (!options.method && path.startsWith('conversations?')) {
      return [{id:'c1',lead_id:'l1',contact_id:'ct1'}];
    }
    if (!options.method && path.startsWith('actions?')) {
      return [{id:'a1',status:'completed',result:{outbound_external_id:'wamid.out1'}}];
    }
    if (!options.method && path.startsWith('social_events?organization_id=')) {
      return [{id:'out-event',raw_payload:{adapter:'tiqnora_outbound'},conversation_id:'c1',lead_id:'l1',contact_id:'ct1'}];
    }
    return [];
  };

  const out=await persistDeliveryStatusEvent({
    event:{
      platform:'whatsapp',
      event_type:'message.status.read',
      external_parent_id:'wamid.out1',
      occurred_at:'2026-09-25T12:00:00Z',
      raw_payload:{adapter:'ycloud',kind:'status'}
    },
    storedEvent:{id:'status-event'},
    organizationId:'org1',
    rest
  });

  assert.equal(out.status,'read');
  assert.equal(out.message_id,'msg-out');
  const messagePatch=calls.find(x=>x.path==='messages?id=eq.msg-out' && x.options.method==='PATCH');
  assert.ok(messagePatch);
  const messageBody=JSON.parse(messagePatch.options.body);
  assert.equal(messageBody.ai_meta.delivery_status,'read');
  assert.equal(messageBody.ai_meta.read_at,'2026-09-25T12:00:00Z');

  const actionPatch=calls.find(x=>x.path==='actions?id=eq.a1' && x.options.method==='PATCH');
  assert.ok(actionPatch);
  assert.equal(JSON.parse(actionPatch.options.body).result.delivery_status,'read');
});
