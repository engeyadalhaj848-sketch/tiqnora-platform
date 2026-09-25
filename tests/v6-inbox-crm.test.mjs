import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeInboxEvent, matchExistingLead, normalizeContact, normalizePhone, calculateInitialOpportunityScore
} from '../lib/v6/inbox-crm.js';

test('1 restaurant website and whatsapp becomes sales lead', async () => {
  const out = await analyzeInboxEvent({ platform:'whatsapp', author_name:'محمد', phone:'0512345678', content:'أبغى موقع لمطعم وربطه بالواتساب' });
  assert.equal(out.intent, 'sales');
  assert.equal(out.industry, 'restaurant');
  assert.deepEqual(out.service_interest.sort(), ['website','whatsapp_automation'].sort());
  assert.equal(out.crm.should_create_lead, true);
  assert.equal(out.contact.phone, '966512345678');
});

test('2 clinic website price becomes quote request', async () => {
  const out = await analyzeInboxEvent({ platform:'instagram', content:'كم سعر تصميم موقع عيادة؟' });
  assert.equal(out.intent, 'quote_request');
  assert.equal(out.crm.should_create_lead, true);
});

test('3 existing booking change does not create lead', async () => {
  const out = await analyzeInboxEvent({ platform:'whatsapp', content:'حجزت معكم أمس وأبغى أغير الموعد' });
  assert.equal(out.intent, 'existing_customer');
  assert.equal(out.crm.should_create_lead, false);
});

test('4 service not working is support', async () => {
  const out = await analyzeInboxEvent({ platform:'website_chat', content:'الخدمة ما اشتغلت عندي' });
  assert.equal(out.intent, 'support');
  assert.equal(out.crm.should_create_lead, false);
});

test('5 spam does not create lead', async () => {
  const out = await analyzeInboxEvent({ platform:'instagram', content:'FREE MONEY crypto giveaway اضغط الرابط للفوز' });
  assert.equal(out.intent, 'spam');
  assert.equal(out.crm.should_create_lead, false);
  assert.equal(out.opportunity_score.score, 0);
});

test('6 same phone across channels matches', () => {
  const contact = normalizeContact({ platform:'whatsapp', phone:'0512345678', author_name:'محمد' });
  const match = matchExistingLead(contact, [{ id:'l1', phone:'+966 51 234 5678', contact_name:'Mohammed' }]);
  assert.equal(match.match_type, 'phone');
  assert.equal(match.auto_merge, true);
});

test('7 same name only never auto merges', () => {
  const contact = normalizeContact({ platform:'instagram', author_name:'محمد' });
  const match = matchExistingLead(contact, [{ id:'l1', contact_name:'محمد' }]);
  assert.equal(match.match_type, 'name_suggestion');
  assert.equal(match.auto_merge, false);
});

test('8 Saudi phone normalization', () => {
  assert.equal(normalizePhone('05 1234 5678'), '966512345678');
  assert.equal(normalizePhone('+966512345678'), '966512345678');
});

test('9 strong lead score is deterministic', () => {
  const out = calculateInitialOpportunityScore({
    event:{ platform:'whatsapp', content:'أنا صاحب عيادة وأحتاج موقع وحجز وواتساب خلال أسبوع، ميزانية 5000 ريال' },
    intent:'quote_request',
    contact:{ phone:'966512345678' },
    entities:{ industry:'clinic', service_interest:['website','booking','whatsapp_automation'], qualification:{ budget:'5000', timeline:'أسبوع', decision_maker:true } }
  });
  assert.ok(out.score >= 70);
  assert.ok(out.reasons.length >= 5);
});

test('10 payloads map to migration 046', async () => {
  const out = await analyzeInboxEvent({
    platform:'whatsapp', external_user_id:'wa-demo', external_thread_id:'thread-1',
    external_message_id:'msg-1', author_name:'محمد', phone:'0512345678',
    content:'أبغى موقع لمطعم وربطه بالواتساب', received_at:'2026-09-25T00:00:00.000Z'
  });
  assert.equal(out.lead_payload.pipeline_stage, 'contacted');
  assert.equal(out.conversation_payload.external_thread_id, 'thread-1');
  assert.equal(out.message_payload.direction, 'inbound');
  assert.equal(out.message_payload.external_message_id, 'msg-1');
});
