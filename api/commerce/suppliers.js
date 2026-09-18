/**
 * Commerce supplier integration API
 * - Lists supplier readiness (no secrets)
 * - Queues product import candidates (admin JWT recommended; service role for internal)
 * Never auto-publishes products. Never places supplier orders automatically.
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

function envPresent(name) {
  return !!(name && process.env[name] && String(process.env[name]).length > 3);
}

const PROVIDER_ENV = {
  aliexpress: ['ALIEXPRESS_API_KEY', 'ALIEXPRESS_API_SECRET'],
  alibaba: ['ALIBABA_API_KEY', 'ALIBABA_API_SECRET'],
  cj_dropshipping: ['CJ_API_KEY', 'CJ_API_SECRET'],
  amazon: ['AMAZON_PAAPI_KEY', 'AMAZON_PAAPI_SECRET', 'AMAZON_PARTNER_TAG'],
  dsers: ['DSERS_API_KEY'],
  manual: [],
};

async function sb(path, { method = 'GET', body, token } = {}) {
  const key = SERVICE || ANON;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${token || key}`,
    'Content-Type': 'application/json',
  };
  if (method !== 'GET') headers.Prefer = 'return=representation';
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) {
    const err = new Error(data?.message || data?.error || text || 'Supabase error');
    err.status = r.status;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const action = String(req.query?.action || 'status');

      if (action === 'status') {
        let suppliers = [];
        try {
          suppliers = await sb('commerce_suppliers?select=id,provider,display_name,status,fulfillment_mode,last_synced_at,metadata,country,website,category,shipping_method,delivery_time_min_days,delivery_time_max_days,payment_terms,commission_pct,notes,supplier_type,api_connection_status&order=display_name');
        } catch (e) {
          return json(res, 200, {
            suppliers: [],
            note: 'Run migrations 009 and 025. ' + (e.message || ''),
            auto_purchase: false,
          });
        }
        const readiness = (Array.isArray(suppliers) ? suppliers : []).map((s) => {
          const envKeys = PROVIDER_ENV[s.provider] || [];
          const keysOk = envKeys.length === 0 ? true : envKeys.every(envPresent);
          return {
            id: s.id,
            provider: s.provider,
            display_name: s.display_name,
            status: s.status,
            fulfillment_mode: s.fulfillment_mode || 'approval_required',
            credentials_configured: keysOk,
            env_keys_expected: envKeys,
            last_synced_at: s.last_synced_at,
            research_only: s.provider === 'amazon',
            can_auto_order: false,
          };
        });
        return json(res, 200, {
          suppliers: readiness,
          auto_purchase: false,
          publish_requires_approval: true,
          order_flow: [
            'customer_order',
            'admin_approval',
            'supplier_order_preparation',
            'tracking_update',
            'customer_notification',
          ],
        });
      }

      if (action === 'queue') {
        const rows = await sb(
          'product_import_queue?select=id,status,proposed_name_ar,proposed_price,proposed_cost,profit_margin_pct,source_url,created_at&order=created_at.desc&limit=50'
        );
        return json(res, 200, { queue: rows || [], auto_publish: false });
      }

      return json(res, 400, { error: 'Unknown action' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const action = String(body.action || '').toLowerCase();

      if (action === 'queue_import') {
        // Stage only — never publish
        const row = {
          supplier_id: body.supplier_id || null,
          external_product_id: body.external_product_id || null,
          source_url: body.source_url || null,
          raw_payload: body.raw_payload || {},
          proposed_name_ar: body.proposed_name_ar || null,
          proposed_name_en: body.proposed_name_en || null,
          proposed_description_ar: body.proposed_description_ar || null,
          proposed_price: body.proposed_price ?? null,
          proposed_cost: body.proposed_cost ?? null,
          proposed_images: body.proposed_images || [],
          seo_title_ar: body.seo_title_ar || null,
          seo_keywords_ar: body.seo_keywords_ar || null,
          profit_margin_pct: body.profit_margin_pct ?? null,
          ai_research: body.ai_research || {},
          status: 'pending_review',
        };
        if (!SERVICE) {
          return json(res, 503, { error: 'SERVICE_ROLE required to write queue from API' });
        }
        const inserted = await sb('product_import_queue', { method: 'POST', body: row });
        return json(res, 201, {
          item: Array.isArray(inserted) ? inserted[0] : inserted,
          message: 'Queued for admin review — not published',
        });
      }

      if (action === 'log_sync') {
        if (!SERVICE) return json(res, 503, { error: 'SERVICE_ROLE required' });
        const log = {
          supplier_id: body.supplier_id || null,
          sync_type: body.sync_type || 'manual',
          status: body.status || 'started',
          message: body.message || 'Manual sync placeholder — connect official API',
          details: body.details || {},
        };
        const inserted = await sb('supplier_sync_logs', { method: 'POST', body: log });
        return json(res, 201, { log: Array.isArray(inserted) ? inserted[0] : inserted });
      }

      return json(res, 400, { error: 'Unknown action' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'Internal error' });
  }
}
