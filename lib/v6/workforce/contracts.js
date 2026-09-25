/**
 * Structured handoff contracts + validators.
 */

export function validateLeadResearchOutput(out = {}) {
  const missing = [];
  if (!out.candidates && !out.leads && !out.normalized) missing.push('candidates|leads');
  return { ok: missing.length === 0, missing, requires_approval: false, auto_send: false };
}

export function validateSalesOutput(out = {}) {
  const missing = [];
  if (!out.next_action && !out.lead_status) missing.push('next_action|lead_status');
  return {
    ok: missing.length === 0,
    missing,
    requires_approval: out.requires_approval !== false,
    auto_send: false,
    draft_message: out.draft_message || null
  };
}

export function validateProposalOutput(out = {}) {
  const missing = [];
  if (!out.draft && !out.proposal && !out.status) missing.push('draft|proposal');
  return {
    ok: missing.length === 0,
    missing,
    requires_approval: true,
    auto_send: false,
    price_final: null // human controlled
  };
}

export function validateContentOutput(out = {}) {
  const missing = [];
  if (!out.draft && !out.ideas && !out.body) missing.push('draft|ideas|body');
  return { ok: missing.length === 0, missing, requires_approval: true, auto_publish: false };
}

export function validateReputationOutput(out = {}) {
  const missing = [];
  if (!out.draft_reply && !out.analysis) missing.push('draft_reply|analysis');
  return { ok: missing.length === 0, missing, requires_approval: true, auto_reply: false };
}

export function validateSeoOutput(out = {}) {
  return {
    ok: true,
    missing: [],
    requires_approval: true,
    auto_publish: false,
    recommendations_only: true
  };
}

export function validateEnrichmentOutput(out = {}) {
  const missing = [];
  if (!out.enrichment && out.vertical == null && !out.quality) missing.push('enrichment');
  return { ok: missing.length === 0, missing, requires_approval: false, auto_send: false };
}

export function validateStepOutput(stepKey, output = {}) {
  const map = {
    research: validateLeadResearchOutput,
    enrichment: validateEnrichmentOutput,
    sales_agent: validateSalesOutput,
    draft_followup: validateSalesOutput,
    reactivation_draft: validateSalesOutput,
    proposal_draft: validateProposalOutput,
    content_draft: validateContentOutput,
    draft: validateContentOutput,
    draft_reply: validateReputationOutput,
    content_brief: validateSeoOutput,
    seo_validate: validateSeoOutput
  };
  const fn = map[stepKey];
  if (!fn) {
    return { ok: true, missing: [], requires_approval: false };
  }
  return fn(output);
}

export default {
  validateLeadResearchOutput,
  validateEnrichmentOutput,
  validateSalesOutput,
  validateProposalOutput,
  validateContentOutput,
  validateReputationOutput,
  validateSeoOutput,
  validateStepOutput
};
