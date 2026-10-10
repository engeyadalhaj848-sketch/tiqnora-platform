import test from 'node:test';
import assert from 'node:assert/strict';
import { planWhatsAppSalesTurn, salesHandoffSummary } from '../lib/v6/whatsapp-sales-manager.js';
import { buildWhatsAppSalesCoachPrompt, assessWhatsAppSalesReply, whatsappSalesCoachFallback } from '../lib/v6/whatsapp-sales-coach.js';

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
  const s = { stage: 'qualifying', step: 'scope', service: 'ecommerce',
    service_label: 'متجر إلكتروني', goal: 'زيادة طلبات الجملة',
    company: 'التجارة الحديثة' };
  const scope = turn('حوالي 100 منتج، بيع جملة وتجزئة', s);
  assert.equal(scope.state.scope, 'حوالي 100 منتج، بيع جملة وتجزئة');
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

test('Unlinked affirmative reply to manual outreach asks rather than assuming', () => {
  const reply = turn('نعم');
  assert.equal(reply.state.step, 'decision_maker');
  assert.match(reply.reply, /هل حضرتك الشخص المسؤول/);
  assert.notEqual(reply.handoff, true);
});

test('Do not restart automation after an older specialist handoff', () => {
  const reply = turn('حسنًا', {}, [
    { role: 'assistant', text: 'شكراً لتفهمك، فريقنا سيتواصل معك قريبًا.' }
  ]);
  assert.equal(reply.suppress, true);
});


test('An interrupted goal question must not save a price question as a goal', () => {
  const prior = { stage: 'qualifying', step: 'goal', service: 'website', service_label: 'موقع إلكتروني' };
  const plan = turn('طيب كم سعر الموقع؟', prior);
  assert.equal(plan.state.goal, null);
  assert.equal(plan.state.step, 'goal');
});

test('An interrupted company or scope question must not poison customer profile', () => {
  const company = turn('بكم طيب؟', { stage: 'qualifying', step: 'company', service: 'website', service_label: 'موقع إلكتروني', goal: 'عرض خدماتنا' });
  assert.equal(company.state.company, null);
  assert.equal(company.state.step, 'company');
  const scope = turn('متى تخلصون؟', { stage: 'qualifying', step: 'scope', service: 'website', service_label: 'موقع إلكتروني', goal: 'طلبات أكثر', company: 'شركة التنين' });
  assert.equal(scope.state.scope, null);
  assert.equal(scope.state.step, 'scope');
});

test('Asking for a person mid-qualification does not set bogus company or scope', () => {
  const result = turn('ابغى اكلم احد من المبيعات', { stage: 'qualifying', step: 'company', service: 'website', service_label: 'موقع إلكتروني' });
  assert.equal(result.handoff, true);
  assert.equal(result.state.company, null);
  assert.equal(result.state.stage, 'awaiting_team');
});

test('Opt-out while awaiting a human still records the opt-out', () => {
  const result = turn('وقف الرسائل', { stage: 'awaiting_team', service: 'website' });
  assert.equal(result.state.stage, 'opted_out');
  assert.equal(result.deterministic, true);
  assert.equal(turn('وقف الرسائل', result.state).suppress, true);
});

test('Sales coach prioritizes answering the current question, not a rigid script', () => {
  const prompt = buildWhatsAppSalesCoachPrompt({
    plan: { state: { step: 'goal', service_label: 'موقع إلكتروني', company: 'شركة التنين' }, reply: 'ما هدفكم من الموقع؟' },
    event: { content: 'قبل ما نكمل كم يكلف؟' },
    history: [{ role: 'assistant', text: 'ما هدفكم من الموقع؟' }]
  });
  assert.match(prompt, /أجب عن سؤال العميل الحالي أولًا/);
  assert.match(prompt, /شركة التنين/);
  assert.match(prompt, /لا توجد أسعار مؤكدة/);
});

test('Sales coach quality gate rejects unapproved amounts, made-up actions and rambling', () => {
  const context = { plan: { state: { step: 'goal' } }, message: 'كم سعر الموقع؟' };
  assert.equal(assessWhatsAppSalesReply('سعر الموقع هو 5000 ريال ويشمل كل شيء.', context).ok, false);
  assert.equal(assessWhatsAppSalesReply('تم حجز موعد لك غدًا من غير أي تفاصيل إضافية.', context).ok, false);
  assert.equal(assessWhatsAppSalesReply('وش اسم الشركة؟ وكم الميزانية؟', context).ok, false);
  assert.equal(assessWhatsAppSalesReply('السعر يبدأ من باقة ثابتة تناسبك بالتأكيد.', context).ok, false);
  assert.equal(assessWhatsAppSalesReply('السعر يختلف حسب الصفحات والوظائف المطلوبة، وش أهم شيء تبي الموقع يسويه؟', context).ok, true);
});

test('Sales coach fallback answers the pricing concern instead of ignoring it', () => {
  const plan = { reply: 'وش هدفك من الموقع؟', state: { step: 'goal' } };
  const reply = whatsappSalesCoachFallback({ plan, message: 'كم السعر؟' });
  assert.match(reply, /السعر/);
  assert.match(reply, /وش هدفك/);
  const interrupted = whatsappSalesCoachFallback({ plan, message: 'كم السعر؟',
    history: [{ role: 'assistant', text: 'وش هدفك من الموقع؟' }] });
  assert.match(interrupted, /السعر/);
  assert.doesNotMatch(interrupted, /وش هدفك/);
});

test('Sales coach avoids repeating previous answer verbatim', () => {
  const reply = 'بالنسبة للسعر، يعتمد على حجم المشروع والوظائف المطلوبة. وش نوع موقعكم؟';
  const result = assessWhatsAppSalesReply(reply, { history: [{ role: 'assistant', text: reply }] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'repetitive');
});
