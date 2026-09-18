/** Commerce AI + Product Scout + Suppliers status (single serverless fn — Hobby 12 limit) */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';
const VAT_RATE = 0.15;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.end(JSON.stringify(payload));
}

const MODE_PROMPTS = {
  research: `You are Tiqnora AI Commerce Agent for Saudi Arabia. Product research only. No auto-buy. Arabic preferred.`,
  profit: `You are Tiqnora AI profit analyst for SAR including 15% VAT awareness. Estimate margin. No purchase. Arabic preferred.`,
  trend: `You are Tiqnora AI trends advisor for Saudi e-commerce POS hotel CCTV construction. No auto-buy. Arabic preferred.`,
  campaign: `You are Tiqnora AI Marketing Agent. Campaign drafts only. Arabic primary.`,
  market_compare: `You are Tiqnora market comparison analyst. No live stock claims. Arabic.`,
  import_brief: `Prepare product import brief for admin review. Never publish.`,
  content: `Write Arabic sales copy for product listing. No supplier disclosure.`,
};

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/**
 * Full commercial analysis for Saudi market.
 * Cost path: supplier + shipping. Selling price is VAT-inclusive retail.
 * VAT on margin is estimated for decision support only (not tax advice).
 */
function analyzeProduct({ cost, ship, price, demand, competition, seoOpportunity }) {
  const purchaseTotal = cost + ship;
  const vatOnSale = price > 0 ? Number((price * VAT_RATE / (1 + VAT_RATE)).toFixed(2)) : 0;
  const netSale = Number((price - vatOnSale).toFixed(2));
  // Conservative: treat purchase as excl. VAT input unless stated otherwise
  const grossProfit = Number((price - purchaseTotal).toFixed(2));
  const marginPct = price > 0 ? Number(((grossProfit / price) * 100).toFixed(2)) : 0;
  const netMarginPct = netSale > 0 ? Number((((netSale - purchaseTotal) / netSale) * 100).toFixed(2)) : 0;

  let score = 50;
  // Margin weight
  if (marginPct >= 40) score += 25;
  else if (marginPct >= 30) score += 18;
  else if (marginPct >= 20) score += 10;
  else if (marginPct >= 12) score += 3;
  else score -= 15;
  // Demand
  if (demand === 'high') score += 15;
  else if (demand === 'medium') score += 6;
  else score -= 10;
  // Competition
  if (competition === 'low') score += 12;
  else if (competition === 'medium') score += 4;
  else score -= 12;
  // SEO opportunity
  if (seoOpportunity === 'high') score += 8;
  else if (seoOpportunity === 'low') score -= 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation = 'review';
  let reason = 'يحتاج مراجعة هامش وطلب السوق والضريبة.';
  if (score >= 72 && marginPct >= 25 && demand !== 'low') {
    recommendation = 'suitable';
    reason = 'درجة عالية وهامش مقبول للسوق السعودي — مرشّح بعد اعتماد المشرف.';
  } else if (score < 40 || marginPct < 12 || (demand === 'low' && competition === 'high')) {
    recommendation = 'not_suitable';
    reason = 'درجة منخفضة أو هامش ضعيف أو طلب منخفض مع منافسة عالية.';
  } else if (marginPct >= 22 && score >= 55) {
    recommendation = 'suitable';
    reason = 'هامش مقبول مع درجة متوسطة-جيدة — راجع الشحن والمورد المحلي إن أمكن.';
  }

  return {
    purchase_total: Number(purchaseTotal.toFixed(2)),
    vat_amount: vatOnSale,
    net_sale_estimate: netSale,
    expected_profit: grossProfit,
    margin_pct: marginPct,
    net_margin_pct_estimate: netMarginPct,
    score,
    recommendation,
    reason,
  };
}

async function callGemini(system, message, temperature = 0.45) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('لم يتم إعداد GEMINI_API_KEY'), { status: 503 });
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: { temperature, maxOutputTokens: 1400 },
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(payload.error?.message || 'Gemini failed'), { status: 502 });
  }
  return (payload.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
}

async function sbRest(path, { method = 'GET', body, prefer } = {}) {
  if (!SERVICE) return { error: 'no service key' };
  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) return { error: data?.message || data || r.statusText, status: r.status };
  return { data };
}

async function handleScout(body) {
  const productName = String(body.product_name || body.name || body.message || '').trim();
  if (!productName || productName.length > 200) {
    return { status: 400, payload: { error: 'product_name required' } };
  }
  const purchaseCost = num(body.purchase_cost ?? body.cost, 0);
  const shippingCost = num(body.shipping_cost ?? body.shipping, 0);
  let suggestedPrice = num(body.suggested_price ?? body.selling_price, 0);
  if (suggestedPrice <= 0 && purchaseCost > 0) {
    // Default retail ≈ 2.4x landed cost for tech accessories / devices in KSA
    suggestedPrice = Number(((purchaseCost + shippingCost) * 2.4).toFixed(2));
  }

  let ai = null;
  try {
    const text = await callGemini(
      `You are Tiqnora AI Product Scout for Saudi B2B/B2C tech marketplace (POS, hotel tech, CCTV, networking, construction).
Reply STRICT JSON only keys:
seo_title_ar, seo_description_ar, seo_keywords, product_category,
market_demand (low|medium|high), competition_level (low|medium|high),
seo_opportunity (low|medium|high), suggested_price_sar, notes_ar.
Categories prefer: pos-systems, hotel-technology, construction-tech, safety-security, networking, computers, printers.
Never place orders. Never publish.`,
      `Name: ${productName}\nSupplier: ${body.supplier || 'unknown'}\nCost SAR: ${purchaseCost}\nShipping: ${shippingCost}\nPrice: ${suggestedPrice}\nCategory hint: ${body.category || ''}`,
      0.25
    );
    try {
      ai = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    } catch {
      ai = { notes_ar: text.slice(0, 500) };
    }
  } catch (_) {
    ai = null;
  }

  if (ai?.suggested_price_sar && num(ai.suggested_price_sar) > 0 && body.suggested_price == null) {
    suggestedPrice = num(ai.suggested_price_sar);
  }
  const demand = ['low', 'medium', 'high'].includes(ai?.market_demand) ? ai.market_demand : 'medium';
  const competition = ['low', 'medium', 'high'].includes(ai?.competition_level) ? ai.competition_level : 'medium';
  const seoOpportunity = ['low', 'medium', 'high'].includes(ai?.seo_opportunity) ? ai.seo_opportunity : 'medium';
  const calc = analyzeProduct({
    cost: purchaseCost,
    ship: shippingCost,
    price: suggestedPrice,
    demand,
    competition,
    seoOpportunity,
  });

  const payload = {
    product_name: productName,
    supplier: body.supplier || null,
    purchase_cost: purchaseCost,
    shipping_cost: shippingCost,
    purchase_total: calc.purchase_total,
    vat_rate: VAT_RATE,
    vat_amount: calc.vat_amount,
    suggested_selling_price: suggestedPrice,
    expected_profit: calc.expected_profit,
    margin_pct: calc.margin_pct,
    net_margin_pct_estimate: calc.net_margin_pct_estimate,
    score: calc.score,
    market_demand: demand,
    competition_level: competition,
    seo_opportunity: seoOpportunity,
    seo_title_ar: ai?.seo_title_ar || `${productName} | متجر Tiqnora AI`,
    seo_description_ar: ai?.seo_description_ar || `اشتر ${productName} عبر Tiqnora AI مع دعم فني في السعودية.`,
    seo_keywords: ai?.seo_keywords || productName,
    product_category: ai?.product_category || body.category || null,
    recommendation: calc.recommendation,
    recommendation_reason: calc.reason,
    notes_ar: ai?.notes_ar || null,
    auto_publish: false,
    auto_purchase: false,
    disclaimer: 'تحليل للمراجعة فقط — لا نشر تلقائي ولا شراء من المورد. الأرقام تقديرية وليست استشارة ضريبية.',
  };

  // Optional persist when admin requests save=true and service role available
  if (body.save === true || body.save === 'true') {
    const row = {
      product_name: productName,
      supplier_name: body.supplier || null,
      purchase_cost: purchaseCost,
      shipping_cost: shippingCost,
      vat_amount: calc.vat_amount,
      suggested_price: suggestedPrice,
      expected_profit: calc.expected_profit,
      margin_pct: calc.margin_pct,
      score: calc.score,
      market_demand: demand,
      competition_level: competition,
      seo_opportunity: seoOpportunity,
      seo_keywords: payload.seo_keywords,
      product_category: payload.product_category,
      recommendation: calc.recommendation,
      recommendation_reason: calc.reason,
      ai_raw: payload,
      status: 'draft',
    };
    const saved = await sbRest('product_scout_results', { method: 'POST', body: row, prefer: 'return=representation' });
    if (saved.data) payload.saved_id = Array.isArray(saved.data) ? saved.data[0]?.id : saved.data.id;
    if (saved.error) payload.save_error = saved.error;
  }

  return { status: 200, payload };
}

async function handleSuppliersGet(action) {
  if (action === 'status' || action === 'suppliers' || !action) {
    const { data, error } = await sbRest(
      'commerce_suppliers?select=id,provider,display_name,status,fulfillment_mode,supplier_type,country,city,category,api_connection_status,shipping_method,delivery_time_min_days,delivery_time_max_days&order=display_name'
    );
    const envReady = {
      CJ_API_KEY: !!process.env.CJ_API_KEY,
      ALIEXPRESS_API_KEY: !!process.env.ALIEXPRESS_API_KEY,
      ALIBABA_API_KEY: !!process.env.ALIBABA_API_KEY,
      DSERS_API_KEY: !!process.env.DSERS_API_KEY,
      GEMINI_API_KEY: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
    };
    return {
      status: error ? 200 : 200,
      payload: {
        suppliers: data || [],
        error: error || null,
        env_keys_present: envReady,
        auto_purchase: false,
        auto_publish: false,
        note: error
          ? 'جدول الموردين غير متاح بعد — نفّذ migrations 025 ثم 026 ثم 027 في Supabase.'
          : 'قائمة الموردين (إدارة فقط). لا شراء تلقائي.',
      },
    };
  }
  if (action === 'scout_history') {
    const { data, error } = await sbRest(
      'product_scout_results?select=id,product_name,supplier_name,purchase_cost,suggested_price,expected_profit,margin_pct,score,recommendation,status,created_at&order=created_at.desc&limit=40'
    );
    return {
      status: 200,
      payload: { results: data || [], error: error || null },
    };
  }
  return { status: 400, payload: { error: 'Unknown action. Use action=status|suppliers|scout_history' } };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  // GET: suppliers status / scout history (merged endpoints for Hobby plan)
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
      const action = (url.searchParams.get('action') || 'status').toLowerCase();
      const mode = (url.searchParams.get('mode') || '').toLowerCase();
      if (mode === 'scout' || action === 'scout_history') {
        const out = await handleSuppliersGet('scout_history');
        return json(res, out.status, out.payload);
      }
      const out = await handleSuppliersGet(action);
      return json(res, out.status, out.payload);
    } catch (e) {
      return json(res, 500, { error: e.message || 'خطأ داخلي' });
    }
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const mode = String(body.mode || body.action || 'research').toLowerCase();

  // Product Scout
  if (mode === 'scout' || body.product_name) {
    try {
      const out = await handleScout(body);
      return json(res, out.status, out.payload);
    } catch (e) {
      return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
    }
  }

  // Supplier queue / log actions (lightweight, no secrets)
  if (mode === 'queue_import' || mode === 'log_sync' || mode === 'suppliers') {
    return json(res, 200, {
      ok: true,
      mode,
      message: 'استخدم لوحة الأدمن + جداول product_import_queue / supplier_sync_logs بعد migration 025. لا شراء تلقائي.',
      auto_purchase: false,
    });
  }

  const message = String(body.message || '').trim();
  if (!message || message.length > 4000) return json(res, 400, { error: 'رسالة غير صالحة' });
  const system = MODE_PROMPTS[mode] || MODE_PROMPTS.research;

  try {
    const reply = await callGemini(system, message);
    if (SERVICE) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
          method: 'POST',
          headers: {
            apikey: SERVICE,
            Authorization: `Bearer ${SERVICE}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            event_name: 'commerce_ai',
            page_path: '/admin',
            metadata: { mode, len: message.length },
          }),
        });
      } catch (_) {}
    }
    return json(res, 200, {
      reply,
      mode,
      disclaimer: 'توصيات للمراجعة فقط — لا يوجد شراء تلقائي من الموردين.',
    });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
  }
}
