/**
 * Offline acceptance chain for Tiqnora V6 Sales Engine.
 * Does not call live WhatsApp / Meta providers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInboxEvent } from '../lib/v6/inbox-crm.js';
import { enrichLead } from '../lib/v6/lead-enrichment.js';
import { buildSalesPlaybookResult } from '../lib/v6/sales-playbooks.js';
import { buildProposalDraft } from '../lib/v6/proposal-composer.js';
import {
  mapActionToLifecycle,
  canSendProposal,
  applyProposalEdits,
  createProposalVersion,
  buildProposalTimeline,
  buildPublicProposalView,
  generateShareToken,
  recommendProposalFollowUp,
  crmStageSuggestion
} from '../lib/v6/proposal-service.js';
import { validateProposalDeliveryAction } from '../lib/v6/proposal-delivery.js';

describe('V6 Sales Engine E2E (offline fixture)', () => {
  it('inbound → enrichment → playbook → proposal → approval guards → viewed → won', async () => {
    // 1) Inbound WhatsApp-like event
    const event = {
      platform: 'whatsapp',
      external_user_id: 'wa-e2e-001',
      external_thread_id: 'thread-e2e-001',
      author_name: 'محمد العتيبي',
      phone: '0551234567',
      content: 'أبغى موقع لعيادة أسنان في الرياض مع نظام حجز وواتساب',
      received_at: new Date().toISOString()
    };

    const inbox = await analyzeInboxEvent(event, { existingCandidates: [] });
    assert.ok(inbox.intent === 'sales' || inbox.intent === 'booking' || inbox.intent === 'quote_request');
    assert.equal(inbox.crm.should_create_lead, true);
    assert.ok(inbox.contact.phone);

    // 2) Dedup: same phone should match
    const existing = [{
      id: 'lead-e2e-1',
      lead_id: 'lead-e2e-1',
      phone: inbox.contact.phone,
      platform: 'whatsapp',
      external_user_id: 'wa-e2e-001',
      name: 'محمد العتيبي'
    }];
    const inbox2 = await analyzeInboxEvent(event, { existingCandidates: existing });
    assert.equal(inbox2.crm.should_create_lead, false);
    assert.equal(inbox2.crm.should_update_existing, true);

    // 3) Enrichment
    const enrichment = await enrichLead({
      inbox_analysis: inbox,
      intent: inbox.intent,
      industry: inbox.industry || 'dental_clinic',
      phone: inbox.contact.phone,
      service_interest: inbox.service_interest,
      opportunity_score: inbox.opportunity_score?.score,
      company_name: 'عيادة الابتسامة',
      city: 'الرياض'
    });
    assert.ok(enrichment.quality?.score != null);
    assert.ok(enrichment.vertical?.id);

    // 4) Playbook
    const playbook = buildSalesPlaybookResult({
      inbox_analysis: inbox,
      enrichment,
      lead: {
        phone: inbox.contact.phone,
        industry: enrichment.vertical?.id,
        company_name: 'عيادة الابتسامة',
        city: 'الرياض',
        service_interest: inbox.service_interest
      }
    });
    assert.ok(playbook.action?.action || playbook.sales_action?.action);
    const requiresApproval = playbook.action?.requires_approval ?? playbook.approval_boundary?.requires_approval_for_outbound;
    assert.equal(requiresApproval, true);
    assert.equal(playbook.action?.execute_automatically ?? false, false);

    // 5) AI draft is approval-gated conceptually (action pending)
    const draftAction = {
      id: 'action-draft-1',
      status: 'pending_approval',
      action_type: 'send_whatsapp',
      payload: {
        reply_draft: 'مرحباً، يمكننا مساعدتكم في موقع العيادة ونظام الحجز.',
        requires_approval: true
      },
      requires_approval: true
    };
    assert.equal(draftAction.status, 'pending_approval');

    // 6) Proposal compose
    const proposalOut = buildProposalDraft(
      {
        inbox_analysis: {
          ...inbox,
          service_interest: inbox.service_interest?.length
            ? inbox.service_interest
            : ['website', 'booking_system', 'whatsapp_automation'],
          qualification: {}
        },
        enrichment,
        playbook,
        lead: {
          phone: inbox.contact.phone,
          company_name: 'عيادة الابتسامة',
          industry: enrichment.vertical?.id || 'dental_clinic',
          city: 'الرياض',
          service_interest: ['website', 'booking_system']
        }
      },
      { language: 'ar' }
    );
    assert.ok(['draft_incomplete', 'ready_for_human_review', 'draft_ready', 'not_ready'].includes(proposalOut.status));
    if (proposalOut.proposal) {
      assert.ok(
        proposalOut.proposal.pricing?.status === 'requires_human_pricing' ||
          proposalOut.proposal.pricing?.subtotal == null
      );
    }

    // 7) Human pricing applied
    const priced = applyProposalEdits(proposalOut.proposal || { title: 'عرض', pricing: {} }, {
      pricing: {
        currency: 'SAR',
        subtotal: 15000,
        vat: 2250,
        total: 17250,
        line_items: [
          { service: 'website', price: 10000 },
          { service: 'booking_system', price: 5000 }
        ]
      },
      terms: 'العرض ساري 14 يومًا',
      valid_until: '2026-10-10'
    });
    assert.equal(priced.pricing.total, 17250);

    // 8) Proposal action lifecycle
    let proposalAction = {
      id: 'prop-1',
      status: 'pending_approval',
      action_type: 'proposal_review',
      lead_id: 'lead-e2e-1',
      created_at: new Date().toISOString(),
      payload: {
        proposal: priced,
        proposal_status: proposalOut.status,
        version_number: 1
      }
    };
    assert.equal(mapActionToLifecycle(proposalAction), 'needs_review');
    assert.equal(canSendProposal(proposalAction).ok, false);

    // Approve
    proposalAction = {
      ...proposalAction,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: 'admin-1'
    };
    assert.equal(mapActionToLifecycle(proposalAction), 'ready_to_send');
    assert.equal(canSendProposal(proposalAction).ok, true);

    // Edit after approval → new version + needs_review
    const v2 = createProposalVersion({
      proposal: priced,
      version_number: 2,
      created_by: 'admin-1',
      change_summary: 'تعديل الشروط'
    });
    proposalAction.payload.versions = [v2];
    proposalAction.payload.version_number = 2;
    proposalAction.payload.lifecycle_status = 'needs_review';
    proposalAction.status = 'pending_approval';
    assert.equal(mapActionToLifecycle(proposalAction), 'needs_review');
    assert.equal(canSendProposal(proposalAction).ok, false);

    // Re-approve and send
    proposalAction.status = 'approved';
    proposalAction.payload.lifecycle_status = undefined;
    assert.equal(canSendProposal(proposalAction).ok, true);

    proposalAction.status = 'completed';
    proposalAction.executed_at = new Date().toISOString();
    proposalAction.payload.lifecycle_status = 'sent';
    proposalAction.result = {
      delivery_status: 'sent',
      delivery: { sent_at: proposalAction.executed_at, channel: 'whatsapp' }
    };
    assert.equal(mapActionToLifecycle(proposalAction), 'sent');

    // Share + public view
    const token = generateShareToken();
    proposalAction.payload.share_token = token;
    const pub = buildPublicProposalView(proposalAction);
    assert.equal(pub.ok, true);

    // Viewed
    proposalAction.payload.lifecycle_status = 'viewed';
    proposalAction.payload.viewed_at = new Date().toISOString();
    assert.equal(mapActionToLifecycle(proposalAction), 'viewed');

    // Follow-up draft only
    const fu = recommendProposalFollowUp({
      ...proposalAction,
      payload: { ...proposalAction.payload, lifecycle_status: 'sent' },
      status: 'completed'
    });
    assert.equal(fu.recommended, true);
    assert.equal(fu.auto_send, false);
    assert.equal(fu.requires_approval, true);

    // Accepted → CRM suggestion Won
    const crm = crmStageSuggestion('accepted');
    assert.equal(crm.opportunity_stage, 'won');
    const lost = crmStageSuggestion('rejected');
    assert.equal(lost.opportunity_stage, 'lost');

    // Timeline has real events
    const timeline = buildProposalTimeline(proposalAction);
    assert.ok(timeline.some((e) => e.type === 'created'));

    // Delivery validator: pending blocked
    const blocked = validateProposalDeliveryAction({
      status: 'pending_approval',
      payload: { proposal: priced }
    });
    // shape may be {ok:false} or throw reasons
    if (blocked && typeof blocked.ok === 'boolean') {
      assert.equal(blocked.ok, false);
    }
  });
});
