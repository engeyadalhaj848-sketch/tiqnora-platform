import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichLead, detectVertical, scoreLeadQuality, findMissingQualification,
  recommendServices, recommendNextAction
} from '../lib/v6/lead-enrichment.js';

function inbox(overrides = {}) {
  return {
    intent: 'sales',
    industry: null,
    service_interest: [],
    contact: {},
    location: { city: null, country: null },
    qualification: { budget: null, timeline: null, decision_maker: null, pain_points: [] },
    opportunity_score: { score: 40, reasons: [] },
    lead_payload: { custom_fields: {} },
    ...overrides
  };
}

test('1 dental clinic vertical and pack', async () => {
  const out = await enrichLead({ inbox_analysis: inbox({
    intent:'quote_request', industry:'dental_clinic',
    service_interest:['website','booking','whatsapp_automation'],
    contact:{ phone:'966500000000' },
    location:{ city:'المدينة المنورة', country:'SA' },
    opportunity_score:{ score:70, reasons:[] }
  })});
  assert.equal(out.vertical.id, 'dental_clinic');
  assert.equal(out.pack.name, 'Tiqnora for Dental Clinics');
  assert.ok(out.pack.recommended_agents.includes('booking'));
  assert.ok(out.services.primary.includes('website'));
});

test('2 restaurant lead recommendations are relevant', async () => {
  const out = await enrichLead({ inbox_analysis: inbox({
    industry:'restaurant', service_interest:['website','whatsapp_automation']
  })});
  assert.equal(out.vertical.id, 'restaurants');
  assert.ok(out.services.primary.includes('website'));
  assert.ok(out.services.primary.includes('whatsapp_automation'));
  assert.ok(out.services.secondary.includes('review_management') || out.services.secondary.includes('local_seo'));
});

test('3 real estate lead gets CRM and lead generation pack', async () => {
  const out = await enrichLead({ inbox_analysis: inbox({ industry:'real_estate', service_interest:['crm'] })});
  assert.equal(out.vertical.id, 'real_estate');
  assert.ok(out.services.primary.includes('crm'));
  assert.ok([...out.services.primary, ...out.services.secondary].includes('lead_generation'));
});

test('4 low-quality lead scores low', () => {
  const quality = scoreLeadQuality({ inbox_analysis: inbox({
    intent:'sales', opportunity_score:{ score:5, reasons:[] }
  })});
  assert.ok(quality.score < 30);
  assert.equal(quality.grade, 'low');
});

test('5 high-quality quote lead scores high or very high', () => {
  const quality = scoreLeadQuality({
    inbox_analysis: inbox({
      intent:'quote_request', industry:'clinic',
      service_interest:['website','booking','whatsapp_automation'],
      contact:{ phone:'966500000000', email:'a@example.com' },
      location:{ city:'المدينة المنورة', country:'SA' },
      qualification:{ budget:'8000', timeline:'خلال أسبوعين', decision_maker:true },
      opportunity_score:{ score:85, reasons:[] }
    }),
    lead:{ company_name:'عيادة النور', website:'https://example.com' },
    engagement_count:3
  });
  assert.ok(quality.score >= 80);
  assert.equal(quality.grade, 'very_high');
});

test('6 missing budget and timeline are surfaced', () => {
  const missing = findMissingQualification({
    inbox_analysis: inbox({
      industry:'restaurant',
      qualification:{ budget:null, timeline:null, decision_maker:true }
    })
  });
  assert.ok(missing.missing.includes('budget'));
  assert.ok(missing.missing.includes('timeline'));
  assert.ok(missing.recommended_questions.length > 0);
});

test('7 decision maker present is not missing', () => {
  const missing = findMissingQualification({
    inbox_analysis: inbox({
      industry:'clinic',
      qualification:{ budget:'5000', timeline:'هذا الشهر', decision_maker:true }
    })
  });
  assert.equal(missing.missing.includes('decision_maker'), false);
});

test('8 existing customer support is not treated as sales', async () => {
  const out = await enrichLead({ inbox_analysis: inbox({ intent:'existing_customer', industry:'clinic' })});
  assert.equal(out.quality.score, 0);
  assert.equal(out.next_best_action.action, 'support_handoff');
  assert.deepEqual(out.services.primary, []);
});

test('9 service recommendation reasons exist', () => {
  const services = recommendServices({
    inbox_analysis: inbox({ intent:'sales', industry:'restaurant', service_interest:['website'] })
  });
  assert.ok(services.primary.includes('website'));
  assert.ok(services.reasons.website);
});

test('10 quality score is deterministic', () => {
  const input = {
    inbox_analysis: inbox({
      intent:'quote_request', industry:'real_estate',
      service_interest:['crm','whatsapp_automation'],
      contact:{ phone:'966500000000' },
      opportunity_score:{ score:65, reasons:[] }
    }),
    lead:{ company_name:'مكتب عقاري' }
  };
  assert.deepEqual(scoreLeadQuality(input), scoreLeadQuality(input));
});

test('11 booking intent proposes meeting', () => {
  const action = recommendNextAction(
    { inbox_analysis: inbox({ intent:'booking', industry:'salon' }) },
    { score:55, grade:'medium', reasons:[], missing_data:[] },
    { missing:['budget'], recommended_questions:[] }
  );
  assert.equal(action.action, 'propose_meeting');
});

test('12 all requested vertical families map correctly', () => {
  const cases = {
    clinic:'clinics',
    dental_clinic:'dental_clinic',
    real_estate:'real_estate',
    restaurant:'restaurants',
    hotel:'hotels',
    salon:'salons',
    retail:'retail',
    contracting:'contracting',
    professional_services:'professional_services'
  };
  for (const [industry, expected] of Object.entries(cases)) {
    assert.equal(detectVertical({ industry }).id, expected);
  }
});
