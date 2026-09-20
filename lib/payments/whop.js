/**
 * Whop Payments helpers — dynamic checkout via checkout_configurations.
 * Docs: POST /checkout_configurations (inline plan OR plan_id).
 * Inline plan without product_id causes Whop to create an access_pass (product).
 * Prefer WHOP_PRODUCT_ID to attach dynamic plans to an existing product.
 */
import { unwrapWebhook, WebhookVerificationError } from '@whop/sdk/helpers';

const PROD_API = 'https://api.whop.com/api/v1';
const SANDBOX_API = 'https://sandbox-api.whop.com/api/v1';

export function isSandbox() {
  const env = String(process.env.WHOP_ENVIRONMENT || 'sandbox').toLowerCase();
  return env !== 'production' && env !== 'live';
}

export function getWhopConfig() {
  const sandbox = isSandbox();
  const apiKey = process.env.WHOP_API_KEY || '';
  const accountId = process.env.WHOP_ACCOUNT_ID || '';
  const webhookSecret = process.env.WHOP_WEBHOOK_SECRET || '';
  const productId = process.env.WHOP_PRODUCT_ID || process.env.WHOP_ACCESS_PASS_ID || '';
  const currency = String(process.env.WHOP_CURRENCY || (sandbox ? 'usd' : 'usd')).toLowerCase();
  const missing = [];
  if (!apiKey) missing.push('WHOP_API_KEY');
  if (!accountId) missing.push('WHOP_ACCOUNT_ID');
  return {
    sandbox,
    apiKey,
    accountId,
    webhookSecret,
    productId,
    currency,
    baseUrl: sandbox ? SANDBOX_API : PROD_API,
    configured: missing.length === 0,
    missing,
  };
}

function extractWhopError(data, httpStatus) {
  if (!data || typeof data !== 'object') {
    return {
      message: `Whop HTTP ${httpStatus}`,
      code: null,
      http_status: httpStatus,
    };
  }
  // Common shapes: { error: "..." }, { error: { code, message } }, { message }, { errors: [] }
  let code = null;
  let message = null;
  if (typeof data.error === 'string') {
    message = data.error;
    code = data.error;
  } else if (data.error && typeof data.error === 'object') {
    code = data.error.code || data.error.type || data.error.error || null;
    message = data.error.message || data.error.error_description || message;
  }
  if (typeof data.message === 'string') message = message || data.message;
  if (typeof data.code === 'string') code = code || data.code;
  if (Array.isArray(data.errors) && data.errors.length) {
    const first = data.errors[0];
    if (typeof first === 'string') message = message || first;
    else if (first && typeof first === 'object') {
      message = message || first.message || first.msg;
      code = code || first.code;
    }
  }
  // Nested raw
  if (!message && data.raw && typeof data.raw === 'string') message = data.raw.slice(0, 200);

  const codeStr = code ? String(code) : null;
  const msgStr = message ? String(message) : `Whop HTTP ${httpStatus}`;

  // Safe diagnostic for permission issues (no secrets)
  let permission_hint = null;
  const blob = `${codeStr || ''} ${msgStr}`.toLowerCase();
  if (blob.includes('product_create') || blob.includes('access_pass')) {
    permission_hint = {
      required_permissions: ['access_pass:create', 'access_pass:update', 'plan:create', 'checkout_configuration:create'],
      alternative: 'Create one Product in Whop Dashboard and set WHOP_PRODUCT_ID=prod_... to avoid creating products per order',
    };
  } else if (blob.includes('plan_create') || blob.includes('permission') || httpStatus === 403) {
    permission_hint = {
      required_permissions: ['plan:create', 'checkout_configuration:create', 'checkout_configuration:basic:read'],
      alternative: null,
    };
  }

  return {
    message: msgStr,
    code: codeStr,
    http_status: httpStatus,
    permission_hint,
  };
}

async function whopFetch(path, { method = 'GET', body } = {}) {
  const cfg = getWhopConfig();
  if (!cfg.apiKey) {
    return { ok: false, status: 503, error: 'WHOP_API_KEY missing', data: null, parsed: null };
  }
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Api-Version-Date': process.env.WHOP_API_VERSION_DATE || '2026-09-15',
  };
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text ? text.slice(0, 300) : null };
  }
  if (!res.ok) {
    const parsed = extractWhopError(data, res.status);
    // Safe server log — never log Authorization or secrets
    console.error('[whop]', method, path, 'status=', res.status, 'code=', parsed.code, 'msg=', String(parsed.message).slice(0, 120));
    return {
      ok: false,
      status: res.status,
      error: parsed.message,
      data,
      parsed,
    };
  }
  return { ok: true, status: res.status, data, parsed: null };
}

/**
 * Create checkout configuration with dynamic one-time amount.
 * Uses existing WHOP_PRODUCT_ID when set (recommended — avoids access_pass:create per order).
 * Does NOT call a separate Products API when product_id is provided.
 */
export async function createCheckoutConfiguration({
  amount,
  currency,
  orderId,
  orderNumber,
  title = 'Tiqnora Order',
}) {
  const cfg = getWhopConfig();
  if (!cfg.configured) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'Whop credentials not configured',
      missing: cfg.missing,
    };
  }

  const cur = (currency || cfg.currency || 'usd').toLowerCase();
  const price = Number(amount);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, status: 'error', message: 'invalid amount' };
  }
  // Whop paid plans typically require >= 1.00 in currency units
  if (price < 1) {
    return {
      ok: false,
      status: 'error',
      message: 'amount_below_minimum',
      details: { min: 1, currency: cur, amount: price },
    };
  }

  const plan = {
    initial_price: price,
    plan_type: 'one_time',
    currency: cur,
    title: String(title).slice(0, 80),
    visibility: 'hidden', // order-specific; not a public storefront product
  };

  // Prefer attaching to an existing Whop product to avoid product_create_failed
  if (cfg.productId) {
    plan.product_id = cfg.productId;
  }

  const body = {
    account_id: cfg.accountId,
    plan,
    metadata: {
      order_id: String(orderId),
      order_number: String(orderNumber || ''),
      source: 'tiqnora',
      environment: cfg.sandbox ? 'sandbox' : 'production',
    },
    redirect_url: `https://www.tiqnora.com/order-complete?order=${encodeURIComponent(String(orderNumber || orderId))}`,
  };

  const result = await whopFetch('/checkout_configurations', { method: 'POST', body });
  if (!result.ok) {
    return {
      ok: false,
      status: 'error',
      message: result.parsed?.message || result.error,
      code: result.parsed?.code || null,
      http_status: result.status,
      permission_hint: result.parsed?.permission_hint || null,
      details: {
        // Safe subset only
        has_product_id: !!cfg.productId,
        environment: cfg.sandbox ? 'sandbox' : 'production',
        currency: cur,
        // do not echo full Whop body if it could contain sensitive fields
        whop_error: result.parsed?.code || result.parsed?.message || null,
      },
    };
  }

  const sessionId = result.data?.id || null;
  const planId = result.data?.plan?.id || result.data?.plan_id || null;
  if (!sessionId) {
    return { ok: false, status: 'error', message: 'Whop response missing checkout id' };
  }

  return {
    ok: true,
    sessionId,
    planId,
    currency: cur,
    amount: price,
    sandbox: cfg.sandbox,
    environment: cfg.sandbox ? 'sandbox' : 'production',
    purchase_url: result.data?.purchase_url || null,
  };
}

/**
 * Official Whop webhook verification via @whop/sdk helpers (Standard Webhooks).
 * Pass WHOP_WEBHOOK_SECRET exactly as issued (ws_...). Do not strip or pre-encode.
 * Payload MUST be the exact raw request body string.
 */
export function normalizeWebhookHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (v == null) continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (val == null) continue;
    out[String(k).toLowerCase()] = String(val);
  }
  return out;
}

/**
 * @param {string} rawBody exact request body text
 * @param {Record<string, string|string[]|undefined>} headers
 * @returns {{ ok: true, event: object, eventId: string } | { ok: false, reason: string }}
 */
export function verifyAndUnwrapWebhook(rawBody, headers) {
  const key = process.env.WHOP_WEBHOOK_SECRET || '';
  if (!key) return { ok: false, reason: 'WHOP_WEBHOOK_SECRET missing' };
  if (typeof rawBody !== 'string' || !rawBody.length) {
    return { ok: false, reason: 'raw_body_required' };
  }
  const h = normalizeWebhookHeaders(headers);
  if (!h['webhook-id'] || !h['webhook-timestamp'] || !h['webhook-signature']) {
    return { ok: false, reason: 'missing_signature_headers' };
  }
  try {
    const event = unwrapWebhook(rawBody, { headers: h, key });
    const eventId = String(h['webhook-id'] || event?.id || '');
    return { ok: true, event, eventId };
  } catch (err) {
    const name = err?.constructor?.name || '';
    const msg = String(err?.message || err || '').slice(0, 120);
    // Never log the secret
    if (name === 'WebhookVerificationError' || msg.toLowerCase().includes('signature') || msg.toLowerCase().includes('timestamp')) {
      return { ok: false, reason: 'invalid_signature' };
    }
    console.error('[whop_webhook] unwrap failed:', name, msg);
    return { ok: false, reason: 'invalid_signature' };
  }
}

/** @deprecated use verifyAndUnwrapWebhook — kept name for any residual imports */
export function verifyWebhookSignature(rawBody, headers) {
  const r = verifyAndUnwrapWebhook(rawBody, headers);
  if (r.ok) return { ok: true, eventId: r.eventId, event: r.event };
  return { ok: false, reason: r.reason };
}

export function parseWebhookEvent(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

export default {
  isSandbox,
  getWhopConfig,
  createCheckoutConfiguration,
  verifyAndUnwrapWebhook,
  verifyWebhookSignature,
  parseWebhookEvent,
  normalizeWebhookHeaders,
};
