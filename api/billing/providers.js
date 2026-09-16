/** Payment providers readiness — no live charges. */
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));
  return res.status(200).end(JSON.stringify({
    livePayments: false,
    providers: [
      { slug: 'manual', name: 'Manual Admin', enabled: true, envRequired: [] },
      { slug: 'stripe', name: 'Stripe', enabled: false, envRequired: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
      { slug: 'hyperpay', name: 'HyperPay', enabled: false, envRequired: ['HYPERPAY_ENTITY_ID', 'HYPERPAY_ACCESS_TOKEN'] },
      { slug: 'tap', name: 'Tap Payments', enabled: false, envRequired: ['TAP_SECRET_KEY'] },
      { slug: 'mada', name: 'Mada', enabled: false, envRequired: ['MADA_VIA_PROVIDER'], note: 'Typically via HyperPay or Tap' }
    ],
    message: 'Architecture ready — enable a provider and set env vars to go live.'
  }));
}
