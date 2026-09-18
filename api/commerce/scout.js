/**
 * AI Product Scout — structured analysis for Tiqnora Commerce
 * Returns JSON recommendation. Never publishes or places orders.
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

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
    reason = 'هامش جيد مع طلب مقبول ومنافسة غير خانقة — مرشّح بعد اعتماد المشرف.';
  } else if (margin < 15 || (demand === 'low' && competition === 'high')) {
    recommendation = 'not_suitable';
    reason = 'هامش ضعيف أو طلب منخفض مع منافسة عالية.';
  } else if (margin >= 25) {
    recommendation = 'suitable';
    reason = 'هامش مقبول للسوق السعودي مع مراجعة الشحن والضمان.';
  }
  return { profit: Number(profit.toFixed(2)), margin_pct: Number(margin.toFixed(2)), recommendation, reason };
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `You are Tiqnora AI Product Scout for Saudi Arabia technology marketplace.
Reply with STRICT JSON only (no markdown) keys:
product_name, seo_title_ar, seo_description_ar, seo_keywords, product_category,
market_demand (low|medium|high), competition_level (low|medium|high),
suggested_price_sar (number), notes_ar (short).
Never place orders. Never claim live stock.`,
          }],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  const text = (payload.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { notes_ar: text.slice(0, 500) };
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const productName = String(body.product_name || body.name || '').trim();
  if (!productName || productName.length > 200) return json(res, 400, { error: 'product_name required' });

  const purchaseCost = num(body.purchase_cost ?? body.cost, 0);
  const shippingCost = num(body.shipping_cost ?? body.shipping, 0);
  let suggestedPrice = num(body.suggested_price ?? body.selling_price, 0);
  if (suggestedPrice <= 0 && purchaseCost > 0) {
    suggestedPrice = Number(((purchaseCost + shippingCost) * 2.2).toFixed(2));
  }

  let ai = null;
  try {
    ai = await callGemini(
      `Analyze product for Saudi tech marketplace:
Name: ${productName}
Supplier: ${body.supplier || 'unknown'}
Cost SAR: ${purchaseCost}
Shipping SAR: ${shippingCost}
Suggested price SAR: ${suggestedPrice}
Category hint: ${body.category || ''}`
    );
  } catch (_) {
    ai = null;
  }

  if (ai?.suggested_price_sar && num(ai.suggested_price_sar) > 0 && !body.suggested_price) {
    suggestedPrice = num(ai.suggested_price_sar);
  }

  const demand = ['low', 'medium', 'high'].includes(ai?.market_demand) ? ai.market_demand : 'medium';
  const competition = ['low', 'medium', 'high'].includes(ai?.competition_level) ? ai.competition_level : 'medium';
  const calc = decide({
    cost: purchaseCost,
    ship: shippingCost,
    price: suggestedPrice,
    demand,
    competition,
  });

  const result = {
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
    seo_description_ar: ai?.seo_description_ar || `اشتر ${productName} مع دعم وحلول تقنية في السعودية عبر Tiqnora AI.`,
    seo_keywords: ai?.seo_keywords || productName,
    product_category: ai?.product_category || body.category || null,
    recommendation: calc.recommendation,
    recommendation_reason: calc.reason,
    notes_ar: ai?.notes_ar || null,
    auto_publish: false,
    disclaimer: 'تحليل للمراجعة فقط — لا نشر تلقائي ولا شراء من المورد.',
  };

  // Optional persist if service role + save flag
  if (SERVICE && body.save) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/product_scout_results`, {
        method: 'POST',
        headers: {
          apikey: SERVICE,
          Authorization: `Bearer ${SERVICE}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          product_name: result.product_name,
          supplier_name: result.supplier,
          purchase_cost: result.purchase_cost,
          shipping_cost: result.shipping_cost,
          suggested_price: result.suggested_selling_price,
          expected_profit: result.expected_profit,
          margin_pct: result.margin_pct,
          market_demand: result.market_demand,
          competition_level: result.competition_level,
          seo_keywords: result.seo_keywords,
          product_category: result.product_category,
          recommendation: result.recommendation,
          recommendation_reason: result.recommendation_reason,
          ai_raw: ai || {},
          status: 'draft',
        }),
      });
    } catch (_) {}
  }

  return json(res, 200, result);
}
