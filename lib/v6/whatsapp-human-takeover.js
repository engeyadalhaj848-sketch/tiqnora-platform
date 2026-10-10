/**
 * Per-customer WhatsApp human takeover. Uses existing persisted outbound
 * social_events (including YCloud SMB app echoes) as the source of truth,
 * so no schema migration or in-memory state is needed on Vercel.
 *
 * A human message mutes the AI for that customer on that connection for
 * two hours after the most recent human message. Other customers stay active.
 */
export const WHATSAPP_HUMAN_TAKEOVER_MS = 2 * 60 * 60 * 1000;

function phone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^[1-9]\d{6,14}$/.test(digits) ? '+' + digits : null;
}

export function isHumanWhatsAppMessage(row, {
  customerPhone,
  conversationId = null,
  now = Date.now(),
  windowMs = WHATSAPP_HUMAN_TAKEOVER_MS
} = {}) {
  const target = phone(customerPhone);
  const sentAt = Date.parse(row?.occurred_at || '');
  if (!target || !Number.isFinite(sentAt)
    || now - sentAt >= windowMs || sentAt - now > 5 * 60 * 1000) return false;

  const raw = row?.raw_payload || {};
  // A message typed in the WhatsApp Business phone app (YCloud coexistence).
  if (raw.adapter === 'ycloud' && raw.kind === 'app_echo') {
    return phone(raw.message?.to) === target;
  }

  // A person responding from Tiqnora's admin inbox, not the AI.
  if (raw.adapter === 'tiqnora_outbound') {
    const mode = String(raw.mode || '').toLowerCase();
    const human = mode === 'manual_reply' || mode === 'approved_proposal'
      || (!mode && Boolean(raw.in_reply_to)); // pre-fix manual reply records
    if (!human) return false;
    return phone(raw.recipient_phone) === target
      || Boolean(conversationId && row.conversation_id === conversationId);
  }
  return false;
}

export async function whatsappHumanTakeoverActive({
  rest,
  organizationId,
  connectionId,
  customerPhone,
  conversationId = null,
  now = Date.now(),
  windowMs = WHATSAPP_HUMAN_TAKEOVER_MS
} = {}) {
  if (typeof rest !== 'function') throw new TypeError('rest is required');
  // Never assume automation may proceed if the sender or account is unknown.
  if (!organizationId || !connectionId || !phone(customerPhone)) return true;

  const cutoff = new Date(now - windowMs).toISOString();
  const query = 'social_events?organization_id=eq.' + encodeURIComponent(organizationId)
    + '&connection_id=eq.' + encodeURIComponent(connectionId)
    + '&platform=eq.whatsapp&event_type=eq.message.sent'
    + '&occurred_at=gte.' + encodeURIComponent(cutoff)
    + '&select=occurred_at,conversation_id,raw_payload'
    + '&order=occurred_at.desc&limit=200';
  const rows = await rest(query);
  if (!Array.isArray(rows)) throw new Error('Cannot verify WhatsApp human takeover status');

  if (rows.some(row => isHumanWhatsAppMessage(row, { customerPhone, conversationId, now, windowMs }))) {
    return true;
  }
  // Never infer no takeover if the 200-row result window was truncated.
  return rows.length >= 200;
}
