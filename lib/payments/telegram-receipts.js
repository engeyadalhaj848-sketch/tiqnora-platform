/**
 * Verified payment -> private Telegram notification.
 *
 * The PostgreSQL AFTER UPDATE trigger enqueues an outbox row only after a Whop
 * payment was marked paid. This worker claims each row atomically through
 * conditional PostgREST PATCH, so webhook retries and duplicate events do not
 * normally send duplicate messages. Failed or abandoned sends are retried by
 * the existing authenticated cron route.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/, '');

function serviceKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const key = serviceKey();
  if (!key) throw new Error('service_role_not_configured');
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation'
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000)
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) throw new Error('supabase_request_failed_' + response.status);
  return data;
}

export function formatPaymentTelegramReceipt(order) {
  const meta = order.payment_meta || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const service = String(meta.description || items.map(it => it.title_ar || it.title_en || '').filter(Boolean).join('، ') || order.notes || 'طلب من تيكنورا')
    .trim().slice(0, 300);
  const amount = Number(order.total);
  const formatted = Number.isFinite(amount) ? amount.toFixed(2) : '—';
  const paidAt = meta.paid_at || order.updated_at || null;
  let date = '—';
  if (paidAt && !Number.isNaN(Date.parse(paidAt))) {
    date = new Intl.DateTimeFormat('ar-SA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(paidAt));
  }
  return [
    '💰 دفعة جديدة وصلت إلى Tiqnora AI',
    '✅ تم تأكيد الدفع الإلكتروني بنجاح',
    '',
    '👤 العميل: ' + String(order.customer_name || '—').slice(0, 100),
    '🛠 الخدمة / الطلب: ' + service,
    '💵 المبلغ: ' + formatted + ' ر.س',
    '🧾 رقم الطلب: ' + String(order.order_number || '—'),
    '🕐 وقت الدفع (السعودية): ' + date,
    '',
    '🔗 متابعة الطلب:',
    'https://www.tiqnora.com/admin.html#orders'
  ].join('\n');
}

async function paymentTelegramChatId() {
  const override = String(process.env.TELEGRAM_PAYMENT_CHAT_ID || '').trim();
  if (/^-?\d+$/.test(override)) return override;
  const rows = await rest('integration_connections?provider=eq.telegram&select=metadata&limit=1');
  const pairedChat = String(rows?.[0]?.metadata?.paired_chat_id || '').trim();
  // Payment receipts can contain customer names: default to owner's private chat,
  // never fall back to the collaboration group chat.
  return /^\d+$/.test(pairedChat) ? pairedChat : null;
}

async function sendTelegram(chatId, message) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('telegram_token_not_configured');
  const response = await fetch('https://api.telegram.org/bot' + encodeURIComponent(token) + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true
    }),
    signal: AbortSignal.timeout(12000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error('telegram_send_failed_' + response.status);
  }
}

async function patchNotification(id, data, filters = '') {
  return rest('payment_telegram_notifications?id=eq.' + encodeURIComponent(id) + filters + '&select=id,order_id,status', {
    method: 'PATCH',
    body: { ...data, updated_at: new Date().toISOString() }
  });
}

async function claim(row) {
  const staleCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const filter = row.status === 'sending'
    ? '&status=eq.sending&claimed_at=lt.' + encodeURIComponent(staleCutoff)
    : '&status=eq.pending';
  const updated = await patchNotification(row.id, {
    status: 'sending',
    claimed_at: new Date().toISOString(),
    attempts: Number(row.attempts || 0) + 1,
    last_error: null
  }, filter);
  return Array.isArray(updated) && updated.length === 1;
}

function verifiedPaidOrder(order) {
  return order && order.payment_provider === 'whop' && order.payment_status === 'paid'
    && !!order.provider_payment_id && !!order.payment_meta?.paid_at
    && ['payment.succeeded', 'payment.created'].includes(String(order.payment_meta?.last_event || ''))
    && !['refunded', 'cancelled'].includes(String(order.status || ''));
}

async function pendingRows(orderId, limit) {
  const selector = orderId ? '&order_id=eq.' + encodeURIComponent(orderId) : '';
  const count = Math.max(1, Math.min(10, Number(limit) || 5));
  const expired = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const [pending, stalled] = await Promise.all([
    rest('payment_telegram_notifications?select=id,order_id,status,attempts'
      + '&status=eq.pending' + selector + '&order=created_at.asc&limit=' + count),
    rest('payment_telegram_notifications?select=id,order_id,status,attempts'
      + '&status=eq.sending&claimed_at=lt.' + encodeURIComponent(expired) + selector
      + '&order=created_at.asc&limit=' + count)
  ]);
  return [...(pending || []), ...(stalled || [])].slice(0, count);
}

export async function deliverPendingPaymentTelegramNotifications({ orderId = null, limit = 5 } = {}) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !serviceKey()) {
    return { sent: 0, pending: 0, reason: 'not_configured' };
  }
  const chatId = await paymentTelegramChatId();
  if (!chatId) return { sent: 0, pending: 0, reason: 'owner_private_chat_not_paired' };
  const rows = await pendingRows(orderId, limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (!await claim(row)) continue;
    try {
      const found = await rest('orders?id=eq.' + encodeURIComponent(row.order_id)
        + '&select=order_number,customer_name,items,notes,total,payment_status,payment_provider,provider_payment_id,payment_meta,status,updated_at&limit=1');
      const order = Array.isArray(found) ? found[0] : null;
      if (!verifiedPaidOrder(order)) {
        await patchNotification(row.id, { status: 'skipped', last_error: 'payment_not_eligible' }, '&status=eq.sending');
        continue;
      }
      await sendTelegram(chatId, formatPaymentTelegramReceipt(order));
      await patchNotification(row.id, { status: 'sent', sent_at: new Date().toISOString(), last_error: null }, '&status=eq.sending');
      sent++;
    } catch (err) {
      failed++;
      console.error('[payment_telegram] delivery failed:', String(err?.message || err).slice(0, 150));
      await patchNotification(row.id, { status: 'pending', last_error: String(err?.message || err).slice(0, 200) }, '&status=eq.sending')
        .catch(() => {});
    }
  }
  return { sent, failed, pending: rows.length };
}
