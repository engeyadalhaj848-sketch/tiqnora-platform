/**
 * Tiqnora V6 — Workforce Orchestrator (deterministic core, no live external actions).
 * Integrates existing V6 modules via structured handoffs.
 */

import { GLOBAL_GUARDS, getWorkflow, getAgent, listAgents, listWorkflows, resolveAgentStatus } from './registry.js';
import { validateStepOutput } from './contracts.js';

// Reuse existing engines (deterministic paths)
import { createResearchJobSpec, runResearchJob, fixtureDiscover } from '../lead-research.js';
import { enrichLead } from '../lead-enrichment.js';
import { buildSalesPlaybookResult } from '../sales-playbooks.js';
import { buildProposalDraft } from '../proposal-composer.js';
import { createCampaign, generateContentIdeas, generateContentDraft, adaptToChannels, generateCreativeBrief, runContentHandoff } from '../social-studio.js';
import { analyzeReview, generateReviewReplyDraft } from '../reputation/engine.js';
import { runSiteAudit, sampleTiqnoraPages } from '../seo/audit.js';
import { generateContentOpportunities, buildKeywordMap } from '../seo/keywords.js';
import { getDefaultBrandProfile, validateBrandContent } from '../brand-brain.js';

const RETRYABLE = new Set(['timeout', '429', 'rate_limit', 'network_error', 'provider_unavailable', 'ECONNRESET']);

export function isRetryableError(err = {}) {
  const code = String(err.code || err.status || err.message || '').toLowerCase();
  if (err.status === 429) return true;
  for (const r of RETRYABLE) {
    if (code.includes(String(r).toLowerCase())) return true;
  }
  return false;
}

export function shouldRetry(attemptCount, maxAttempts, err) {
  if (!isRetryableError(err)) return false;
  return attemptCount < (maxAttempts || GLOBAL_GUARDS.max_retries);
}

/**
 * Idempotency: same org + workflow + key → same logical run.
 */
export function buildIdempotencyKey({ workflow_type, event_id, entity_id, day } = {}) {
  if (event_id) return `${workflow_type}::event::${event_id}`;
  if (entity_id) return `${workflow_type}::entity::${entity_id}`;
  if (day) return `${workflow_type}::day::${day}`;
  return null;
}

export function findExistingRun(runs = [], { workflow_type, idempotency_key }) {
  if (!idempotency_key) return null;
  return (runs || []).find(
    (r) => r.workflow_type === workflow_type && r.idempotency_key === idempotency_key && r.status !== 'cancelled'
  ) || null;
}

export function determineNextBestAction(context = {}) {
  const facts = context.facts || {};
  if (facts.critical_review) {
    return {
      action_type: 'reputation_response',
      reason: 'Critical or high-priority review requires response draft',
      priority: 'high',
      requires_approval: true,
      recommended_agent: 'reputation_agent'
    };
  }
  if (facts.hot_lead) {
    return {
      action_type: 'lead_to_proposal',
      reason: 'High-quality lead ready for qualification/proposal path',
      priority: 'high',
      requires_approval: true,
      recommended_agent: 'sales_agent'
    };
  }
  if (facts.followup_due) {
    return {
      action_type: 'lead_followup',
      reason: 'Follow-up is due based on CRM timing',
      priority: 'normal',
      requires_approval: true,
      recommended_agent: 'sales_agent'
    };
  }
  if (facts.seo_critical) {
    return {
      action_type: 'seo_opportunity',
      reason: 'Critical SEO issue detected',
      priority: 'high',
      requires_approval: true,
      recommended_agent: 'seo_agent'
    };
  }
  if (facts.content_gap) {
    return {
      action_type: 'daily_marketing',
      reason: 'Content/marketing opportunity available',
      priority: 'low',
      requires_approval: true,
      recommended_agent: 'marketing_agent'
    };
  }
  return {
    action_type: 'none',
    reason: 'No actionable fact-based recommendation',
    priority: 'low',
    requires_approval: false,
    recommended_agent: 'manager_agent'
  };
}

export function buildAgentContext(options = {}) {
  return {
    organization_id: options.organization_id || null,
    brand: options.brand || getDefaultBrandProfile(),
    crm: options.crm || null,
    campaign: options.campaign || null,
    conversation: options.conversation || null,
    prior_outputs: options.prior_outputs || {},
    approval_state: options.approval_state || null,
    guards: { ...GLOBAL_GUARDS },
    // never include secrets
    secrets: undefined
  };
}

function stepResult(step_key, agent_key, output, status = 'completed', extra = {}) {
  return {
    step_key,
    agent_key,
    status,
    output: {
      ...output,
      auto_send: false,
      auto_publish: false,
      auto_reply: false
    },
    requires_approval: !!output.requires_approval || status === 'waiting_approval',
    ...extra
  };
}

/** Execute a single step using existing modules (deterministic / offline-safe). */
export async function executeStep(stepKey, input = {}, context = {}) {
  const brand = context.brand || getDefaultBrandProfile();

  switch (stepKey) {
    case 'research':
    case 'lead_research': {
      const job = createResearchJobSpec({
        query: input.query || 'عيادات أسنان',
        city: input.city || 'المدينة المنورة',
        industry: input.industry || 'dental_clinic',
        target_count: input.target_count || 5,
        source: 'fixture'
      });
      const result = await runResearchJob(job, { provider: 'fixture' });
      return stepResult(stepKey, 'lead_research_agent', {
        candidates: result.candidates,
        summary: result.summary,
        requires_approval: false
      });
    }
    case 'enrichment': {
      const record = input.record || input.candidate || {};
      const enrichment = await enrichLead({
        inbox_analysis: {
          intent: 'sales',
          industry: record.industry || input.industry,
          contact: { name: record.business_name, phone: record.phone },
          location: { city: record.city }
        },
        lead: record
      });
      return stepResult(stepKey, 'lead_research_agent', { enrichment, requires_approval: false });
    }
    case 'qualification':
    case 'qualification_check':
    case 'sales_playbook': {
      const playbook = buildSalesPlaybookResult({
        inbox_analysis: input.inbox_analysis || { intent: 'sales' },
        enrichment: input.enrichment || {},
        lead: input.lead || {}
      });
      return stepResult(stepKey, 'sales_agent', {
        playbook,
        next_action: playbook?.recommended_action || playbook?.next_action || 'qualify',
        lead_status: playbook?.lead_status || 'qualifying',
        requires_approval: false
      });
    }
    case 'sales_agent':
    case 'crm_check':
    case 'sales_summary':
    case 'sales_performance': {
      return stepResult(stepKey, 'sales_agent', {
        lead_status: input.lead_status || 'open',
        next_action: 'draft_or_wait',
        draft_message: null,
        requires_approval: false,
        note: 'Analysis only — no outbound'
      });
    }
    case 'draft_followup':
    case 'reactivation_draft': {
      return stepResult(stepKey, 'sales_agent', {
        lead_status: 'followup',
        next_action: 'send_followup_draft',
        draft_message: input.draft_message || 'مسودة متابعة — تتطلب موافقة بشرية قبل الإرسال.',
        requires_approval: true,
        auto_send: false
      }, 'waiting_approval');
    }
    case 'proposal_draft': {
      const proposal = buildProposalDraft({
        inbox_analysis: input.inbox_analysis || {},
        enrichment: input.enrichment || {},
        playbook: input.playbook || {},
        lead: input.lead || {},
        company: input.company || {},
        contact: input.contact || {}
      });
      return stepResult(stepKey, 'proposal_agent', {
        proposal,
        draft: proposal,
        status: proposal?.status || 'draft',
        requires_approval: true,
        price_final: null,
        auto_send: false
      }, 'waiting_approval');
    }
    case 'marketing_plan':
    case 'campaign_idea':
    case 'marketing': {
      const campaign = createCampaign({
        name: input.name || 'حملة يومية',
        objective: input.objective || 'lead_generation',
        industry: input.industry || 'clinics',
        location: input.location || 'المدينة المنورة',
        platforms: input.platforms || ['instagram', 'facebook']
      }, brand);
      const ideas = generateContentIdeas(campaign, brand, { count: 5 });
      return stepResult(stepKey, 'marketing_agent', {
        campaign,
        ideas,
        requires_approval: true,
        auto_publish: false
      });
    }
    case 'content_draft':
    case 'idea':
    case 'draft':
    case 'content': {
      const campaign = input.campaign || createCampaign({ name: 'Content' }, brand);
      const idea = input.idea || generateContentIdeas(campaign, brand, { count: 1 })[0];
      const draft = generateContentDraft(idea, campaign, brand);
      return stepResult(stepKey, 'content_agent', {
        idea,
        draft,
        requires_approval: true,
        auto_publish: false
      });
    }
    case 'creative_briefs':
    case 'creative':
    case 'variants':
    case 'channel_adapt': {
      const draft = input.draft || generateContentDraft(
        { title: 'فكرة', hook: 'خطاف', CTA: 'ناقش مشروعك', target_platform: 'instagram' },
        createCampaign({}, brand),
        brand
      );
      const variants = adaptToChannels(draft, input.platforms || ['instagram', 'linkedin'], brand);
      const brief = generateCreativeBrief(draft, brand);
      return stepResult(stepKey, stepKey.includes('channel') ? 'social_agent' : 'design_agent', {
        variants,
        creative_brief: brief,
        video_brief: brief.video_script || brief,
        requires_approval: true,
        auto_publish: false
      });
    }
    case 'brand_validate': {
      const text = input.text || input.draft?.body || '';
      const validation = validateBrandContent(text, brand, { require_cta: false });
      return stepResult(stepKey, 'content_agent', {
        brand_validation: validation,
        requires_approval: true
      });
    }
    case 'analyze':
    case 'priority': {
      const analysis = analyzeReview(input.review || { rating: 1, comment: 'سيء' });
      return stepResult(stepKey, 'reputation_agent', { analysis, requires_approval: false });
    }
    case 'draft_reply':
    case 'brand_privacy': {
      const draft = generateReviewReplyDraft(
        input.review || { rating: 1, comment: 'تأخير' },
        input.location || { title: 'الفرع' },
        brand
      );
      return stepResult(stepKey, 'reputation_agent', {
        ...draft,
        requires_approval: true,
        auto_reply: false
      }, 'waiting_approval');
    }
    case 'seo_signals':
    case 'audit_signal':
    case 'seo':
    case 'seo_alerts': {
      const audit = runSiteAudit(sampleTiqnoraPages().slice(0, 8));
      return stepResult(stepKey, 'seo_agent', {
        audit_summary: {
          pages_checked: audit.pages_checked,
          issues_found: audit.issues_found,
          critical: audit.severity_count?.critical || 0
        },
        requires_approval: false,
        auto_publish: false
      });
    }
    case 'keyword_intent':
    case 'content_brief':
    case 'seo_validate': {
      const keywords = buildKeywordMap();
      const opportunities = generateContentOpportunities({ count: 3 });
      return stepResult(stepKey, 'seo_agent', {
        keywords: keywords.slice(0, 5),
        opportunities,
        requires_approval: true,
        auto_publish: false,
        recommendations_only: true
      }, stepKey === 'seo_validate' ? 'waiting_approval' : 'completed');
    }
    case 'reputation_signals':
    case 'reputation': {
      return stepResult(stepKey, 'reputation_agent', {
        unanswered: input.unanswered || 0,
        high_priority: input.high_priority || 0,
        requires_approval: false
      });
    }
    case 'open_issues':
    case 'crm_status':
    case 'recommendation':
    case 'internal_or_draft':
    case 'waiting_approval_if_external': {
      const external = !!input.needs_external_message;
      return stepResult(
        stepKey,
        'customer_success_agent',
        {
          recommendation: input.recommendation || 'internal_followup',
          draft_message: external ? 'مسودة تواصل — موافقة مطلوبة' : null,
          forbids: ['refund', 'discount', 'guarantee'],
          requires_approval: external,
          auto_send: false
        },
        external ? 'waiting_approval' : 'completed'
      );
    }
    case 'followups':
    case 'failures':
    case 'manager_summary':
    case 'waiting_approval': {
      return stepResult(stepKey, 'manager_agent', {
        summary: input.summary || 'Manager checkpoint',
        requires_approval: stepKey === 'waiting_approval',
        next_best_action: determineNextBestAction({ facts: input.facts || {} })
      }, stepKey === 'waiting_approval' ? 'waiting_approval' : 'completed');
    }
    default: {
      // Unknown step in registry path should not execute arbitrary code
      return stepResult(stepKey, 'operations_agent', {
        skipped: true,
        reason: 'unknown_or_noop_step',
        requires_approval: false
      }, 'skipped');
    }
  }
}

/**
 * Run a full workflow offline-safe. Never executes external side effects.
 */
export async function runWorkflow(workflowType, input = {}, options = {}) {
  const def = getWorkflow(workflowType);
  if (!def) {
    const err = new Error(`Unknown workflow: ${workflowType}`);
    err.code = 'unknown_workflow';
    throw err;
  }

  const idempotency_key =
    options.idempotency_key ||
    buildIdempotencyKey({
      workflow_type: workflowType,
      event_id: input.event_id || options.event_id,
      entity_id: input.entity_id || options.entity_id,
      day: options.day
    });

  if (options.existing_runs) {
    const existing = findExistingRun(options.existing_runs, {
      workflow_type: workflowType,
      idempotency_key
    });
    if (existing) {
      return {
        run: existing,
        deduplicated: true,
        steps: existing.steps || [],
        external_actions: 0
      };
    }
  }

  // Concurrency: reject parallel same entity
  if (options.active_runs?.length && idempotency_key) {
    const active = options.active_runs.find(
      (r) =>
        r.workflow_type === workflowType &&
        r.idempotency_key === idempotency_key &&
        ['queued', 'running'].includes(r.status)
    );
    if (active) {
      return {
        run: active,
        blocked_concurrent: true,
        steps: [],
        external_actions: 0
      };
    }
  }

  const runStartedAt = new Date().toISOString();

  const context = buildAgentContext({
    organization_id: options.organization_id,
    brand: options.brand,
    crm: input.crm,
    campaign: input.campaign,
    prior_outputs: {}
  });

  const steps = [];
  let status = 'running';
  let current_step = null;
  let handoffs = 0;
  const maxSteps = Math.min(def.steps.length, GLOBAL_GUARDS.max_steps);
  let prior = { ...input };

  for (let i = 0; i < maxSteps; i++) {
    const stepKey = def.steps[i];
    current_step = stepKey;
    handoffs += 1;
    if (handoffs > GLOBAL_GUARDS.max_steps) {
      status = 'failed';
      break;
    }

    let attempt = 0;
    let result;
    const maxAttempts = options.max_attempts || GLOBAL_GUARDS.max_retries;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        if (options.force_error_on_step === stepKey && attempt < maxAttempts) {
          const err = new Error('Simulated provider 429');
          err.code = '429';
          err.status = 429;
          throw err;
        }
        result = await executeStep(stepKey, prior, context);
        break;
      } catch (err) {
        if (shouldRetry(attempt, maxAttempts, err)) {
          continue;
        }
        result = stepResult(
          stepKey,
          getAgent(stepKey)?.key || 'operations_agent',
          { error: true, message: err.message },
          'failed',
          { error_code: err.code || 'step_failed', attempt_count: attempt }
        );
        break;
      }
    }

    // Validate every actionable output before it can complete or reach approval.
    const validation = validateStepOutput(stepKey, result.output || {});
    if (!validation.ok && ['completed', 'waiting_approval'].includes(result.status)) {
      result.status = 'failed';
      result.error_code = 'validation_error';
      result.output = { ...result.output, validation };
    }

    result.attempt_count = result.attempt_count || attempt;
    steps.push(result);
    // Carry forward structured context without losing prior keys
    prior = {
      ...prior,
      ...result.output,
      // prefer first research candidate as active record
      record:
        result.output?.candidates?.[0]?.record ||
        result.output?.candidates?.[0] ||
        prior.record,
      enrichment: result.output?.enrichment || prior.enrichment,
      playbook: result.output?.playbook || prior.playbook,
      lead: result.output?.lead || prior.lead || result.output?.candidates?.[0]?.crm_payload || prior.record
    };
    context.prior_outputs[stepKey] = result.output;

    if (result.status === 'waiting_approval') {
      status = 'waiting_approval';
      break;
    }
    if (result.status === 'failed') {
      status = 'failed';
      break;
    }
  }

  if (status === 'running') status = 'completed';

  const run = {
    id: options.run_id || `run_${Date.now()}`,
    workflow_type: workflowType,
    trigger: options.trigger || input.trigger || 'manual',
    status,
    current_step,
    idempotency_key,
    event_id: input.event_id || options.event_id || null,
    summary: {
      steps_completed: steps.filter((s) => s.status === 'completed').length,
      steps_total: steps.length,
      waiting_approval: status === 'waiting_approval',
      external_actions: 0,
      guards: GLOBAL_GUARDS
    },
    started_at: runStartedAt,
    completed_at: status === 'completed' || status === 'failed' || status === 'cancelled'
      ? new Date().toISOString()
      : null
  };

  return {
    run,
    steps,
    deduplicated: false,
    external_actions: 0,
    next_best_action: determineNextBestAction({ facts: input.facts || {} })
  };
}

export function buildDailyReport(kind = 'morning', data = {}) {
  const base = {
    kind,
    generated_at: new Date().toISOString(),
    timezone: 'Asia/Riyadh',
    requires_approval_items: data.pending_approvals || 0,
    external_actions: 0,
    auto_send: false
  };
  if (kind === 'morning') {
    return {
      ...base,
      new_prospects: data.new_prospects ?? null,
      qualified_leads: data.qualified_leads ?? null,
      draft_proposals: data.draft_proposals ?? null,
      campaign_ideas: data.campaign_ideas ?? null,
      content_drafts: data.content_drafts ?? null,
      pending_approvals: data.pending_approvals ?? null
    };
  }
  return {
    ...base,
    followups_due: data.followups_due ?? null,
    sales_status: data.sales_status ?? null,
    social_activity: data.social_activity ?? null,
    reputation_alerts: data.reputation_alerts ?? null,
    seo_alerts: data.seo_alerts ?? null,
    workflow_failures: data.workflow_failures ?? null,
    tomorrow_recommendations: data.tomorrow_recommendations || []
  };
}

export function workforceAnalytics(runs = []) {
  const list = Array.isArray(runs) ? runs : [];
  const completed = list.filter((r) => r.status === 'completed');
  const failed = list.filter((r) => r.status === 'failed');
  const waiting = list.filter((r) => r.status === 'waiting_approval');
  return {
    runs_total: list.length,
    runs_completed: completed.length,
    runs_failed: failed.length,
    waiting_approval: waiting.length,
    // no invented averages without timestamps
    avg_duration_ms: null,
    external_actions: 0
  };
}

export function listWorkforceAgents(configMap = {}) {
  return listAgents().map((a) => ({
    ...a,
    status: resolveAgentStatus(a.key, configMap[a.key] || {})
  }));
}

export default {
  isRetryableError,
  shouldRetry,
  buildIdempotencyKey,
  findExistingRun,
  determineNextBestAction,
  buildAgentContext,
  executeStep,
  runWorkflow,
  buildDailyReport,
  workforceAnalytics,
  listWorkforceAgents,
  listWorkflows,
  GLOBAL_GUARDS
};
