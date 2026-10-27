import test from 'node:test';
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
