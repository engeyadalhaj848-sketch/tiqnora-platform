/** Commerce AI + Product Scout (single serverless function for Hobby plan limit) */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.end(JSON.stringify(payload));
}

const MODE_PROMPTS = {
  research: `You are Tiqnora AI Commerce Agent for Saudi Arabia. Product research only. No auto-buy. Arabic preferred.`,
  profit: `You are Tiqnora AI profit analyst for SAR. Estimate margin. No purchase. Arabic preferred.`,
  trend: `You are Tiqnora AI trends advisor for Saudi e-commerce. No auto-buy. Arabic preferred.`,
  campaign: `You are Tiqnora AI Marketing Agent. Campaign drafts only. Arabic primary.`,
  market_compare: `You are Tiqnora market comparison analyst. No live stock claims. Arabic.`,
  import_brief: `Prepare product import brief for admin review. Never publish.`,
  content: `Write Arabic sales copy for product listing. No supplier disclosure.`,
};

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function decide({ cost, ship, price, demand, competition }) {
  const totalCost = cost + ship;
  const profit = price - totalCost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  let recommendation = 'marginal';
  let reason = 'يحتاج مراجعة هامش وطلب السوق.';
  if (margin >= 35 && demand !== 'low' && competition !== 'high') {
    recommendation = 'suitable';
    reason = 'هامش جيد مع طلب مقبول — مرشّح بعد اعتماد المشرف.';
  } else if (margin < 15 || (demand === 'low' && competition === 'high')) {
    recommendation = 'not_suitable';
    reason = 'هامش ضعيف أو طلب منخفض مع منافسة عالية.';
  } else if (margin >= 25) {
    recommendation = 'suitable';
    reason = 'هامش مقبول للسوق السعودي مع مراجعة الشحن.';
  }
  return { profit: Number(profit.toFixed(2)), margin_pct: Number(margin.toFixed(2)), recommendation, reason };
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

async function handleScout(body) {
  const productName = String(body.product_name || body.name || body.message || '').trim();
  if (!productName || productName.length > 200) {
    return { status: 400, payload: { error: 'product_name required' } };
  }
  const purchaseCost = num(body.purchase_cost ?? body.cost, 0);
  const shippingCost = num(body.shipping_cost ?? body.shipping, 0);
  let suggestedPrice = num(body.suggested_price ?? body.selling_price, 0);
  if (suggestedPrice <= 0 && purchaseCost > 0) {
    suggestedPrice = Number(((purchaseCost + shippingCost) * 2.2).toFixed(2));
  }

  let ai = null;
  try {
    const text = await callGemini(
      `You are Tiqnora AI Product Scout for Saudi tech marketplace.
Reply STRICT JSON only keys: seo_title_ar, seo_description_ar, seo_keywords, product_category,
market_demand (low|medium|high), competition_level (low|medium|high), suggested_price_sar, notes_ar.
Never place orders.`,
      `Name: ${productName}\nSupplier: ${body.supplier || 'unknown'}\nCost SAR: ${purchaseCost}\nShipping: ${shippingCost}\nPrice: ${suggestedPrice}\nCategory: ${body.category || ''}`,
      0.3
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
  const calc = decide({ cost: purchaseCost, ship: shippingCost, price: suggestedPrice, demand, competition });

  return {
    status: 200,
    payload: {
      product_name: productName,
      supplier: body.supplier || null,
      purchase_cost: purchaseCost,
      shipping_cost: shippingCost,
      suggested_selling_price: suggestedPrice,
      expected_profit: calc.profit,
      margin_pct: calc.margin_pct,
      market_demand: demand,
      competition_level: competition,
      seo_title_ar: ai?.seo_title_ar || `${productName} | متجر Tiqnora AI`,
      seo_description_ar: ai?.seo_description_ar || `اشتر ${productName} عبر Tiqnora AI.`,
      seo_keywords: ai?.seo_keywords || productName,
      product_category: ai?.product_category || body.category || null,
      recommendation: calc.recommendation,
      recommendation_reason: calc.reason,
      notes_ar: ai?.notes_ar || null,
      auto_publish: false,
      disclaimer: 'تحليل للمراجعة فقط — لا نشر تلقائي ولا شراء من المورد.',
    },
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const mode = String(body.mode || 'research').toLowerCase();

  // Product Scout (was /api/commerce/scout)
  if (mode === 'scout' || body.product_name) {
    try {
      const out = await handleScout(body);
      return json(res, out.status, out.payload);
    } catch (e) {
      return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
    }
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
