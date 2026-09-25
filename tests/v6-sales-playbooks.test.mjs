import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesPlaybookResult, buildQualificationPlan, evaluateQuoteReadiness, recommendFollowUp } from '../lib/v6/sales-playbooks.js';

function base(overrides = {}) {
  return {
    inbox_analysis: {
      intent:'sales',
      industry:'dental_clinic',
      service_interest:['website','booking_system','whatsapp_automation'],
      contact:{ phone:'966500000000' },
      location:{ city:'المدينة المنورة', country:'SA' },
      qualification:{ budget:null, timeline:null, decision_maker:null },
      opportunity_score:{ score:60, reasons:[] }
    },
    enrichment: {
      vertical:{ id:'dental_clinic', confidence:.95 },
      pack:{ name:'Tiqnora for Dental Clinics', recommended_pipeline:'clinic_sales', recommended_agents:['sales','booking','reputation','social'] },
      quality:{ score:70, grade:'high', reasons:[], missing_data:[] },
      services:{ primary:['website','booking_system','whatsapp_automation'], secondary:['review_management'] }
    },
    lead:{ custom_fields:{} },
    conversation:{ message_count:1, unanswered_inbound:false },
    ...overrides
  };
}

test('1 dental incomplete qualification asks only next question', () => {
  const out = buildSalesPlaybookResult(base());
  assert.equal(out.playbook.vertical_id, 'dental_clinic');
  assert.equal(out.qualification.next_question, 'هل لديكم موقع حالي؟');
  assert.equal(out.qualification.max_questions_per_reply, 1);
  assert.equal(out.action.action, 'ask_qualification');
});

test('2 dental quote ready prepares quote without price invention', () => {
  const input = base({
    inbox_analysis:{
      ...base().inbox_analysis,
      intent:'quote_request',
      qualification:{ budget:'8000', timeline:'خلال أسبوعين', decision_maker:true }
    },
    lead:{
      website:'https://clinic.example',
      whatsapp:'966500000000',
      custom_fields:{ has_website:true, has_booking:true, has_whatsapp_business:true, branch_count:1 }
    }
  });
  const out = buildSalesPlaybookResult(input);
  assert.equal(out.quote_readiness.ready, true);
  assert.equal(out.action.action, 'prepare_quote');
  assert.equal(out.approval.invent_prices, false);
});

test('3 restaurant medium lead gets qualification or follow-up strategy', () => {
  const input=base({
    inbox_analysis:{...base().inbox_analysis, industry:'restaurant'},
    enrichment:{
      vertical:{id:'restaurants',confidence:.95},
      pack:{name:'Tiqnora for Restaurants',recommended_pipeline:'restaurant_sales',recommended_agents:['sales','social','reputation','booking']},
      quality:{score:48,grade:'medium',reasons:[],missing_data:[]},
      services:{primary:['website','whatsapp_automation','booking_system'],secondary:['review_management']}
    }
  });
  const out=buildSalesPlaybookResult(input);
  assert.equal(out.playbook.vertical_id,'restaurants');
  assert.equal(out.action.action,'ask_qualification');
});

test('4 real estate high quality lead uses real-estate playbook', () => {
  const input=base({
    inbox_analysis:{...base().inbox_analysis,industry:'real_estate'},
    enrichment:{
      vertical:{id:'real_estate',confidence:.95},
      pack:{name:'Tiqnora for Real Estate',recommended_pipeline:'real_estate_sales',recommended_agents:['sales','lead_research','follow_up','social']},
      quality:{score:88,grade:'very_high',reasons:[],missing_data:[]},
      services:{primary:['crm','whatsapp_automation','lead_generation'],secondary:[]}
    },
    lead:{custom_fields:{has_crm:true,inventory_type:'بيع',lead_volume:'50',sales_team_size:4},website:'https://real.example'},
    qualification:{timeline:'هذا الشهر',budget:'12000',decision_maker:true}
  });
  const out=buildSalesPlaybookResult(input);
  assert.equal(out.playbook.vertical_id,'real_estate');
  assert.ok(['create_opportunity','propose_meeting'].includes(out.action.action));
});

test('5 booking request proposes meeting and same-day follow-up', () => {
  const input=base({inbox_analysis:{...base().inbox_analysis,intent:'booking'}});
  const out=buildSalesPlaybookResult(input);
  assert.equal(out.action.action,'propose_meeting');
  assert.equal(out.follow_up.cadence,'same_day');
});

test('6 quote request not ready asks qualification', () => {
  const input=base({inbox_analysis:{...base().inbox_analysis,intent:'quote_request'}});
  const out=buildSalesPlaybookResult(input);
  assert.equal(out.quote_readiness.ready,false);
  assert.equal(out.action.action,'ask_qualification');
});

test('7 unanswered sales conversation gets follow-up recommendation', () => {
  const input=base({conversation:{unanswered_inbound:true,message_count:4}});
  const follow=recommendFollowUp(input);
  assert.equal(follow.recommended,true);
  assert.equal(follow.cadence,'next_day');
});

test('8 existing customer support is handed off, not sold to', () => {
  const input=base({inbox_analysis:{...base().inbox_analysis,intent:'existing_customer'}});
  const out=buildSalesPlaybookResult(input);
  assert.equal(out.action.action,'support_handoff');
  assert.equal(out.follow_up.recommended,false);
});

test('9 spam gets no action and no follow-up', () => {
  const input=base({inbox_analysis:{...base().inbox_analysis,intent:'spam'}});
  const out=buildSalesPlaybookResult(input);
  assert.equal(out.action.action,'no_action');
  assert.equal(out.follow_up.cadence,'no_follow_up');
});

test('10 never returns automatic outbound execution', () => {
  const cases=['sales','quote_request','booking','support','existing_customer','spam'];
  for(const intent of cases){
    const out=buildSalesPlaybookResult(base({inbox_analysis:{...base().inbox_analysis,intent}}));
    assert.equal(out.action.execute_automatically,false);
    assert.equal(out.approval.auto_send,false);
    assert.equal(out.approval.auto_schedule,false);
  }
});

test('11 qualification plan exposes only one next question', () => {
  const q=buildQualificationPlan(base());
  assert.equal(typeof q.next_question,'string');
  assert.equal(q.max_questions_per_reply,1);
  assert.ok(Array.isArray(q.remaining_questions));
  assert.ok(q.remaining_questions.every(x=>x.question!==q.next_question));
});

test('12 deterministic same input returns same result', () => {
  const input=base();
  assert.deepEqual(buildSalesPlaybookResult(input),buildSalesPlaybookResult(input));
});
