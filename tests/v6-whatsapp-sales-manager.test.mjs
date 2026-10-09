import test from 'node:test';
import assert from 'node:assert/strict';
import { planWhatsAppSalesTurn, salesHandoffSummary } from '../lib/v6/whatsapp-sales-manager.js';

function turn(message, previous = {}, history = []) {
  return planWhatsAppSalesTurn({ message, previous, history });
}

test('Sales starts with one focused service question, not generic handoff', () => {
  const result = turn('السلام عليكم، أبغى أعرف خدماتكم');
  assert.equal(result.active, true);
  assert.equal(result.state.step, 'service');
  assert.match(result.reply, /أي خدمة/);
});

test('Sales recognizes a known service and asks about business outcome', () => {
  const result = turn('السلام عليكم، كم سعر موقع إلكتروني؟');
  assert.equal(result.state.service, 'website');
  assert.equal(result.state.step, 'goal');
  assert.doesNotMatch(result.reply, /\d+\s*ريال/);
});

test('Short نعم follows responsible-person context', () => {
  const result = turn('نعم', {}, [
    { role: 'assistant', text: 'هل حضرتك الشخص المسؤول عن تطوير الأعمال؟' },
    { role: 'customer', text: 'نعم' }
  ]);
  assert.equal(result.active, true);
  assert.equal(result.state.decision_maker, true);
});

test('No sales conversation is hijacked from greetings alone', () => {
  assert.equal(turn('صباح الخير'), null);
  assert.equal(turn('شكرًا جزيلاً'), null);
});

test('Customer opt-out is respected on subsequent turns', () => {
  const stop = turn('لا ترسل رسائل');
  assert.equal(stop.state.stage, 'opted_out');
  const later = turn('هل رأيت رسالتي؟', stop.state);
  assert.equal(later.suppress, true);
});

test('Direct human request bypasses all qualification steps', () => {
  const result = turn('أبغى أكلم موظف');
  assert.equal(result.handoff, true);
  assert.equal(result.reason, 'customer_requested_human');
});

test('Collected scope, timeline and optional budget are preserved across messages', () => {
  let s = turn('أبغى متجر إلكتروني لبيع المنتجات لشركتنا شركة التجارة الحديثة').state;
  assert.equal(s.service, 'ecommerce');
  s = turn('نحتاج بيع المنتجات بالجملة والتجزئة', s).state;
  s = turn('التجارة الحديثة', s).state;
  assert.ok(s.company);
  const scope = turn('حوالي 100 منتج، بيع جملة وتجزئة', s);
  assert.equal(scope.state.step, 'timeline');
  const date = turn('خلال شهرين', scope.state);
  assert.equal(date.state.step, 'budget');
  const noBudget = turn('ما عندي', date.state);
  assert.equal(noBudget.state.skipped.budget, true);
  assert.equal(noBudget.state.step, 'decision_maker');
});

test('Confirmation is necessary before qualified handoff', () => {
  const prior = {
    stage: 'confirming', step: 'confirm',
    company: 'شركة التنين الحديثة', service: 'ecommerce',
    service_label: 'متجر إلكتروني', goal: 'عرض المنتجات'
  };
  const yes = turn('نعم', prior);
  assert.equal(yes.handoff, true);
  assert.equal(yes.reason, 'customer_confirmed_requirements');
  assert.equal(yes.state.stage, 'awaiting_team');
  assert.equal(turn('متى ترسلوا السعر؟', yes.state).suppress, true);
  const no = turn('لا', prior);
  assert.equal(no.handoff, undefined);
  assert.equal(no.state.step, 'goal');
});

test('Handoff summary does not invent prices or customer details', () => {
  const plan = turn('أبغى موظف', { service: 'website', service_label: 'موقع إلكتروني', stage: 'qualifying' });
  const summary = salesHandoffSummary(plan, { platform: 'whatsapp', author_external_id: '966555000000' });
  assert.equal(summary.customer_phone, '966555000000');
  assert.equal(summary.budget, null);
  assert.equal(summary.pricing_status, 'pending_human_review');
  assert.equal(summary.owner_approved_price, false);
});
