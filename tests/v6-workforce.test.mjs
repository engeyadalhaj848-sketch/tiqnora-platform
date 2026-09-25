import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBAL_GUARDS,
  getWorkflow,
  getAgent,
  listWorkflows,
  listAgents,
  resolveAgentStatus
} from '../lib/v6/workforce/registry.js';
import { validateStepOutput, validateSalesOutput } from '../lib/v6/workforce/contracts.js';
import {
  runWorkflow,
  buildIdempotencyKey,
  findExistingRun,
  shouldRetry,
  isRetryableError,
  determineNextBestAction,
  buildDailyReport,
  workforceAnalytics,
  listWorkforceAgents
} from '../lib/v6/workforce/orchestrator.js';

describe('workforce registry', () => {
  it('exposes guarded globals', () => {
    assert.equal(GLOBAL_GUARDS.no_auto_send, true);
    assert.equal(GLOBAL_GUARDS.no_auto_publish, true);
    assert.equal(GLOBAL_GUARDS.approval_required_external, true);
    assert.ok(GLOBAL_GUARDS.max_steps <= 20);
  });

  it('whitelist workflows and agents only', () => {
    assert.ok(getWorkflow('lead_to_proposal'));
    assert.equal(getWorkflow('hack_me'), null);
    assert.ok(getAgent('sales_agent'));
    assert.equal(getAgent('evil'), null);
    assert.ok(listWorkflows().length >= 8);
    assert.ok(listAgents().length >= 10);
  });

  it('agent status is not active from registry alone', () => {
    assert.equal(resolveAgentStatus('sales_agent', {}), 'configured');
    assert.equal(resolveAgentStatus('sales_agent', { ready: true }), 'ready');
    assert.equal(resolveAgentStatus('sales_agent', { paused: true }), 'paused');
  });
});

describe('contracts and safety', () => {
  it('sales output requires approval by default', () => {
    const v = validateSalesOutput({ lead_status: 'open', next_action: 'call' });
    assert.equal(v.auto_send, false);
    assert.equal(v.requires_approval, true);
  });

  it('retry only on transient errors', () => {
    assert.equal(isRetryableError({ status: 429 }), true);
    assert.equal(isRetryableError({ code: 'validation_error' }), false);
    assert.equal(shouldRetry(1, 3, { status: 429 }), true);
    assert.equal(shouldRetry(3, 3, { status: 429 }), false);
    assert.equal(shouldRetry(1, 3, { code: 'forbidden' }), false);
  });

  it('next best action is fact-based', () => {
    const a = determineNextBestAction({ facts: { hot_lead: true } });
    assert.equal(a.requires_approval, true);
    assert.equal(a.recommended_agent, 'sales_agent');
    const none = determineNextBestAction({ facts: {} });
    assert.equal(none.action_type, 'none');
  });
});

describe('idempotency and concurrency', () => {
  it('deduplicates same event', async () => {
    const key = buildIdempotencyKey({ workflow_type: 'lead_to_proposal', event_id: 'evt-1' });
    const first = await runWorkflow('lead_to_proposal', { event_id: 'evt-1', query: 'x' }, { idempotency_key: key });
    const second = await runWorkflow('lead_to_proposal', { event_id: 'evt-1', query: 'x' }, {
      idempotency_key: key,
      existing_runs: [{ ...first.run, steps: first.steps }]
    });
    assert.equal(second.deduplicated, true);
    assert.equal(second.external_actions, 0);
  });
});

describe('workflow e2e acceptance', () => {
  it('lead_to_proposal stops at approval with zero external actions', async () => {
    const r = await runWorkflow('lead_to_proposal', {
      query: 'عيادات أسنان',
      city: 'المدينة المنورة',
      industry: 'dental_clinic'
    });
    assert.equal(r.external_actions, 0);
    assert.ok(['waiting_approval', 'completed'].includes(r.run.status));
    assert.ok(r.steps.some((s) => s.step_key === 'proposal_draft'));
    assert.ok(r.steps.every((s) => s.output?.auto_send !== true));
  });

  it('daily_marketing does not publish', async () => {
    const r = await runWorkflow('daily_marketing', { industry: 'clinics' });
    assert.equal(r.external_actions, 0);
    assert.ok(r.steps.some((s) => s.step_key === 'content_draft' || s.step_key === 'campaign_idea'));
    assert.equal(r.run.status, 'waiting_approval');
  });

  it('reputation_response does not publish reply', async () => {
    const r = await runWorkflow('reputation_response', {
      review: { rating: 1, comment: 'تأخير وخدمة سيئة' }
    });
    assert.equal(r.external_actions, 0);
    assert.equal(r.run.status, 'waiting_approval');
    assert.ok(r.steps.some((s) => s.step_key === 'draft_reply'));
  });

  it('seo_opportunity is recommendations only', async () => {
    const r = await runWorkflow('seo_opportunity', {});
    assert.equal(r.external_actions, 0);
    assert.ok(['waiting_approval', 'completed'].includes(r.run.status));
  });

  it('provider 429 retries then can complete or fail without loop', async () => {
    const r = await runWorkflow('seo_opportunity', {}, {
      force_error_on_step: 'audit_signal',
      max_attempts: 3
    });
    // should not infinite loop; finite steps
    assert.ok(r.steps.length <= 20);
    assert.equal(r.external_actions, 0);
  });

  it('unknown workflow rejected', async () => {
    await assert.rejects(() => runWorkflow('not_real', {}), (e) => e.code === 'unknown_workflow');
  });
});

describe('reports and analytics', () => {
  it('daily report has no fake numbers when omitted', () => {
    const m = buildDailyReport('morning', {});
    assert.equal(m.external_actions, 0);
    assert.equal(m.new_prospects, null);
  });

  it('analytics from real runs only', () => {
    const a = workforceAnalytics([
      { status: 'completed' },
      { status: 'failed' },
      { status: 'waiting_approval' }
    ]);
    assert.equal(a.runs_total, 3);
    assert.equal(a.runs_completed, 1);
    assert.equal(a.external_actions, 0);
  });

  it('listWorkforceAgents returns statuses', () => {
    const agents = listWorkforceAgents({ sales_agent: { ready: true } });
    assert.ok(agents.find((a) => a.key === 'sales_agent')?.status === 'ready');
  });
});
