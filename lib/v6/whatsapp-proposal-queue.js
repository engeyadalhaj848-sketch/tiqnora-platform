/**
 * Qualified inbound WhatsApp -> CRM-backed proposal review queue.
 * This module NEVER sends a customer message, approves pricing, or publishes.
 * All database/network effects are injected and scoped by organization.
 */
import { buildProposalDraft } from './proposal-composer.js';

const CATALOG_SERVICE = Object.freeze({
  website: 'website',
  ecommerce: 'ecommerce',
  whatsapp_automation: 'whatsapp_automation',
  ai_agent: 'ai_agent',
  voice_agent: 'ai_agent',
  social: 'social_media',
  seo: 'local_seo'
});

export function buildQualifiedWhatsAppProposal({ summary = {}, lead = {} } = {}) {
  // A customer asking for a human, or a commercial deal under human control,
  // must not silently become a quote or start a new sales qualification.
  if (summary.handoff_reason !== 'customer_confirmed_requirements') {
    return { eligible: false, reason: 'qualification_not_confirmed' };
  }
  const service = CATALOG_SERVICE[String(summary.service || '')];
  if (!service) return { eligible: false, reason: 'unsupported_service' };
  if (!summary.customer_phone && !lead?.phone && !lead?.whatsapp) {
    return { eligible: false, reason: 'contact_missing' };
  }
  const companyName = summary.company || lead.company_name || null;
  const contactName = summary.customer_name || lead.contact_name || lead.name || null;
  const phone = summary.customer_phone || lead.whatsapp || lead.phone || null;
  const qualification = {
    timeline: summary.timeline || null,
    budget: summary.budget || null, // customer's budget, NOT a confirmed Tiqnora price
    decision_maker: summary.decision_maker === true
  };
  const input = {
    inbox_analysis: {
      intent: 'quote_request',
      service_interest: [service],
      contact: { name: contactName, phone },
      qualification
    },
    enrichment: {
      vertical: { id: lead.industry || 'general' },
      services: { primary: [service], secondary: [] }
    },
    lead: {
      ...lead,
      company_name: companyName,
      contact_name: contactName,
      phone,
      custom_fields: { ...(lead.custom_fields || {}), service_interest: [service], qualification }
    },
    qualification
  };
  const proposal = buildProposalDraft(input, { language: 'ar' });
  // Retain customer requirements verbatim as unverified input; avoid merging
  // them into Tiqnora promises, confirmed scope, prices or timelines.
  proposal.customer_requirements = {
    goal: summary.goal || null,
    requested_scope: summary.scope || null,
    preferred_timeline: summary.timeline || null,
    stated_budget: summary.budget || null
  };
  return { eligible: proposal.status !== 'not_ready', proposal, service };
}

export function proposalReviewNotice({ proposal, actionId, leadId } = {}) {
  const req = proposal?.customer_requirements || {};
  const lines = [
    '📋 مسودة عرض تلقائية من طلب واتساب مؤكد',
    'العميل: ' + (proposal?.client?.name || 'غير محدد'),
    'الخدمة: ' + ((proposal?.recommended_solution || []).map(s => s.label || s.service).join('، ') || 'غير محددة'),
    'الهدف: ' + (req.goal || 'لم يحدد'),
    'التفاصيل: ' + (req.requested_scope || 'تحتاج مراجعة'),
    'المدة المطلوبة: ' + (req.preferred_timeline || 'غير محددة'),
    'ميزانية العميل: ' + (req.stated_budget || 'غير محددة'),
    'حالة المسودة: ' + (proposal?.status || 'غير جاهزة'),
    'معرف العرض: ' + (actionId || '—'),
    'معرف الفرصة: ' + (leadId || '—'),
    '',
    '⚠️ لا يوجد تسعير معتمد. راجع النطاق وأدخل السعر بنفسك في لوحة عروض Tiqnora.',
    'لا يتم إرسال أي عرض للعميل قبل اعتماد السعر والعرض بشكل صريح.'
  ];
  return lines.join('\n').slice(0, 3700);
}

/**
 * Idempotent logical queue for qualified inbound events. The upstream
 * social_event_actions reservation already limits duplicate webhooks.
 * The query adds recovery protection against repeated handoff attempts.
 */
export async function queueQualifiedWhatsAppProposal({
  rest, organizationId, eventId, conversationId, leadId, summary,
  lead = {}, notify = null
} = {}) {
  if (typeof rest !== 'function') throw new TypeError('rest_required');
  if (!organizationId || !eventId || !conversationId || !leadId) {
    return { queued: false, reason: 'source_link_missing' };
  }
  const built = buildQualifiedWhatsAppProposal({ summary, lead });
  if (!built.eligible) return { queued: false, reason: built.reason };
  const org = encodeURIComponent(organizationId);
  const event = encodeURIComponent(eventId);
  const existing = await rest(
    'actions?organization_id=eq.' + org +
    '&action_type=eq.proposal_review&payload->>source_event_id=eq.' + event +
    '&select=id,status&limit=1'
  );
  if (Array.isArray(existing) && existing.length) {
    return { queued: false, deduplicated: true, action_id: existing[0].id };
  }
  const payload = {
    proposal: built.proposal,
    proposal_status: built.proposal.status,
    pricing_status: built.proposal.pricing.status,
    client_name: built.proposal.client.name,
    source: 'agentic_whatsapp_confirmed_handoff',
    source_event_id: eventId,
    auto_send: false
  };
  const rows = await rest('actions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      action_type: 'proposal_review',
      status: 'pending_approval',
      payload,
      requires_approval: true,
      related_entity_type: 'lead',
      related_entity_id: leadId,
      lead_id: leadId,
      conversation_id: conversationId
    })
  });
  const action = Array.isArray(rows) ? rows[0] : null;
  if (!action?.id) throw new Error('proposal_review_insert_failed');

  let notified = false;
  if (typeof notify === 'function') {
    try {
      notified = await notify({
        action,
        proposal: built.proposal,
        text: proposalReviewNotice({ proposal: built.proposal, actionId: action.id, leadId })
      }) === true;
    } catch (error) {
      // Saved review remains visible in Tiqnora even if Telegram is offline.
      notified = false;
    }
  }
  return { queued: true, action_id: action.id, notified, proposal_status: built.proposal.status, external_actions: 0 };
}
