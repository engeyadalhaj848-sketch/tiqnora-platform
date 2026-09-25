/**
 * Tiqnora V6 — Approved Proposal Delivery Guard
 * Pure logic: validates a reviewed proposal and formats a compact outbound message.
 * It never sends, writes to DB, schedules, or invents pricing/timeline.
 */

const ALLOWED_PROPOSAL_STATUSES = new Set(['draft_ready', 'ready_for_human_review']);
const SUPPORTED_PLATFORMS = new Set(['whatsapp', 'instagram', 'facebook']);

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

function confirmedPriceExists(pricing = {}) {
  if (pricing.status !== 'confirmed_input') return false;
  if (finiteNumber(pricing.total) || finiteNumber(pricing.subtotal)) return true;
  return Array.isArray(pricing.line_items) && pricing.line_items.some(item => finiteNumber(item?.price));
}

export function validateProposalDeliveryAction(action = {}) {
  const reasons = [];
  const proposal = action?.payload?.proposal || null;

  if (action.action_type !== 'proposal_review') reasons.push('wrong_action_type');
  if (action.status !== 'approved') reasons.push('human_approval_required');
  if (!proposal) reasons.push('proposal_missing');
  if (proposal && !ALLOWED_PROPOSAL_STATUSES.has(proposal.status)) reasons.push('proposal_not_ready');
  if (proposal && !confirmedPriceExists(proposal.pricing || {})) reasons.push('confirmed_pricing_required');

  return {
    ready: reasons.length === 0,
    reasons,
    proposal_status: proposal?.status || null,
    pricing_status: proposal?.pricing?.status || null
  };
}

function money(value, currency, language) {
  if (!finiteNumber(value)) return null;
  const locale = language === 'en' ? 'en-US' : 'ar-SA';
  const formatted = Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  return `${formatted} ${currency || 'SAR'}`;
}

function trimMessage(text, maxLength) {
  const clean = String(text || '').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

export function formatProposalForDelivery(proposal = {}, options = {}) {
  const language = options.language === 'en' || proposal.language === 'en' ? 'en' : 'ar';
  const maxLength = Math.max(500, Math.min(Number(options.maxLength || 3900), 4096));
  const pricing = proposal.pricing || {};
  const currency = pricing.currency || 'SAR';
  const solution = Array.isArray(proposal.recommended_solution) ? proposal.recommended_solution : [];
  const lines = [];

  if (language === 'en') {
    lines.push(proposal.title || 'Proposal');
    if (proposal.client?.name) lines.push(`Client: ${proposal.client.name}`);

    if (solution.length) {
      lines.push('', 'Recommended solution:');
      for (const item of solution.slice(0, 8)) lines.push(`• ${item.label || item.service}`);
    }

    const pricedItems = (pricing.line_items || []).filter(item => finiteNumber(item?.price));
    if (pricedItems.length || finiteNumber(pricing.subtotal) || finiteNumber(pricing.total)) {
      lines.push('', 'Confirmed pricing:');
      for (const item of pricedItems.slice(0, 10)) {
        lines.push(`• ${item.service}: ${money(item.price, currency, language)}`);
      }
      if (finiteNumber(pricing.subtotal)) lines.push(`Subtotal: ${money(pricing.subtotal, currency, language)}`);
      if (finiteNumber(pricing.vat)) lines.push(`VAT: ${money(pricing.vat, currency, language)}`);
      if (finiteNumber(pricing.total)) lines.push(`Total: ${money(pricing.total, currency, language)}`);
    }

    if (proposal.timeline?.requested_timeline) {
      lines.push('', `Requested timeline: ${proposal.timeline.requested_timeline}`);
    }
    if (proposal.executive_summary) lines.push('', proposal.executive_summary);
    lines.push('', 'If the proposal is suitable, we can proceed with the confirmed next steps.');
  } else {
    lines.push(proposal.title || 'عرض Tiqnora');
    if (proposal.client?.name) lines.push(`العميل: ${proposal.client.name}`);

    if (solution.length) {
      lines.push('', 'الحل المقترح:');
      for (const item of solution.slice(0, 8)) lines.push(`• ${item.label || item.service}`);
    }

    const pricedItems = (pricing.line_items || []).filter(item => finiteNumber(item?.price));
    if (pricedItems.length || finiteNumber(pricing.subtotal) || finiteNumber(pricing.total)) {
      lines.push('', 'التسعير المؤكد:');
      for (const item of pricedItems.slice(0, 10)) {
        lines.push(`• ${item.service}: ${money(item.price, currency, language)}`);
      }
      if (finiteNumber(pricing.subtotal)) lines.push(`الإجمالي قبل الضريبة: ${money(pricing.subtotal, currency, language)}`);
      if (finiteNumber(pricing.vat)) lines.push(`ضريبة القيمة المضافة: ${money(pricing.vat, currency, language)}`);
      if (finiteNumber(pricing.total)) lines.push(`الإجمالي: ${money(pricing.total, currency, language)}`);
    }

    if (proposal.timeline?.requested_timeline) {
      lines.push('', `المدة المطلوبة من العميل: ${proposal.timeline.requested_timeline}`);
    }
    if (proposal.executive_summary) lines.push('', proposal.executive_summary);
    lines.push('', 'إذا كان العرض مناسبًا لكم، نكمل الخطوات التالية بعد تأكيدكم.');
  }

  return trimMessage(lines.filter(x => x !== null && x !== undefined).join('\n'), maxLength);
}

export function chooseProposalDeliveryEvent(events = [], action = {}) {
  const rows = Array.isArray(events) ? events : [];
  return rows.find(event => {
    const platform = String(event?.platform || '').toLowerCase();
    const type = String(event?.event_type || '');
    if (!SUPPORTED_PLATFORMS.has(platform)) return false;
    if (!['message.received', 'comment.created'].includes(type)) return false;
    if (action.conversation_id && event.conversation_id && String(action.conversation_id) !== String(event.conversation_id)) return false;
    if (action.lead_id && event.lead_id && String(action.lead_id) !== String(event.lead_id)) return false;
    return true;
  }) || null;
}

export default {
  validateProposalDeliveryAction,
  formatProposalForDelivery,
  chooseProposalDeliveryEvent
};
