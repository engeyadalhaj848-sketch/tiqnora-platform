import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapActionToLifecycle,
  canSendProposal,
  buildProposalCard,
  createProposalVersion,
  applyProposalEdits,
  buildProposalTimeline,
  buildPublicProposalView,
  generateShareToken,
  recommendProposalFollowUp,
  prepareDeliveryMessage
} from '../lib/v6/proposal-service.js';

const baseProposal = {
  title: 'عرض تجريبي',
  client: { name: 'عميل', company_name: 'شركة', vertical: 'clinics' },
  executive_summary: 'ملخص',
  recommended_solution: [{ value: 'website', source: 'customer_request' }],
  pricing: { status: 'requires_human_pricing', currency: 'SAR', subtotal: null, total: null, line_items: [] },
  language: 'ar'
};

describe('proposal service lifecycle', () => {
  it('maps pending to needs_review', () => {
    assert.equal(mapActionToLifecycle({ status: 'pending_approval', payload: { proposal: baseProposal } }), 'needs_review');
  });

  it('maps approved with price to ready_to_send', () => {
    const action = {
      status: 'approved',
      payload: {
        proposal: {
          ...baseProposal,
          pricing: { currency: 'SAR', subtotal: 1000, total: 1000, line_items: [{ service: 'website', price: 1000 }] }
        }
      }
    };
    assert.equal(mapActionToLifecycle(action), 'ready_to_send');
  });

  it('blocks send without approval', () => {
    const gate = canSendProposal({
      id: '1',
      status: 'pending_approval',
      payload: { proposal: { ...baseProposal, pricing: { total: 1000, subtotal: 1000, line_items: [{ price: 1000 }] } } }
    });
    assert.equal(gate.ok, false);
    assert.ok(gate.reasons.includes('human_approval_required'));
  });

  it('blocks send without pricing', () => {
    const gate = canSendProposal({
      id: '1',
      status: 'approved',
      payload: { proposal: baseProposal }
    });
    assert.equal(gate.ok, false);
    assert.ok(gate.reasons.includes('pricing_required'));
  });

  it('allows send when approved and priced', () => {
    const gate = canSendProposal({
      id: '1',
      status: 'approved',
      payload: {
        proposal: {
          ...baseProposal,
          pricing: { total: 5000, subtotal: 5000, currency: 'SAR', line_items: [{ service: 'website', price: 5000 }] }
        }
      }
    });
    assert.equal(gate.ok, true);
  });

  it('builds card fields', () => {
    const card = buildProposalCard({
      id: 'a1',
      status: 'pending_approval',
      lead_id: 'L1',
      created_at: '2026-01-01T00:00:00Z',
      payload: { proposal: baseProposal, client_name: 'عميل' }
    });
    assert.equal(card.id, 'a1');
    assert.equal(card.lifecycle_status, 'needs_review');
    assert.equal(card.title, 'عرض تجريبي');
  });

  it('versions increment', () => {
    const v = createProposalVersion({ proposal: baseProposal, version_number: 2, change_summary: 'price' });
    assert.equal(v.version_number, 2);
    assert.ok(v.proposal_snapshot.title);
    assert.equal(v.change_summary, 'price');
  });

  it('apply edits does not invent prices', () => {
    const next = applyProposalEdits(baseProposal, { title: 'جديد', pricing: { currency: 'SAR' } });
    assert.equal(next.title, 'جديد');
    assert.equal(next.pricing.subtotal, null);
    assert.equal(next.pricing.status, 'requires_human_pricing');
  });

  it('accepts human pricing numbers only', () => {
    const next = applyProposalEdits(baseProposal, {
      pricing: { subtotal: 1200, vat: 180, total: 1380, currency: 'SAR', line_items: [{ service: 'website', price: 1200 }] }
    });
    assert.equal(next.pricing.total, 1380);
    assert.equal(next.pricing.line_items[0].status, 'confirmed');
  });

  it('timeline from real action fields only', () => {
    const timeline = buildProposalTimeline({
      created_at: '2026-01-01T10:00:00Z',
      approved_at: '2026-01-01T11:00:00Z',
      executed_at: '2026-01-01T12:00:00Z',
      payload: {
        proposal: baseProposal,
        versions: [{ version_number: 1, created_at: '2026-01-01T10:30:00Z', change_summary: 'init' }]
      },
      result: { delivery: { sent_at: '2026-01-01T12:00:00Z', channel: 'whatsapp' } }
    });
    assert.ok(timeline.length >= 3);
    assert.ok(timeline.some((e) => e.type === 'created'));
    assert.ok(timeline.some((e) => e.type === 'approved'));
  });

  it('public view hides draft', () => {
    const view = buildPublicProposalView({
      status: 'pending_approval',
      payload: { proposal: baseProposal }
    });
    assert.equal(view.ok, false);
  });

  it('public view for sent proposal', () => {
    const view = buildPublicProposalView({
      status: 'completed',
      payload: { proposal: baseProposal, lifecycle_status: 'sent' },
      result: { delivery_status: 'sent' }
    });
    assert.equal(view.ok, true);
    assert.ok(view.title);
  });

  it('share token is unguessable length', () => {
    const t = generateShareToken();
    assert.ok(t.length >= 20);
  });

  it('follow-up only after send', () => {
    const no = recommendProposalFollowUp({ status: 'approved', payload: {} });
    assert.equal(no.recommended, false);
    const yes = recommendProposalFollowUp({
      status: 'completed',
      executed_at: new Date().toISOString(),
      payload: { lifecycle_status: 'sent' },
      result: { delivery: { sent_at: new Date().toISOString() }, delivery_status: 'sent' }
    });
    assert.equal(yes.recommended, true);
    assert.equal(yes.auto_send, false);
    assert.equal(yes.requires_approval, true);
  });

  it('prepare delivery message blocked before approval', () => {
    const out = prepareDeliveryMessage({
      id: 'x',
      status: 'pending_approval',
      payload: { proposal: { ...baseProposal, pricing: { total: 100, subtotal: 100, line_items: [{ price: 100 }] } } }
    });
    assert.equal(out.ok, false);
  });

  it('deterministic card lifecycle', () => {
    const a = { status: 'approved', payload: { proposal: { ...baseProposal, pricing: { total: 10, subtotal: 10, line_items: [{ price: 10 }] } } } };
    assert.equal(mapActionToLifecycle(a), mapActionToLifecycle(a));
  });
});
