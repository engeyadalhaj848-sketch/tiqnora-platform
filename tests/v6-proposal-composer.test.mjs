import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateProposalReadiness, buildProposalDraft, buildOpenQuestions,
  buildPricingPlaceholder, buildTimeline
} from '../lib/v6/proposal-composer.js';

function sample(overrides = {}) {
  return {
    inbox_analysis: {
      intent:'quote_request',
      industry:'dental_clinic',
      service_interest:['website','booking_system','whatsapp_automation'],
      contact:{ name:'محمد', phone:'966500000000' },
      location:{ city:'المدينة المنورة', country:'SA' },
      qualification:{ budget:null, timeline:null, decision_maker:null }
    },
    enrichment: {
      vertical:{ id:'dental_clinic', confidence:.95 },
      pack:{ name:'Tiqnora for Dental Clinics', recommended_pipeline:'clinic_sales' },
      services:{
        primary:['website','booking_system','whatsapp_automation'],
        secondary:['review_management','local_seo']
      },
      missing:{ missing:['budget','timeline','decision_maker'], recommended_questions:[] }
    },
    playbook: {
      qualification:{
        next_key:'has_website',
        next_question:'هل لديكم موقع حالي؟',
        remaining_questions:[
          {key:'has_booking',question:'هل يوجد نظام حجز؟'},
          {key:'has_whatsapp_business',question:'هل تستخدمون WhatsApp Business؟'},
          {key:'timeline',question:'متى ترغبون ببدء المشروع؟'},
          {key:'budget',question:'هل توجد ميزانية تقريبية؟'}
        ]
      },
      quote_readiness:{ ready:false, score:55, missing:['timeline','budget'] }
    },
    lead:{ company_name:'عيادة النور', phone:'966500000000', custom_fields:{} },
    ...overrides
  };
}

test('1 dental clinic proposal composes vertical-specific draft', () => {
  const out=buildProposalDraft(sample(),{language:'ar'});
  assert.equal(out.client.vertical,'dental_clinic');
  assert.ok(out.scope.some(x=>x.service==='booking_system'));
  assert.match(out.title,/عيادة النور/);
});

test('2 restaurant proposal uses restaurant vertical', () => {
  const input=sample({
    inbox_analysis:{...sample().inbox_analysis,industry:'restaurant',service_interest:['website','whatsapp_automation']},
    enrichment:{...sample().enrichment,vertical:{id:'restaurants',confidence:.95},services:{primary:['website','whatsapp_automation'],secondary:['review_management','local_seo']}},
    lead:{company_name:'مطعم الأصالة',phone:'966500000000',custom_fields:{}}
  });
  const out=buildProposalDraft(input);
  assert.equal(out.client.vertical,'restaurants');
  assert.match(out.title,/مطعم الأصالة/);
});

test('3 real estate proposal carries CRM solution', () => {
  const input=sample({
    inbox_analysis:{...sample().inbox_analysis,industry:'real_estate',service_interest:['crm','whatsapp_automation']},
    enrichment:{...sample().enrichment,vertical:{id:'real_estate',confidence:.95},services:{primary:['crm','whatsapp_automation','lead_generation'],secondary:[]}}
  });
  const out=buildProposalDraft(input);
  assert.ok(out.scope.some(x=>x.service==='crm'));
});

test('4 missing timeline remains explicit', () => {
  const out=buildProposalDraft(sample());
  assert.equal(out.timeline.status,'needs_confirmation');
  assert.equal(out.timeline.requested_timeline,null);
});

test('5 missing budget appears in readiness', () => {
  assert.ok(evaluateProposalReadiness(sample()).missing.includes('budget'));
});

test('6 incomplete quote remains draft incomplete', () => {
  const out=buildProposalDraft(sample());
  assert.equal(out.status,'draft_incomplete');
});

test('7 complete quote can reach human review', () => {
  const input=sample({
    inbox_analysis:{
      ...sample().inbox_analysis,
      qualification:{budget:'8000',timeline:'هذا الشهر',decision_maker:true}
    },
    confirmed_pricing:{
      currency:'SAR',subtotal:8000,vat:null,total:8000,
      line_items:[{service:'website',price:8000}]
    }
  });
  const out=buildProposalDraft(input);
  assert.equal(out.readiness.ready,true);
  assert.ok(['draft_ready','ready_for_human_review'].includes(out.status));
});

test('8 never invents price', () => {
  const pricing=buildPricingPlaceholder(sample());
  assert.equal(pricing.status,'requires_human_pricing');
  assert.equal(pricing.total,null);
  assert.ok(pricing.line_items.every(x=>x.price===null));
});

test('9 confirmed pricing passes through only as input', () => {
  const input=sample({confirmed_pricing:{currency:'SAR',subtotal:5000,vat:750,total:5750,line_items:[{service:'website',price:5000}]}});
  const p=buildPricingPlaceholder(input);
  assert.equal(p.status,'confirmed_input');
  assert.equal(p.total,5750);
  assert.equal(p.line_items[0].price,5000);
});

test('10 no invented timeline duration', () => {
  const input=sample({inbox_analysis:{...sample().inbox_analysis,qualification:{...sample().inbox_analysis.qualification,timeline:'خلال أكتوبر'}}});
  const timeline=buildTimeline(input);
  assert.equal(timeline.requested_timeline,'خلال أكتوبر');
  assert.equal(timeline.duration,null);
});

test('11 open questions are capped at five', () => {
  assert.ok(buildOpenQuestions(sample()).length<=5);
});

test('12 support case does not generate sales-ready proposal', () => {
  const input=sample({inbox_analysis:{...sample().inbox_analysis,intent:'support'}});
  const out=buildProposalDraft(input);
  assert.equal(out.status,'not_ready');
  assert.equal(out.next_step.action,'no_sales_proposal');
});

test('13 spam does not generate sales-ready proposal', () => {
  const input=sample({inbox_analysis:{...sample().inbox_analysis,intent:'spam'}});
  assert.equal(buildProposalDraft(input).status,'not_ready');
});

test('14 Arabic proposal uses Arabic title and summary', () => {
  const out=buildProposalDraft(sample(),{language:'ar'});
  assert.match(out.title,/مسودة عرض/);
  assert.match(out.executive_summary,/تم إعداد/);
});

test('15 English proposal uses English title and summary', () => {
  const out=buildProposalDraft(sample(),{language:'en'});
  assert.match(out.title,/Proposal Draft/);
  assert.match(out.executive_summary,/This draft proposal/);
});

test('16 approval always requires human review and forbids send', () => {
  for(const intent of ['sales','quote_request','booking','support','spam']){
    const out=buildProposalDraft(sample({inbox_analysis:{...sample().inbox_analysis,intent}}));
    assert.equal(out.approval.requires_human_review,true);
    assert.equal(out.approval.can_send,false);
    assert.equal(out.approval.auto_send,false);
  }
});

test('17 same input is deterministic', () => {
  const input=sample();
  assert.deepEqual(buildProposalDraft(input),buildProposalDraft(input));
});

test('18 uses Sales Playbook qualification questions first', () => {
  const out=buildProposalDraft(sample());
  assert.equal(out.open_questions[0].source,'sales_playbook');
  assert.equal(out.open_questions[0].key,'has_website');
});

test('19 uses Lead Enrichment recommended services with source', () => {
  const out=buildProposalDraft(sample());
  const seo=out.recommended_solution.find(x=>x.service==='local_seo');
  assert.ok(seo);
  assert.equal(seo.source,'vertical_recommendation');
});

test('20 does not mutate input objects', () => {
  const input=sample();
  const before=JSON.stringify(input);
  buildProposalDraft(input);
  assert.equal(JSON.stringify(input),before);
});
