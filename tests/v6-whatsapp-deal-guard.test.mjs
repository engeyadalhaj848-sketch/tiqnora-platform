import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessCommercialHandoff, isProtectedDealState } from '../lib/v6/whatsapp-deal-guard.js';
import { planWhatsAppSalesTurn } from '../lib/v6/whatsapp-sales-manager.js';

test('Persisted negotiation/contract stages always suppress auto qualification', () => {
  for (const stage of ['proposal_sent', 'negotiating', 'agreement_in_principle', 'contracting', 'active_project', 'awaiting_team']) {
    assert.equal(isProtectedDealState({ stage }), true, stage);
    const result = assessCommercialHandoff({ message: 'السلام عليكم', salesState: { stage } });
    assert.equal(result.protect, true, stage);
    assert.equal(result.existing, true);
  }
});

test('Deal states in CRM also suppress automation even after takeover timeout', () => {
  assert.equal(isProtectedDealState({}, { pipeline_stage: 'closed_won' }), true);
  assert.equal(isProtectedDealState({}, { custom_fields: { sales_manager: { automation_paused: true } } }), true);
  assert.equal(isProtectedDealState({}, { pipeline_stage: 'contacted' }), false);
});

test('Customer proposal acceptance pauses AI without fabricating deal details', () => {
  const cases = [
    'نؤكد موافقتنا المبدئية على الخطة والتكلفة المقترحة',
    'تم الاتفاق على السعر',
    'تمام متفقون.. ومستمرون 👍🤍',
    'اتفقنا على 4,000 ريال خلال 30 يومًا'
  ];
  for (const message of cases) {
    const result = assessCommercialHandoff({ message });
    assert.equal(result.protect, true, message);
    assert.equal(result.existing, false);
  }
});

test('Unrelated WhatsApp conversations continue normally', () => {
  for (const message of ['السلام عليكم', 'كم سعر تصميم موقع؟', 'أحتاج موقع متجر', 'تمام']) {
    assert.equal(assessCommercialHandoff({ message }).protect, false, message);
  }
  assert.equal(assessCommercialHandoff({ message: 'تمام', history: [
    { role: 'assistant', text: 'هل ترغب بتصميم موقع أو متجر؟' }
  ] }).protect, false);
});

test('Short affirmation with prior commercial context requires human review', () => {
  const r = assessCommercialHandoff({
    message: 'متفقون',
    history: [{ role: 'assistant', text: 'سبق أن أرسلنا عرض سعر المشروع.' }]
  });
  assert.equal(r.protect, true);
  assert.equal(r.reason, 'affirmed_commercial_context');
});

test('Historical customer agreement protects new followups', () => {
  const r = assessCommercialHandoff({
    message: 'هل وصل التوثيق؟',
    history: [{ role: 'customer', text: 'نؤكد موافقتنا على العرض' }]
  });
  assert.equal(r.protect, true);
});

test('Sales manager does not ask budget twice when previously discussed', () => {
  const previous = {
    stage: 'qualifying', service: 'website', service_label: 'موقع إلكتروني',
    company: 'شركة اختبار', goal: 'عرض خدمات الشركة', scope: 'موقع تعريفي',
    timeline: 'شهر', budget: null, step: 'timeline'
  };
  const result = planWhatsAppSalesTurn({
    message: 'متابعة الشغل', previous,
    history: [
      { role: 'customer', text: 'مناقشة التكلفة والدفعات' },
      { role: 'assistant', text: 'تكلفة المشروع تعتمد على النطاق' }
    ]
  });
  assert.notEqual(result.state.step, 'budget');
  assert.equal(result.state.skipped.budget, true);
});

test('Webhook checks CRM deal status before short human-takeover timer and before sending', () => {
  const source = readFileSync(new URL('../api/social/webhook.js', import.meta.url), 'utf8');
  const beforeTakeover = source.indexOf('assessCommercialHandoff({');
  const humanTakeover = source.indexOf('if (event.platform === \'whatsapp\') {', beforeTakeover);
  assert.ok(beforeTakeover > 0 && humanTakeover > beforeTakeover);
  assert.match(source, /automation_paused: true/);
  assert.match(source, /reason: 'deal_context_unavailable'/);
  assert.match(source, /actionType: 'commercial_handoff'/);
});
