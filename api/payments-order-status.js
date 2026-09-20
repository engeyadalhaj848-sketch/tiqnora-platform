/**
 * GET /api/payments/order-status?order=TQ-...
 * Public-safe order payment status for return URL page (no secrets).
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });
  const host = req.headers?.host || 'www.tiqnora.com';
  const url = new URL(req.url || '/', `https://${host}`);
  const orderNumber = url.searchParams.get('order') || url.searchParams.get('order_number') || '';
  if (!orderNumber) return json(res, 400, { ok: false, error: 'order required' });
  if (!SERVICE) return json(res, 503, { ok: false, error: 'not_configured' });

  const r = await fetch(
    `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=order_number,status,payment_status,payment_provider,total,currency,created_at&limit=1`,
    {
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
      },
    }
  );
  const rows = await r.json().catch(() => []);
  const o = Array.isArray(rows) ? rows[0] : null;
  if (!o) return json(res, 404, { ok: false, error: 'not_found' });

  const paid = o.payment_status === 'paid';
  return json(res, 200, {
    ok: true,
    order_number: o.order_number,
    payment_status: o.payment_status,
    order_status: o.status,
    payment_provider: o.payment_provider,
    total: o.total,
    currency: o.currency || 'SAR',
    paid,
    message: paid
      ? 'تم تأكيد الدفع'
      : o.payment_status === 'pending'
        ? 'جارٍ التحقق من عملية الدفع'
        : o.payment_status === 'failed'
          ? 'فشل الدفع'
          : 'جارٍ التحقق من عملية الدفع',
  });
}
