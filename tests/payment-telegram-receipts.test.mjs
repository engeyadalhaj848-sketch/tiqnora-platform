import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'safe_test_key';
process.env.TELEGRAM_BOT_TOKEN = 'safe_test_bot';
delete process.env.TELEGRAM_PAYMENT_CHAT_ID;

const { formatPaymentTelegramReceipt, deliverPendingPaymentTelegramNotifications } =
  await import('../lib/payments/telegram-receipts.js');

const order = {
  id: 'fake-order-id',
  order_number: 'TQ-PAY-123',
  customer_name: 'Sample Customer',
  total: 500,
  payment_status: 'paid',
  payment_provider: 'whop',
  provider_payment_id: 'pay_verified',
  payment_meta: {
    description: 'تصميم موقع إلكتروني',
    paid_at: '2026-10-10T19:00:00.000Z',
    last_event: 'payment.succeeded'
  },
  status: 'confirmed'
};
const row = { id: 'notification-1', order_id: order.id, status: 'pending', attempts: 0 };
function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

test('receipt contains customer, agreement, SAR total, order and Riyadh time', () => {
  const text = formatPaymentTelegramReceipt(order);
  assert.match(text, /Sample Customer/);
  assert.match(text, /تصميم موقع إلكتروني/);
  assert.match(text, /500\.00 ر\.س/);
  assert.match(text, /TQ-PAY-123/);
  assert.match(text, /Tiqnora AI/);
});

test('only private paired Telegram chat gets paid receipt, duplicate row is skipped', async () => {
  const telegram = [];
  let pending = [row];
  let state = 'pending';
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    if (u.includes('/integration_connections?')) {
      return response([{ metadata: { paired_chat_id: '123456789', collaboration_chat_id: '-100123' } }]);
    }
    if (u.includes('/payment_telegram_notifications?') && method === 'GET') {
      return response(u.includes('status=eq.pending') ? pending : []);
    }
    if (u.includes('/payment_telegram_notifications?') && method === 'PATCH') {
      if (body.status === 'sending' && state === 'pending') {
        state = 'sending';
        return response([row]);
      }
      if (body.status === 'sent' && state === 'sending') {
        state = 'sent';
        pending = [];
        return response([row]);
      }
      return response([]);
    }
    if (u.includes('/orders?id=eq.')) return response([order]);
    if (u.includes('/sendMessage')) {
      telegram.push(body);
      return response({ ok: true, result: { message_id: 99 } });
    }
    throw Error('Unexpected route ' + u);
  };
  const first = await deliverPendingPaymentTelegramNotifications({ orderId: order.id, limit: 1 });
  assert.equal(first.sent, 1);
  assert.equal(telegram.length, 1);
  assert.equal(telegram[0].chat_id, '123456789');
  assert.match(telegram[0].text, /500\.00/);
  const second = await deliverPendingPaymentTelegramNotifications({ orderId: order.id, limit: 1 });
  assert.equal(second.sent, 0);
  assert.equal(telegram.length, 1);
});

test('no Telegram message for a non-paid order', async () => {
  let telegramCalls = 0;
  let lastStatus = '';
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    if (u.includes('/integration_connections?')) return response([{ metadata: { paired_chat_id: '123456789' } }]);
    if (u.includes('/payment_telegram_notifications?') && method === 'GET') {
      return response(u.includes('status=eq.pending') ? [row] : []);
    }
    if (u.includes('/payment_telegram_notifications?') && method === 'PATCH') {
      lastStatus = body.status;
      return response([row]);
    }
    if (u.includes('/orders?id=eq.')) return response([{ ...order, payment_status: 'unpaid' }]);
    if (u.includes('/sendMessage')) { telegramCalls++; return response({ ok: true }); }
    throw Error('Unexpected URL ' + u);
  };
  await deliverPendingPaymentTelegramNotifications({ orderId: order.id, limit: 1 });
  assert.equal(telegramCalls, 0);
  assert.equal(lastStatus, 'skipped');
});

test('Telegram API failures leave the notification pending for retry', async () => {
  let lastStatus = '';
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    if (u.includes('/integration_connections?')) return response([{ metadata: { paired_chat_id: '123456789' } }]);
    if (u.includes('/payment_telegram_notifications?') && method === 'GET') {
      return response(u.includes('status=eq.pending') ? [row] : []);
    }
    if (u.includes('/payment_telegram_notifications?') && method === 'PATCH') {
      lastStatus = body.status;
      return response([row]);
    }
    if (u.includes('/orders?id=eq.')) return response([order]);
    if (u.includes('/sendMessage')) return response({ ok: false }, 502);
    throw Error('Unexpected URL ' + u);
  };
  const result = await deliverPendingPaymentTelegramNotifications({ orderId: order.id });
  assert.equal(result.failed, 1);
  assert.equal(lastStatus, 'pending');
});

test('SQL trigger requires provider-confirmed payment and unique outbox entry', () => {
  const ddl = readFileSync('supabase/migrations/078_payment_telegram_notifications.sql', 'utf8');
  assert.match(ddl, /NEW\.payment_status = 'paid'/);
  assert.match(ddl, /NEW\.payment_provider = 'whop'/);
  assert.match(ddl, /NEW\.provider_payment_id IS NOT NULL/);
  assert.match(ddl, /order_id uuid NOT NULL UNIQUE/);
  assert.match(ddl, /ON CONFLICT \(order_id\) DO NOTHING/);
});
