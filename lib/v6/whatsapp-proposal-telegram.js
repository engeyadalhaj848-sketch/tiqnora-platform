/**
 * Telegram owner approval of a CRM proposal. Not a WhatsApp sender.
 * Callback data contains only an action UUID; never accept prices from chat.
 * All effects are injected to support deterministic regression testing.
 */
import { createHash } from 'node:crypto';
import { validateProposalDeliveryAction } from './proposal-delivery.js';

export function proposalReviewKeyboard(actionId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(actionId || ''))) return null;
  return { inline_keyboard: [[
    { text: '✅ اعتماد بعد التسعير', callback_data: 'proposal_ok:' + actionId },
    { text: '❌ رفض العرض', callback_data: 'proposal_no:' + actionId }
  ]] };
}

export function parseProposalReviewCallback(data) {
  const value = String(data || '');
  const first = value.match(/^proposal_(ok|no):([0-9a-f-]{36})$/i);
  if (first) return { decision: first[1].toLowerCase() === 'ok' ? 'approve' : 'reject', action_id: first[2], confirmation: null };
  const final = value.match(/^proposal_yes:([0-9a-f-]{36}):([a-f0-9]{10})$/i);
  if (final) return { decision: 'approve', action_id: final[1], confirmation: final[2].toLowerCase() };
  return null;
}

export function proposalPricingFingerprint(action = {}) {
  const p = action.payload?.proposal || {};
  const pricing = p.pricing || {};
  const snapshot = {
    id: String(action.id || ''),
    title: String(p.title || ''),
    pricing: {
      status: pricing.status || '',
      currency: pricing.currency || 'SAR',
      total: pricing.total ?? null,
      subtotal: pricing.subtotal ?? null,
      vat: pricing.vat ?? null,
      line_items: Array.isArray(pricing.line_items) ? pricing.line_items : []
    }
  };
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 10);
}

export function proposalPriceConfirmationText(action = {}) {
  const price = action.payload?.proposal?.pricing || {};
  const currency = price.currency || 'SAR';
  const parts = [
    '⚠️ تأكيد نهائي لاعتماد عرض السعر',
    'العرض: ' + (action.payload?.proposal?.title || '—'),
    'الإجمالي: ' + (price.total ?? 'غير محدد') + ' ' + currency,
    'قبل الضريبة: ' + (price.subtotal ?? 'غير محدد') + ' ' + currency,
    'الضريبة: ' + (price.vat ?? 'غير محددة') + ' ' + currency,
    ...((price.line_items || []).filter(li => li.price !== null && li.price !== undefined).slice(0, 10)
      .map(li => '• ' + li.service + ': ' + li.price + ' ' + currency)),
    '',
    'راجع السعر والنطاق بعناية. تأكيد الاعتماد لا يرسل العرض إلى العميل تلقائيًا.'
  ];
  return parts.join('\n').slice(0, 3600);
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

  if (parsed.decision === 'approve' && !parsed.confirmation) {
    const fingerprint = proposalPricingFingerprint(action);
    const confirmationKeyboard = { inline_keyboard: [[
      { text: '✅ تأكيد اعتماد السعر', callback_data: 'proposal_yes:' + action.id + ':' + fingerprint },
      { text: '❌ رفض العرض', callback_data: 'proposal_no:' + action.id }
    ]] };
    if (typeof notifyOwner !== 'function') {
      await reply('لا تتوفر رسالة التأكيد النهائي. لم يتغير العرض.');
      return { handled: true, ok: false, reason: 'confirmation_delivery_unavailable' };
    }
    await notifyOwner(chatId, proposalPriceConfirmationText(action), { reply_markup: confirmationKeyboard });
    await reply('راجع تفاصيل السعر واضغط التأكيد النهائي.');
    return { handled: true, ok: true, stage: 'awaiting_price_confirmation', customer_sent: false };
  }
  if (parsed.decision === 'approve' && parsed.confirmation !== proposalPricingFingerprint(action)) {
    await reply('تم تعديل السعر بعد عرض التأكيد. أعد المراجعة من البداية.');
    return { handled: true, ok: false, reason: 'price_changed_since_preview' };
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
