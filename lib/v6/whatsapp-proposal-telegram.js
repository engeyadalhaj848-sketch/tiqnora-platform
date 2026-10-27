/**
 * Telegram owner approval of a CRM proposal. Not a WhatsApp sender.
 * Callback data contains only an action UUID; never accept prices from chat.
 * All effects are injected to support deterministic regression testing.
 */
import { validateProposalDeliveryAction } from './proposal-delivery.js';

export function proposalReviewKeyboard(actionId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(actionId || ''))) return null;
  return { inline_keyboard: [[
    { text: '✅ اعتماد بعد التسعير', callback_data: 'proposal_ok:' + actionId },
    { text: '❌ رفض العرض', callback_data: 'proposal_no:' + actionId }
  ]] };
}

export function parseProposalReviewCallback(data) {
  const match = String(data || '').match(/^proposal_(ok|no):([0-9a-f-]{36})$/i);
  if (!match) return null;
  return { decision: match[1].toLowerCase() === 'ok' ? 'approve' : 'reject', action_id: match[2] };
}

export function validateOwnerProposalDecision({ action = {}, decision = '' } = {}) {
  if (action.action_type !== 'proposal_review' ||
      action.payload?.source !== 'agentic_whatsapp_confirmed_handoff') {
    return { allowed: false, reason: 'not_agentic_whatsapp_proposal' };
  }
  if (action.status !== 'pending_approval') {
    return { allowed: false, reason: 'already_reviewed' };
  }
  if (decision === 'reject') return { allowed: true, decision };
  if (decision !== 'approve') return { allowed: false, reason: 'unknown_decision' };
  const validation = validateProposalDeliveryAction({ ...action, status: 'approved' });
  return validation.ready
    ? { allowed: true, decision }
    : { allowed: false, reason: 'pricing_or_scope_requires_review', validation };
}

export async function handleWhatsAppProposalReviewCallback(query, {
  rest, approvalTarget, answer, notifyOwner
} = {}) {
  const parsed = parseProposalReviewCallback(query?.data);
  if (!parsed) return { handled: false };
  const reply = async (text) => {
    if (typeof answer === 'function') await answer(query, text).catch(() => {});
  };
  if (typeof rest !== 'function' || typeof approvalTarget !== 'function') {
    await reply('تعذّر التحقق من صلاحية الاعتماد.');
    return { handled: true, ok: false, reason: 'approval_backend_unavailable' };
  }
  // Both the chat ID and Telegram user ID must match the configured owner.
  const target = await approvalTarget();
  const chatId = String(query?.message?.chat?.id || '');
  const userId = String(query?.from?.id || '');
  if (!target?.configured || !target.owner_telegram_user_id ||
      !target.chat_id || target.chat_id !== chatId ||
      target.owner_telegram_user_id !== userId) {
    await reply('هذا الإجراء مخصص لمالك تيكنورا المخوّل فقط.');
    return { handled: true, ok: false, reason: 'not_authorized_owner' };
  }
  const orgs = await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
  const orgId = orgs?.[0]?.id;
  if (!orgId) {
    await reply('تعذّر العثور على مساحة عمل تيكنورا.');
    return { handled: true, ok: false, reason: 'org_missing' };
  }
  const rows = await rest('actions?organization_id=eq.' + encodeURIComponent(orgId) +
    '&id=eq.' + encodeURIComponent(parsed.action_id) +
    '&action_type=eq.proposal_review&select=*&limit=1');
  const action = rows?.[0];
  if (!action) {
    await reply('لم يُعثر على مسودة العرض.');
    return { handled: true, ok: false, reason: 'action_missing' };
  }
  const guard = validateOwnerProposalDecision({ action, decision: parsed.decision });
  if (!guard.allowed) {
    const msg = guard.reason === 'pricing_or_scope_requires_review'
      ? 'راجع النطاق وأدخل سعرًا مؤكدًا من لوحة تيكنورا أولًا، ثم اضغط اعتماد.'
      : 'هذا العرض غير متاح لهذا الإجراء أو تم مراجعته سابقًا.';
    await reply(msg);
    return { handled: true, ok: false, reason: guard.reason, validation: guard.validation };
  }

  const timestamp = new Date().toISOString();
  const accepted = await rest(
    'actions?id=eq.' + encodeURIComponent(action.id) +
    '&organization_id=eq.' + encodeURIComponent(orgId) +
    '&status=eq.pending_approval', {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: parsed.decision === 'approve' ? 'approved' : 'cancelled',
        ...(parsed.decision === 'approve' ? { approved_at: timestamp } : {}),
        result: {
          ...(action.result || {}),
          telegram_reviewed_by_owner_id: userId,
          telegram_reviewed_at: timestamp,
          telegram_decision: parsed.decision,
          delivery_status: 'not_sent'
        },
        updated_at: timestamp
      })
    }
  );
  if (!Array.isArray(accepted) || !accepted[0]) {
    await reply('تمت معالجة هذه المسودة مسبقًا.');
    return { handled: true, ok: false, reason: 'concurrent_review' };
  }
  const message = parsed.decision === 'approve'
    ? 'تم اعتماد العرض. لم يُرسل للعميل بعد؛ يلزم تنفيذ الإرسال المنفصل بعد التحقق من قناة واتساب.'
    : 'تم رفض مسودة العرض. لم يُرسل أي شيء للعميل.';
  await reply(message);
  if (typeof notifyOwner === 'function') await notifyOwner(chatId, message).catch(() => {});
  return {
    handled: true, ok: true, decision: parsed.decision,
    action_id: action.id, customer_sent: false
  };
}
