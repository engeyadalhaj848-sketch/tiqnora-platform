import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProposalDeliveryAction,
  formatProposalForDelivery,
  chooseProposalDeliveryEvent
} from '../lib/v6/proposal-delivery.js';

function approved(overrides = {}) {
  return {
    id:'a1',
    action_type:'proposal_review',
    status:'approved',
    lead_id:'l1',
    conversation_id:'c1',
    payload:{
      proposal:{
        status:'ready_for_human_review',
        language:'ar',
        title:'مسودة عرض — عيادة النور',
        client:{name:'عيادة النور',vertical:'dental_clinic'},
        executive_summary:'عرض مبني على احتياج العميل المسجل.',
        recommended_solution:[
          {service:'website',label:'الموقع الإلكتروني'},
          {service:'booking_system',label:'نظام الحجز'}
        ],
        timeline:{status:'customer_provided',requested_timeline:'خلال أكتوبر'},
        pricing:{
          status:'confirmed_input',
          currency:'SAR',
          subtotal:5000,
          vat:750,
          total:5750,
          line_items:[{service:'website',price:3000},{service:'booking_system',price:2000}]
        }
      }
    },
    ...overrides
  };
}

test('1 approved ready proposal with confirmed pricing can be delivered', () => {
  assert.equal(validateProposalDeliveryAction(approved()).ready,true);
});

test('2 pending proposal cannot be delivered', () => {
  const action=approved({status:'pending_approval'});
  assert.equal(validateProposalDeliveryAction(action).ready,false);
  assert.ok(validateProposalDeliveryAction(action).reasons.includes('human_approval_required'));
});

test('3 incomplete proposal cannot be delivered', () => {
  const action=approved();
  action.payload.proposal.status='draft_incomplete';
  assert.ok(validateProposalDeliveryAction(action).reasons.includes('proposal_not_ready'));
});

test('4 unconfirmed pricing blocks delivery', () => {
  const action=approved();
  action.payload.proposal.pricing={status:'requires_human_pricing',currency:'SAR',total:null,line_items:[]};
  assert.ok(validateProposalDeliveryAction(action).reasons.includes('confirmed_pricing_required'));
});

test('5 Arabic delivery includes only confirmed price and provided timeline', () => {
  const text=formatProposalForDelivery(approved().payload.proposal,{language:'ar'});
  assert.match(text,/5[٬,]?750|٥/);
  assert.match(text,/خلال أكتوبر/);
  assert.match(text,/الموقع الإلكتروني/);
});

test('6 missing VAT and timeline are not invented', () => {
  const proposal=approved().payload.proposal;
  proposal.pricing.vat=null;
  proposal.timeline={status:'needs_confirmation',requested_timeline:null};
  const text=formatProposalForDelivery(proposal,{language:'ar'});
  assert.equal(text.includes('ضريبة القيمة المضافة'),false);
  assert.equal(text.includes('المدة المطلوبة من العميل'),false);
});

test('7 English delivery format is supported', () => {
  const proposal=approved().payload.proposal;
  proposal.language='en';
  const text=formatProposalForDelivery(proposal,{language:'en'});
  assert.match(text,/Confirmed pricing/);
  assert.match(text,/Requested timeline/);
});

test('8 delivery message stays within WhatsApp text limit', () => {
  const proposal=approved().payload.proposal;
  proposal.executive_summary='x'.repeat(10000);
  const text=formatProposalForDelivery(proposal,{maxLength:3900});
  assert.ok(text.length<=3900);
});

test('9 chooses latest compatible CRM event from supplied order', () => {
  const events=[
    {id:'e1',platform:'whatsapp',event_type:'message.received',lead_id:'l1',conversation_id:'c1'},
    {id:'e2',platform:'tiktok',event_type:'message.received',lead_id:'l1',conversation_id:'c1'}
  ];
  assert.equal(chooseProposalDeliveryEvent(events,approved()).id,'e1');
});

test('10 mismatched conversation is not selected', () => {
  const events=[{id:'e1',platform:'whatsapp',event_type:'message.received',lead_id:'l1',conversation_id:'other'}];
  assert.equal(chooseProposalDeliveryEvent(events,approved()),null);
});
