/**
 * Whitelisted Agent + Workflow registries. No dynamic user-driven execution.
 */

export const GLOBAL_GUARDS = Object.freeze({
  no_auto_send: true,
  no_auto_publish: true,
  no_price_invention: true,
  no_fake_claims: true,
  no_sensitive_data_leak: true,
  approval_required_external: true,
  max_steps: 20,
  max_retries: 3
});

export const AGENT_REGISTRY = Object.freeze({
  manager_agent: {
    key: 'manager_agent',
    label: 'Manager',
    external: false,
    description: 'Orchestrates workflows; never messages customers'
  },
  lead_research_agent: {
    key: 'lead_research_agent',
    label: 'Lead Research',
    external: false
  },
  sales_agent: {
    key: 'sales_agent',
    label: 'Sales',
    external: true // drafts only until approval
  },
  proposal_agent: {
    key: 'proposal_agent',
    label: 'Proposal',
    external: true
  },
  marketing_agent: {
    key: 'marketing_agent',
    label: 'Marketing',
    external: false
  },
  content_agent: {
    key: 'content_agent',
    label: 'Content',
    external: false
  },
  design_agent: {
    key: 'design_agent',
    label: 'Design',
    external: false
  },
  video_agent: {
    key: 'video_agent',
    label: 'Video',
    external: false
  },
  social_agent: {
    key: 'social_agent',
    label: 'Social',
    external: true
  },
  seo_agent: {
    key: 'seo_agent',
    label: 'SEO / GEO',
    external: false
  },
  reputation_agent: {
    key: 'reputation_agent',
    label: 'Reputation',
    external: true
  },
  customer_success_agent: {
    key: 'customer_success_agent',
    label: 'Customer Success',
    external: true
  },
  operations_agent: {
    key: 'operations_agent',
    label: 'Operations',
    external: false
  }
});

export const WORKFLOW_REGISTRY = Object.freeze({
  lead_to_proposal: {
    type: 'lead_to_proposal',
    label: 'Lead → Proposal',
    trigger: ['new_lead', 'manual', 'lead_research'],
    steps: [
      'research',
      'enrichment',
      'qualification',
      'sales_playbook',
      'sales_agent',
      'proposal_draft',
      'waiting_approval'
    ],
    external_side_effects: false
  },
  lead_followup: {
    type: 'lead_followup',
    label: 'Lead Follow-up',
    trigger: ['followup_due', 'manual'],
    steps: ['crm_check', 'qualification_check', 'draft_followup', 'waiting_approval'],
    external_side_effects: false
  },
  daily_marketing: {
    type: 'daily_marketing',
    label: 'Daily Marketing',
    trigger: ['schedule_morning', 'manual'],
    steps: [
      'marketing_plan',
      'seo_signals',
      'reputation_signals',
      'campaign_idea',
      'content_draft',
      'creative_briefs',
      'channel_adapt',
      'waiting_approval'
    ],
    external_side_effects: false
  },
  social_content: {
    type: 'social_content',
    label: 'Social Content',
    trigger: ['campaign', 'manual'],
    steps: ['idea', 'draft', 'variants', 'creative', 'brand_validate', 'waiting_approval'],
    external_side_effects: false
  },
  reputation_response: {
    type: 'reputation_response',
    label: 'Reputation Response',
    trigger: ['new_review', 'manual'],
    steps: ['analyze', 'priority', 'draft_reply', 'brand_privacy', 'waiting_approval'],
    external_side_effects: false
  },
  seo_opportunity: {
    type: 'seo_opportunity',
    label: 'SEO Opportunity',
    trigger: ['seo_issue', 'manual'],
    steps: ['audit_signal', 'keyword_intent', 'content_brief', 'seo_validate', 'waiting_approval'],
    external_side_effects: false
  },
  customer_success: {
    type: 'customer_success',
    label: 'Customer Success',
    trigger: ['existing_customer', 'manual'],
    steps: ['crm_status', 'open_issues', 'recommendation', 'internal_or_draft', 'waiting_approval_if_external'],
    external_side_effects: false
  },
  sales_reactivation: {
    type: 'sales_reactivation',
    label: 'Sales Reactivation',
    trigger: ['stale_lead', 'manual'],
    steps: ['crm_check', 'reactivation_draft', 'waiting_approval'],
    external_side_effects: false
  },
  morning_operations: {
    type: 'morning_operations',
    label: 'Morning Operations',
    trigger: ['schedule_morning', 'manual'],
    steps: ['lead_research', 'sales_summary', 'marketing', 'content', 'seo', 'manager_summary'],
    external_side_effects: false
  },
  evening_operations: {
    type: 'evening_operations',
    label: 'Evening Operations',
    trigger: ['schedule_evening', 'manual'],
    steps: ['sales_performance', 'followups', 'reputation', 'seo_alerts', 'failures', 'manager_summary'],
    external_side_effects: false
  }
});

export function getAgent(key) {
  return AGENT_REGISTRY[key] || null;
}

export function getWorkflow(type) {
  return WORKFLOW_REGISTRY[type] || null;
}

export function listAgents() {
  return Object.values(AGENT_REGISTRY);
}

export function listWorkflows() {
  return Object.values(WORKFLOW_REGISTRY);
}

export function resolveAgentStatus(agentKey, config = {}) {
  const agent = getAgent(agentKey);
  if (!agent) return 'error';
  if (config.paused) return 'paused';
  if (config.error) return 'error';
  if (config.provider_configured === false) return 'not_configured';
  if (config.degraded) return 'degraded';
  if (config.ready === true || config.provider_configured === true) return 'ready';
  // presence of registry entry alone is not "active"
  return config.configured ? 'configured' : 'configured';
}

export default {
  GLOBAL_GUARDS,
  AGENT_REGISTRY,
  WORKFLOW_REGISTRY,
  getAgent,
  getWorkflow,
  listAgents,
  listWorkflows,
  resolveAgentStatus
};
