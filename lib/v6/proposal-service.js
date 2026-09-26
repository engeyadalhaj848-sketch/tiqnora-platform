/**
 * Tiqnora V6 — Proposal lifecycle service
 * Works with existing actions (proposal_review) + optional proposals table.
 * No outbound send. No invented prices.
 */

import { randomBytes } from 'node:crypto';
import {
  validateProposalDeliveryAction,
  formatProposalForDelivery
} from './proposal-delivery.js';

/** Admin-facing lifecycle statuses */

export function finiteMoney(v) {
  if (v === null || v === undefined || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n);
}

export const PROPOSAL_LIFECYCLE = Object.freeze([
  'draft',
  'needs_review',
  'approved',
  'ready_to_send',
  'sent',
  'viewed',
  'negotiation',
  'accepted',
  'rejected',
  'expired'
]);

const STATUS_LABELS_AR = Object.freeze({
  draft: 'مسودة',
  needs_review: 'بانتظار المراجعة',
  approved: 'معتمد',
  ready_to_send: 'جاهز للإرسال',
  sent: 'مُرسل',
  viewed: 'تم الاطلاع',
  negotiation: 'تفاوض',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  expired: 'منتهي'
});

/**
 * Map action row + payload to lifecycle status.
 */
export function mapActionToLifecycle(action = {}) {
  const payload = action.payload || {};
  const explicit = payload.lifecycle_status;
  if (explicit && PROPOSAL_LIFECYCLE.includes(explicit)) return explicit;

  const delivery = String(
    action.result?.delivery_status ||
      payload.delivery_status ||
      ''
  ).toLowerCase();

  if (payload.lifecycle_status === 'accepted' || delivery === 'accepted') return 'accepted';
  if (payload.lifecycle_status === 'rejected') return 'rejected';
  if (payload.lifecycle_status === 'negotiation') return 'negotiation';
  if (payload.lifecycle_status === 'expired') return 'expired';
  if (delivery === 'read' || delivery === 'viewed') return 'viewed';
  if (['sent', 'delivered', 'accepted'].includes(delivery) || action.status === 'completed') {
    return delivery === 'read' ? 'viewed' : 'sent';
  }
  if (action.status === 'approved') {
    const pricing = payload.proposal?.pricing || payload.pricing || {};
    const hasPrice =
      finiteMoney(pricing.total) || finiteMoney(pricing.subtotal) || (Array.isArray(pricing.line_items) && pricing.line_items.some((x) => finiteMoney(x?.price)));
    return hasPrice ? 'ready_to_send' : 'approved';
  }
  if (action.status === 'pending_approval') return 'needs_review';
  if (action.status === 'cancelled') return 'rejected';
  if (action.status === 'draft') return 'draft';
  return 'draft';
}


function lifecycleLabel(status, lang = 'ar') {
  if (lang === 'en') return String(status || '');
  return STATUS_LABELS_AR[status] || status || '—';
}

/**
 * Human approval + pricing gate before send.
 */
export function canSendProposal(action = {}) {
  const reasons = [];
  if (!action || !action.id) reasons.push('missing_action');
  if (action.status !== 'approved') reasons.push('human_approval_required');

  const proposal = action.payload?.proposal || {};
  const pricing = proposal.pricing || action.payload?.pricing || {};
  const hasPrice =
    finiteMoney(pricing.total) || finiteMoney(pricing.subtotal) || (Array.isArray(pricing.line_items) && pricing.line_items.some((x) => finiteMoney(x?.price)));
  if (!hasPrice) reasons.push('pricing_required');

  const lifecycle = mapActionToLifecycle(action);
  if (['rejected', 'expired'].includes(lifecycle)) reasons.push('lifecycle_blocked');

  // Reuse delivery validator when possible
  try {
    const v = validateProposalDeliveryAction(action);
    if (v && v.ok === false && Array.isArray(v.reasons)) {
      for (const r of v.reasons) {
        if (!reasons.includes(r)) reasons.push(r);
      }
    }
  } catch {
    /* validator shape may vary */
  }

  return {
    ok: reasons.length === 0,
    reasons,
    lifecycle,
    requires_approval: action.status !== 'approved',
    pricing_required: !hasPrice
  };
}

export function generateShareToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Build admin list card from action row.
 */
export function buildProposalCard(action = {}) {
  const proposal = action.payload?.proposal || {};
  const pricing = proposal.pricing || {};
  const client = proposal.client || {};
  const lifecycle = mapActionToLifecycle(action);
  const delivery = action.result?.delivery || action.payload?.delivery || {};

  return {
    id: action.id,
    action_id: action.id,
    action_status: action.status,
    lifecycle_status: lifecycle,
    lifecycle_label: lifecycleLabel(lifecycle),
    client_name: client.name || action.payload?.client_name || null,
    company_name: client.company_name || client.name || null,
    vertical: client.vertical || client.industry || action.payload?.vertical || null,
    lead_id: action.lead_id || null,
    opportunity_id: action.payload?.opportunity_id || null,
    title: proposal.title || action.payload?.title || 'Proposal',
    service_types: (proposal.recommended_solution || []).map((s) => s.value || s.service).filter(Boolean),
    amount: finiteMoney(pricing.total)
      ? Number(pricing.total)
      : finiteMoney(pricing.subtotal)
        ? Number(pricing.subtotal)
        : null,
    currency: pricing.currency || 'SAR',
    pricing_status: pricing.status || (finiteMoney(pricing.total) || finiteMoney(pricing.subtotal) ? 'confirmed' : 'pricing_required'),
    created_at: action.created_at || null,
    updated_at: action.updated_at || null,
    sent_at: delivery.sent_at || action.executed_at || null,
    channel: delivery.channel || delivery.platform || null,
    assigned_to: action.payload?.assigned_to || action.created_by || null,
    follow_up_at: action.payload?.follow_up_at || null,
    share_token: action.payload?.share_token || null,
    version_number: action.payload?.version_number || 1,
    delivery_status: action.result?.delivery_status || action.payload?.delivery_status || null
  };
}

/**
 * Create a new version snapshot (pure).
 */
export function createProposalVersion({
  proposal,
  version_number = 1,
  created_by = null,
  change_summary = '',
  pricing = null
} = {}) {
  const snap = proposal && typeof proposal === 'object' ? JSON.parse(JSON.stringify(proposal)) : {};
  const pricing_snapshot = pricing
    ? JSON.parse(JSON.stringify(pricing))
    : snap.pricing
      ? JSON.parse(JSON.stringify(snap.pricing))
      : null;
  return {
    version_number: Number(version_number) || 1,
    created_at: new Date().toISOString(),
    created_by,
    change_summary: change_summary || '',
    pricing_snapshot,
    proposal_snapshot: snap
  };
}

/**
 * Apply human edits onto proposal draft (no price invention).
 */
export function applyProposalEdits(baseProposal = {}, edits = {}) {
  const p = JSON.parse(JSON.stringify(baseProposal || {}));
  const allow = [
    'title',
    'executive_summary',
    'objectives',
    'recommended_solution',
    'scope',
    'deliverables',
    'implementation_phases',
    'assumptions',
    'exclusions',
    'open_questions',
    'timeline',
    'next_step'
  ];
  for (const key of allow) {
    if (edits[key] !== undefined) p[key] = edits[key];
  }
  // Optional problem/solution narrative fields
  if (edits.problem !== undefined) p.problem = edits.problem;
  if (edits.proposed_solution_text !== undefined) p.proposed_solution_text = edits.proposed_solution_text;
  if (edits.terms !== undefined) p.terms = edits.terms;
  if (edits.valid_until !== undefined) p.valid_until = edits.valid_until;
  if (edits.payment_terms !== undefined) p.payment_terms = edits.payment_terms;
  if (edits.cta !== undefined) p.cta = edits.cta;
  if (edits.notes !== undefined) p.notes = edits.notes;

  // Pricing: only accept explicit numbers from human
  if (edits.pricing && typeof edits.pricing === 'object') {
    const src = edits.pricing;
    p.pricing = {
      status:
        finiteMoney(src.subtotal) || finiteMoney(src.total)
          ? 'partially_confirmed'
          : 'requires_human_pricing',
      currency: src.currency || p.pricing?.currency || 'SAR',
      subtotal: finiteMoney(src.subtotal) ? Number(src.subtotal) : null,
      vat: finiteMoney(src.vat) ? Number(src.vat) : null,
      total: finiteMoney(src.total) ? Number(src.total) : null,
      line_items: Array.isArray(src.line_items)
        ? src.line_items.map((li) => ({
            service: li.service || null,
            price: finiteMoney(li.price) ? Number(li.price) : null,
            status: finiteMoney(li.price) ? 'confirmed' : 'pricing_required'
          }))
        : p.pricing?.line_items || []
    };
  }

  // Manual deliverables add/remove
  if (Array.isArray(edits.deliverables_override)) {
    p.deliverables = edits.deliverables_override;
  }

  return p;
}

/**
 * Build timeline events from action + payload (real data only).
 */
export function buildProposalTimeline(action = {}) {
  const events = [];
  const push = (at, type, label, meta = {}) => {
    if (!at) return;
    events.push({ at, type, label, meta });
  };

  push(action.created_at, 'created', 'Proposal created', {
    by: action.created_by || null
  });

  const versions = Array.isArray(action.payload?.versions) ? action.payload.versions : [];
  for (const v of versions) {
    push(v.created_at, 'version', `Version ${v.version_number}`, {
      summary: v.change_summary || null,
      by: v.created_by || null
    });
  }

  if (action.payload?.price_updated_at) {
    push(action.payload.price_updated_at, 'price_updated', 'Price updated', {});
  }

  if (action.approved_at) {
    push(action.approved_at, 'approved', 'Approved by admin', {
      by: action.approved_by || null
    });
  }

  if (action.status === 'cancelled') {
    push(action.updated_at, 'rejected', 'Rejected / cancelled', {
      reason: action.payload?.reject_reason || null
    });
  }

  const delivery = action.result?.delivery || action.payload?.delivery || {};
  if (delivery.sent_at || action.executed_at) {
    push(delivery.sent_at || action.executed_at, 'sent', 'Sent', {
      channel: delivery.channel || delivery.platform || null
    });
  }
  if (delivery.viewed_at || action.result?.delivery_status === 'read') {
    push(delivery.viewed_at || action.updated_at, 'viewed', 'Customer viewed', {});
  }
  if (action.payload?.follow_up_at) {
    push(action.payload.follow_up_at, 'follow_up', 'Follow-up scheduled', {
      draft_only: true
    });
  }
  if (action.payload?.lifecycle_status === 'negotiation') {
    push(action.payload.negotiation_at || action.updated_at, 'negotiation', 'Negotiation', {});
  }
  if (action.payload?.lifecycle_status === 'accepted') {
    push(action.payload.accepted_at || action.updated_at, 'accepted', 'Accepted', {});
  }

  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  return events;
}

/**
 * Public-safe proposal view (no internal ids beyond token context).
 */
export function buildPublicProposalView(action = {}) {
  const proposal = action.payload?.proposal || {};
  const pricing = proposal.pricing || {};
  const lifecycle = mapActionToLifecycle(action);
  if (['draft', 'needs_review'].includes(lifecycle)) {
    return { ok: false, code: 'not_public', message: 'Proposal is not available' };
  }
  return {
    ok: true,
    title: proposal.title || 'Proposal',
    client: {
      name: proposal.client?.name || null,
      company_name: proposal.client?.company_name || null
    },
    executive_summary: proposal.executive_summary || null,
    problem: proposal.problem || null,
    recommended_solution: proposal.recommended_solution || [],
    scope: proposal.scope || [],
    deliverables: proposal.deliverables || [],
    timeline: proposal.timeline || null,
    pricing: {
      currency: pricing.currency || 'SAR',
      subtotal: finiteMoney(pricing.subtotal) ? Number(pricing.subtotal) : null,
      vat: finiteMoney(pricing.vat) ? Number(pricing.vat) : null,
      total: finiteMoney(pricing.total) ? Number(pricing.total) : null,
      status: pricing.status || 'requires_human_pricing'
    },
    terms: proposal.terms || null,
    valid_until: proposal.valid_until || null,
    cta: proposal.cta || null,
    language: proposal.language || 'ar',
    lifecycle_status: lifecycle
  };
}

/**
 * Suggest follow-up after send (draft only — no auto send).
 */
export function recommendProposalFollowUp(action = {}, { hours = 48 } = {}) {
  const lifecycle = mapActionToLifecycle(action);
  if (!['sent', 'viewed'].includes(lifecycle)) {
    return { recommended: false, reason: 'not_in_sent_state' };
  }
  const sentAt = action.result?.delivery?.sent_at || action.executed_at;
  if (!sentAt) return { recommended: false, reason: 'missing_sent_at' };
  const due = new Date(new Date(sentAt).getTime() + hours * 3600000).toISOString();
  return {
    recommended: true,
    follow_up_at: due,
    requires_approval: true,
    auto_send: false,
    draft_goal: 'تذكير ودّي بالعرض بعد عدم الرد',
    reason: `Follow-up ${hours}h after send`
  };
}

/**
 * CRM stage suggestion only (caller applies if pipeline supports it).
 */
export function crmStageSuggestion(lifecycle) {
  if (lifecycle === 'accepted') return { opportunity_stage: 'won', activity: 'proposal_accepted' };
  if (lifecycle === 'rejected') return { opportunity_stage: 'lost', activity: 'proposal_rejected' };
  if (lifecycle === 'negotiation') return { opportunity_stage: 'negotiation', activity: 'proposal_negotiation' };
  if (lifecycle === 'sent' || lifecycle === 'viewed') {
    return { opportunity_stage: 'proposal', activity: 'proposal_sent' };
  }
  return { opportunity_stage: null, activity: null };
}

export function prepareDeliveryMessage(action, options = {}) {
  const gate = canSendProposal(action);
  if (!gate.ok) {
    return { ok: false, reasons: gate.reasons, message: null };
  }
  const proposal = action.payload?.proposal || {};
  const message = formatProposalForDelivery(proposal, options);
  return { ok: true, reasons: [], message, lifecycle: gate.lifecycle };
}

export default {
  PROPOSAL_LIFECYCLE,
  mapActionToLifecycle,
  lifecycleLabel,
  canSendProposal,
  generateShareToken,
  buildProposalCard,
  createProposalVersion,
  applyProposalEdits,
  buildProposalTimeline,
  buildPublicProposalView,
  recommendProposalFollowUp,
  crmStageSuggestion,
  prepareDeliveryMessage
};
