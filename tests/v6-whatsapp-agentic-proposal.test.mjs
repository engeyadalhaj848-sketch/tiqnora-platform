import test from 'node:test';
import { applyProposalEdits } from '../lib/v6/proposal-service.js';
import {
  proposalReviewKeyboard, parseProposalReviewCallback,
  validateOwnerProposalDecision, proposalPricingFingerprint, handleWhatsAppProposalReviewCallback
} from '../lib/v6/whatsapp-proposal-telegram.js';
import { validateProposalDeliveryAction } from '../lib/v6/proposal-delivery.js';
import assert from 'node:assert/strict';
import {
  buildQualifiedWhatsAppProposal,
  proposalReviewNotice,
  persistQualifiedProposalWorkflow,
  queueQualifiedWhatsAppProposal
} from '../lib/v6/whatsapp-proposal-queue.js';

const qualified = {
  handoff_reason: 'customer_confirmed_requirements',
  service: 'ecommerce', service_label: 'متجر إلكتروني',
  company: 'متجر اختبار',
  customer_name: 'عميل تجريبي',
  customer_phone: '966500000000',
  goal: 'تنظيم المبيعات',
  scope: 'متجر بكتالوج 50 منتج',
  timeline: 'خلال شهر',
  budget: '2000',
  decision_maker: true
};

function fakeStore(existing = []) {
  const writes = [];
  const paths = [];
  const rest = async (path, options = {}) => {
    paths.push(path);
    if (path.startsWith('actions?')) return existing;
    if (path !== 'actions' || options.method !== 'POST') throw new Error('Unexpected write: ' + path);
    const row = JSON.parse(options.body);
    writes.push(row);
    return [{ id: 'review-action-1', ...row }];
  };
  return { writes, paths, rest };
}

test('confirmed inbound requirements create a review draft, never a price', () => {
  const built = buildQualifiedWhatsAppProposal({ summary: qualified });
  assert.equal(built.eligible, true);
  assert.equal(built.service, 'ecommerce');
  assert.equal(built.proposal.pricing.status, 'requires_human_pricing');
  assert.equal(built.proposal.pricing.total, null);
  assert.equal(built.proposal.approval.can_send, false);
  assert.equal(built.proposal.approval.auto_send, false);
  assert.equal(built.proposal.customer_requirements.requested_scope, qualified.scope);
  assert.equal(built.proposal.customer_requirements.stated_budget, qualified.budget);
  assert.ok(['ready_for_human_review', 'draft_ready', 'draft_incomplete'].includes(built.proposal.status));
});

test('the customer-requested human takeover does NOT create a proposal', () => {
  const built = buildQualifiedWhatsAppProposal({
    summary: { ...qualified, handoff_reason: 'customer_requested_human' }
  });
  assert.deepEqual(built, { eligible: false, reason: 'qualification_not_confirmed' });
});

test('missing a verified contact or unsupported service cannot queue a proposal', () => {
  assert.equal(buildQualifiedWhatsAppProposal({
    summary: { ...qualified, customer_phone: null }
  }).reason, 'contact_missing');
  assert.equal(buildQualifiedWhatsAppProposal({
    summary: { ...qualified, service: 'technical' }
  }).reason, 'unsupported_service');
});

test('qualified handoff queues a review action under the correct organization, and no send', async () => {
  const store = fakeStore();
  const notices = [];
  const result = await queueQualifiedWhatsAppProposal({
    rest: store.rest,
    organizationId: 'org-test',
    eventId: 'inbound-test',
    leadId: 'lead-test',
    conversationId: 'conversation-test',
    summary: qualified,
    notify: async ({ text }) => { notices.push(text); return true; }
  });
  assert.equal(result.queued, true);
  assert.equal(result.notified, true);
  assert.equal(result.external_actions, 0);
  assert.equal(store.writes.length, 1);
  const action = store.writes[0];
  assert.equal(action.organization_id, 'org-test');
  assert.equal(action.lead_id, 'lead-test');
  assert.equal(action.conversation_id, 'conversation-test');
  assert.equal(action.action_type, 'proposal_review');
  assert.equal(action.status, 'pending_approval');
  assert.equal(action.requires_approval, true);
  assert.equal(action.payload.source_event_id, 'inbound-test');
  assert.equal(action.payload.auto_send, false);
  assert.equal(action.payload.proposal.pricing.total, null);
  assert.match(notices[0], /لا يتم إرسال أي عرض/);
  assert.match(store.paths[0], /organization_id=eq.org-test/);
  assert.match(store.paths[0], /source_event_id=eq.inbound-test/);
});

test('dedupe by source event does not generate a second review action', async () => {
  const store = fakeStore([{ id: 'existing', status: 'pending_approval' }]);
  const result = await queueQualifiedWhatsAppProposal({
    rest: store.rest, organizationId: 'org-test',
    eventId: 'inbound-test', leadId: 'lead-test', conversationId: 'conversation-test',
    summary: qualified
  });
  assert.equal(result.deduplicated, true);
  assert.equal(result.action_id, 'existing');
  assert.equal(store.writes.length, 0);
});

test('Telegram failure leaves a durable review action (no customer send)', async () => {
  const store = fakeStore();
  const result = await queueQualifiedWhatsAppProposal({
    rest: store.rest, organizationId: 'org-test',
    eventId: 'inbound-test', leadId: 'lead-test', conversationId: 'conversation-test',
    summary: qualified, notify: async () => { throw new Error('Telegram unavailable'); }
  });
  assert.equal(result.queued, true);
  assert.equal(result.notified, false);
  assert.equal(store.writes.length, 1);
});

test('no source-linked CRM record means no write', async () => {
  const store = fakeStore();
  const result = await queueQualifiedWhatsAppProposal({
    rest: store.rest, organizationId: 'org-test',
    eventId: 'inbound-test', leadId: null, conversationId: 'conversation-test',
    summary: qualified
  });
  assert.equal(result.queued, false);
  assert.equal(store.writes.length, 0);
  assert.equal(store.paths.length, 0);
});

test('owner notice never represents customer budget as confirmed Tiqnora price', () => {
  const { proposal } = buildQualifiedWhatsAppProposal({ summary: qualified });
  const notice = proposalReviewNotice({ proposal, actionId: 'action-1', leadId: 'lead-1' });
  assert.match(notice, /ميزانية العميل/);
  assert.match(notice, /لا يوجد تسعير معتمد/);
});

test('workforce audit records real approval gate with deduped workflow run', async () => {
  const calls = [];
  let runExists = false;
  const rest = async (path, options = {}) => {
    calls.push({ path, options });
    if (path.startsWith('workflow_runs?on_conflict=')) {
      if (runExists) return [];
      runExists = true;
      return [{ id: 'run-1' }];
    }
    if (path.startsWith('workflow_runs?organization_id=')) return [{ id: 'run-1' }];
    if (path.startsWith('workflow_steps?on_conflict=')) return [{ id: 'step-1' }];
    throw new Error('unexpected path ' + path);
  };
  const args = { rest, organizationId: 'org-1', eventId: 'evt-1', leadId: 'lead-1', actionId: 'act-1' };
  const first = await persistQualifiedProposalWorkflow(args);
  const second = await persistQualifiedProposalWorkflow(args);
  assert.equal(first.run_id, 'run-1');
  assert.equal(second.run_id, 'run-1');
  assert.equal(first.steps, 3);
  const created = JSON.parse(calls[0].options.body);
  assert.equal(created.workflow_type, 'lead_to_proposal');
  assert.equal(created.status, 'waiting_approval');
  assert.equal(created.summary.external_actions, 0);
  const rows = calls.filter(c => c.path.startsWith('workflow_steps?'));
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.slice(0, 3).map(x => JSON.parse(x.options.body).step_key),
    ['crm_qualified', 'proposal_draft', 'owner_review']);
  assert.equal(JSON.parse(rows[2].options.body).status, 'waiting_approval');
});

test('workflow audit failure never loses an approved-only proposal action', async () => {
  const store = fakeStore();
  const result = await queueQualifiedWhatsAppProposal({
    rest: store.rest,
    organizationId: 'org-test', eventId: 'e-test',
    leadId: 'l-test', conversationId: 'c-test',
    summary: qualified,
    recordWorkflow: async () => { throw new Error('audit_down'); }
  });
  assert.equal(result.queued, true);
  assert.equal(result.workflow_run_id, null);
  assert.equal(store.writes.length, 1);
});

test('a typed price stays unconfirmed until the operator explicitly confirms it', () => {
  const { proposal } = buildQualifiedWhatsAppProposal({ summary: qualified });
  const unconfirmed = applyProposalEdits(proposal, { pricing: { total: 1200 } });
  assert.equal(unconfirmed.pricing.status, 'partially_confirmed');
  const confirmed = applyProposalEdits(proposal, { pricing: { total: 1200, confirmed: true } });
  assert.equal(confirmed.pricing.status, 'confirmed_input');
  assert.equal(confirmed.pricing.total, 1200);
  const action = { action_type: 'proposal_review', status: 'approved', payload: { proposal: confirmed } };
  assert.equal(validateProposalDeliveryAction(action).ready, true);
  assert.equal(validateProposalDeliveryAction({ ...action, payload: { proposal: unconfirmed } }).ready, false);
});

const approvalActionId = '00000000-0000-4000-8000-000000000123';

function proposedReview(confirmed = false) {
  const { proposal } = buildQualifiedWhatsAppProposal({ summary: qualified });
  return {
    id: approvalActionId,
    organization_id: 'org-1',
    action_type: 'proposal_review',
    status: 'pending_approval',
    payload: {
      source: 'agentic_whatsapp_confirmed_handoff',
      proposal: applyProposalEdits(proposal, { pricing: { total: 1250, confirmed } })
    }
  };
}

function proposalCallbackFixture(action) {
  const updates = [];
  const replies = [];
  const ownerMessages = [];
  const rest = async (path, opts = {}) => {
    if (path.startsWith('organizations?')) return [{ id: 'org-1' }];
    if (path.startsWith('actions?') && (!opts.method || opts.method === 'GET')) return [action];
    if (path.startsWith('actions?') && opts.method === 'PATCH') {
      updates.push({ path, body: JSON.parse(opts.body) });
      return [{ ...action, ...JSON.parse(opts.body) }];
    }
    throw new Error('unexpected query ' + path);
  };
  const query = {
    id: 'callback-1',
    from: { id: 123456 },
    message: { chat: { id: -123456 } },
    data: 'proposal_ok:' + approvalActionId
  };
  const adapters = {
    rest,
    approvalTarget: async () => ({
      configured: true, chat_id: '-123456', owner_telegram_user_id: '123456'
    }),
    answer: async (_q, message) => { replies.push(message); },
    notifyOwner: async (_chat, message) => { ownerMessages.push(message); }
  };
  return { updates, replies, ownerMessages, query, adapters };
}

test('Telegram callback payload accepts only action UUID and precise action', () => {
  assert.equal(proposalReviewKeyboard('invalid'), null);
  const kb = proposalReviewKeyboard(approvalActionId);
  assert.match(kb.inline_keyboard[0][0].callback_data, /proposal_ok:/);
  assert.equal(parseProposalReviewCallback('proposal_ok:' + approvalActionId).decision, 'approve');
  assert.equal(parseProposalReviewCallback('proposal_no:' + approvalActionId).decision, 'reject');
  assert.equal(parseProposalReviewCallback('social_ok:' + approvalActionId), null);
});

test('Telegram can never approve missing human-confirmed pricing', async () => {
  const fixture = proposalCallbackFixture(proposedReview(false));
  const response = await handleWhatsAppProposalReviewCallback(fixture.query, fixture.adapters);
  assert.equal(response.handled, true);
  assert.equal(response.ok, false);
  assert.equal(response.reason, 'pricing_or_scope_requires_review');
  assert.equal(fixture.updates.length, 0);
  assert.match(fixture.replies[0], /سعرًا مؤكدًا/);
});

test('Only configured Telegram owner (chat AND user) can approve', async () => {
  const fixture = proposalCallbackFixture(proposedReview(true));
  fixture.query.from.id = 987654;
  const response = await handleWhatsAppProposalReviewCallback(fixture.query, fixture.adapters);
  assert.equal(response.reason, 'not_authorized_owner');
  assert.equal(fixture.updates.length, 0);
});

test('Telegram owner sees exact confirmed pricing before second-click approval', async () => {
  const fixture = proposalCallbackFixture(proposedReview(true));
  const first = await handleWhatsAppProposalReviewCallback(fixture.query, fixture.adapters);
  assert.equal(first.ok, true);
  assert.equal(first.stage, 'awaiting_price_confirmation');
  assert.equal(fixture.updates.length, 0);
  assert.match(fixture.ownerMessages[0], /1250/);
  // Second click contains a fingerprint of the pricing snapshot.
  const fingerprint = proposalPricingFingerprint(proposedReview(true));
  fixture.query.data = 'proposal_yes:' + approvalActionId + ':' + fingerprint;
  const response = await handleWhatsAppProposalReviewCallback(fixture.query, fixture.adapters);
  assert.equal(response.ok, true);
  assert.equal(response.customer_sent, false);
  assert.equal(response.decision, 'approve');
  assert.equal(fixture.updates.length, 1);
  assert.equal(fixture.updates[0].body.status, 'approved');
  assert.equal(fixture.updates[0].body.result.telegram_reviewed_by_owner_id, '123456');
  assert.match(fixture.updates[0].path, /status=eq.pending_approval/);
});

test('Telegram fingerprint refuses stale pricing after edit', async () => {
  const oldAction = proposedReview(true);
  const fixture = proposalCallbackFixture(oldAction);
  const oldFingerprint = proposalPricingFingerprint(oldAction);
  const edited = proposedReview(true);
  edited.payload.proposal.pricing.total = 8500;
  fixture.adapters.rest = async (path, options = {}) => {
    if (path.startsWith('organizations?')) return [{ id: 'org-1' }];
    if (path.startsWith('actions?') && !options.method) return [edited];
    throw new Error('unexpected write');
  };
  fixture.query.data = 'proposal_yes:' + approvalActionId + ':' + oldFingerprint;
  const result = await handleWhatsAppProposalReviewCallback(fixture.query, fixture.adapters);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'price_changed_since_preview');
  assert.equal(fixture.updates.length, 0);
});

test('Rejecting from owner cancels draft, never sends a message', async () => {
  const fixture = proposalCallbackFixture(proposedReview(false));
  fixture.query.data = 'proposal_no:' + approvalActionId;
  const response = await handleWhatsAppProposalReviewCallback(fixture.query, fixture.adapters);
  assert.equal(response.ok, true);
  assert.equal(response.customer_sent, false);
  assert.equal(fixture.updates[0].body.status, 'cancelled');
});

test('Telegram callback cannot approve an action from another source', () => {
  const action = proposedReview(true);
  action.payload.source = 'v6_proposal_composer';
  assert.equal(validateOwnerProposalDecision({ action, decision: 'approve' }).allowed, false);
});
