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
  product_seo: `You are Tiqnora AI Product SEO writer for Saudi B2B/B2C tech marketplace.
Return STRICT JSON only with keys:
name_ar, name_en, short_description_ar, description_ar, description_en,
specs (object of string key-value technical specs in Arabic keys preferred),
benefits_ar (array of strings), faq (array of {q,a} in Arabic),
keywords_ar, keywords_en, seo_title_ar, seo_description_ar, seo_title_en, seo_description_en.
No supplier disclosure. No fake certifications. Saudi market tone.`,
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


function categorySpecHints(categoryText) {
  const c = String(categoryText || '').toLowerCase();
  if (/pos|كاشير|نقاط بيع/.test(c)) return ['screen', 'cpu', 'ram', 'storage', 'printer', 'connectivity', 'شاشة', 'معالج', 'ذاكرة'];
  if (/cctv|camera|مراقبة|كاميرا|أمن|security/.test(c)) return ['resolution', 'lens', 'night', 'storage', 'network', 'دقة', 'عدسة', 'ليلي'];
  if (/network|شبك|router|switch|wifi|واي/.test(c)) return ['speed', 'ports', 'wifi', 'range', 'سرعة', 'منافذ', 'مدى'];
  if (/hotel|فندق|pbx|grandstream|voip/.test(c)) return ['capacity', 'compatibility', 'installation', 'سعة', 'توافق', 'تركيب'];
  return [];
}

function scoreSection(points, max) {
  return Math.max(0, Math.min(100, Math.round((points / max) * 100)));
}

function computeQualityScore(p) {
  const issues = [];
  const recommendations = [];
  const checks = {};
  const categoryLabel = p.categories?.name_ar || p.category || p.product_category || '';

  // —— 1. Images (weight later)
  const imgs = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  let imgPts = 0;
  const imgMax = 25;
  checks.main_image = imgs.length >= 1;
  checks.gallery_min = imgs.length >= 2;
  checks.image_source = !!(p.image_source && String(p.image_source).toLowerCase() !== 'placeholder');
  checks.media_approved = p.media_status === 'ready' || p.media_status === 'approved';
  checks.not_placeholder_meta = !(p.specifications && p.specifications.image_status === 'placeholder_reuse_pending_official');
  if (checks.main_image) imgPts += 12; else { issues.push('لا توجد صورة رئيسية'); recommendations.push('أضف صورة رسمية من المصنّع أو المورد'); }
  if (checks.gallery_min) imgPts += 6; else if (imgs.length === 1) recommendations.push('أضف زاوية إضافية للمنتج في المعرض');
  if (imgs.length >= 3) imgPts += 3;
  if (checks.image_source) imgPts += 2; else { issues.push('مصدر الصورة غير محدد أو placeholder'); recommendations.push('حدّد image_source: manufacturer / supplier / admin'); }
  if (checks.not_placeholder_meta) imgPts += 2; else { issues.push('الصورة ما زالت placeholder'); recommendations.push('استبدل بصور رسمية واعتمدها في مدير الوسائط'); }
  const image_score = scoreSection(imgPts, imgMax);

  // —— 2. Content
  let contentPts = 0;
  const contentMax = 25;
  checks.title_ar = !!(p.name_ar && String(p.name_ar).trim().length >= 3);
  checks.title_en = !!(p.name_en && String(p.name_en).trim().length >= 2);
  checks.desc_ar = (p.description_ar || '').length >= 80;
  checks.desc_en = (p.description_en || '').length >= 40;
  checks.brand = !!(p.brand_id || p.brand || p.brands);
  checks.category = !!(p.category_id || p.category || p.categories);
  checks.sku = !!(p.sku && String(p.sku).trim());
  if (checks.title_ar) contentPts += 5; else issues.push('عنوان عربي ناقص');
  if (checks.title_en) contentPts += 3; else issues.push('عنوان إنجليزي ناقص');
  if (checks.desc_ar) contentPts += 7; else { issues.push('الوصف العربي قصير أو فارغ'); recommendations.push('اكتب وصفاً ≥80 حرفاً أو استخدم SEO AI'); }
  if (checks.desc_en) contentPts += 3; else recommendations.push('أضف وصفاً إنجليزياً');
  if (checks.brand) contentPts += 3; else issues.push('لم تُحدد الماركة');
  if (checks.category) contentPts += 2; else issues.push('لم يُحدد التصنيف');
  if (checks.sku) contentPts += 2; else issues.push('SKU مفقود');
  const content_score = scoreSection(contentPts, contentMax);

  // —— 3. Specifications (category-aware)
  let specPts = 0;
  const specMax = 20;
  const specs = p.specifications || {};
  const specObj = (specs.specs && typeof specs.specs === 'object') ? specs.specs : {};
  const specKeys = Object.keys(specObj).map(k => k.toLowerCase());
  const specBlob = (JSON.stringify(specObj) + ' ' + (p.description_ar || '')).toLowerCase();
  const hasSpecs = specKeys.length > 0;
  const hasBenefits = Array.isArray(specs.benefits_ar) && specs.benefits_ar.length > 0;
  const hasFaq = Array.isArray(specs.faq) && specs.faq.length >= 2;
  const hints = categorySpecHints(categoryLabel);
  let hintHits = 0;
  for (const h of hints) {
    if (specKeys.some(k => k.includes(h)) || specBlob.includes(h)) hintHits += 1;
  }
  checks.specs = hasSpecs;
  checks.category_spec_hints = hints.length ? hintHits : null;
  checks.benefits = hasBenefits;
  checks.faq = hasFaq;
  if (hasSpecs) specPts += 8; else { issues.push('المواصفات التقنية مفقودة'); recommendations.push('أضف مواصفات تقنية واقعية للفئة'); }
  if (hints.length) {
    const ratio = hintHits / hints.length;
    if (ratio >= 0.4) specPts += 6;
    else if (ratio > 0) { specPts += 3; recommendations.push('أكمل حقول المواصفات المتوقعة لهذه الفئة: ' + hints.slice(0, 5).join(', ')); }
    else if (hasSpecs) recommendations.push('المواصفات لا تغطي الحقول المتوقعة للفئة');
  } else if (hasSpecs) specPts += 4;
  if (hasBenefits) specPts += 3; else recommendations.push('أضف فوائد المنتج');
  if (hasFaq) specPts += 3; else { issues.push('FAQ ناقص (يُفضّل سؤالين فأكثر)'); recommendations.push('ولّد FAQ عبر SEO AI'); }
  const specification_score = scoreSection(specPts, specMax);

  // —— 4. SEO
  let seoPts = 0;
  const seoMax = 15;
  checks.seo_title = !!(p.seo_title_ar && String(p.seo_title_ar).length >= 10);
  checks.seo_desc = !!(p.seo_description_ar && String(p.seo_description_ar).length >= 40);
  checks.keywords = !!(p.keywords_ar && String(p.keywords_ar).trim());
  checks.schema_ready = !!(checks.seo_title && checks.seo_desc && checks.title_ar && checks.main_image);
  if (checks.seo_title) seoPts += 5; else issues.push('SEO title مفقود');
  if (checks.seo_desc) seoPts += 5; else issues.push('Meta description مفقود');
  if (checks.keywords) seoPts += 3; else recommendations.push('أضف كلمات مفتاحية عربية');
  if (checks.schema_ready) seoPts += 2;
  const seo_score = scoreSection(seoPts, seoMax);

  // —— 5. Business
  let bizPts = 0;
  const bizMax = 15;
  const price = Number(p.price) || 0;
  const cost = Number(p.cost_price);
  checks.price = price > 0;
  checks.cost = Number.isFinite(cost) && cost > 0;
  checks.margin = checks.price && checks.cost && price > cost;
  const marginPct = checks.margin ? ((price - cost) / price) * 100 : null;
  checks.supplier = !!(p.supplier_name && String(p.supplier_name).trim());
  checks.shipping = !!(p.delivery_note_ar && String(p.delivery_note_ar).trim());
  checks.vat_estimate = true;
  if (checks.price) bizPts += 4; else issues.push('سعر البيع غير صالح');
  if (checks.cost) bizPts += 4; else { issues.push('سعر التكلفة مفقود'); recommendations.push('أدخل cost_price لحساب الهامش'); }
  if (checks.margin) bizPts += 3; else if (checks.price && checks.cost) issues.push('الهامش سالب أو صفر');
  if (checks.supplier) bizPts += 2; else recommendations.push('عيّن مورداً للمنتج');
  if (checks.shipping) bizPts += 2; else recommendations.push('أضف ملاحظة شحن للعميل');
  const business_score = scoreSection(bizPts, bizMax);

  // Overall weighted (same totals as points / 100)
  const overallPts = imgPts + contentPts + specPts + seoPts + bizPts;
  const overallMax = imgMax + contentMax + specMax + seoMax + bizMax; // 100
  const overall_score = Math.max(0, Math.min(100, Math.round((overallPts / overallMax) * 100)));
  const score = overall_score;

  let status = 'BLOCKED';
  if (score >= 90) status = 'READY_TO_PUBLISH';
  else if (score >= 75) status = 'MINOR_FIXES';
  else if (score >= 50) status = 'NEEDS_IMPROVEMENT';
  else status = 'BLOCKED';

  // legacy status aliases for older UI
  let legacy_status = 'not_ready';
  if (score >= 90) legacy_status = 'ready_to_publish';
  else if (score >= 75) legacy_status = 'needs_minor_review';
  else if (score >= 50) legacy_status = 'needs_improvement';

  const ready_to_publish = score >= 75 && checks.main_image && checks.title_ar && checks.seo_title;

  return {
    score,
    overall_score,
    image_score,
    content_score,
    specification_score,
    seo_score,
    business_score,
    status,
    legacy_status,
    ready_to_publish: !!ready_to_publish,
    publish_blocked: !ready_to_publish,
    issues,
    recommendations,
    notes: issues,
    sections: {
      images: image_score,
      content: content_score,
      specifications: specification_score,
      seo: seo_score,
      business: business_score,
    },
    checks: {
      ...checks,
      images_count: imgs.length,
      margin_pct: marginPct != null ? Math.round(marginPct * 10) / 10 : null,
      price,
      cost: checks.cost ? cost : null,
      category: categoryLabel || null,
      vat_rate: 0.15,
    },
    bands: {
      '90-100': 'READY_TO_PUBLISH',
      '75-89': 'MINOR_FIXES',
      '50-74': 'NEEDS_IMPROVEMENT',
      '0-49': 'BLOCKED',
    },
    auto_publish: false,
  };
}

async function handleProductSeo(body) {
  const name = String(body.name_ar || body.product_name || body.name || '').trim();
  if (!name) return { status: 400, payload: { error: 'name_ar or product_name required' } };
  const category = String(body.category || body.product_category || '');
  const brand = String(body.brand || '');
  const existing = String(body.description_ar || body.description || '').slice(0, 800);
  const prompt = `Product: ${name}
English name hint: ${body.name_en || ''}
Category: ${category}
Brand: ${brand}
SKU: ${body.sku || ''}
Existing description: ${existing}
Price SAR: ${body.price || ''}
Write complete Saudi marketplace SEO package as strict JSON.`;
  const text = await callGemini(MODE_PROMPTS.product_seo, prompt, 0.35);
  let data = null;
  try {
    data = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
  } catch {
    data = { description_ar: text.slice(0, 2000), notes: 'parse_fallback' };
  }
  return {
    status: 200,
    payload: {
      ...data,
      auto_publish: false,
      disclaimer: 'محتوى AI للمراجعة — لا نشر تلقائي.',
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
  if (mode === 'scout' || (body.product_name && mode !== 'product_seo' && mode !== 'quality_score' && mode !== 'product_review' && mode !== 'ai_review' && mode !== 'product_verification' && mode !== 'verify')) {
    try {
      const out = await handleScout(body);
      return json(res, out.status, out.payload);
    } catch (e) {
      return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
    }
  }

  if (mode === 'product_seo' || mode === 'seo_content') {
    try {
      const out = await handleProductSeo(body);
      return json(res, out.status, out.payload);
    } catch (e) {
      return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
    }
  }

  if (mode === 'quality_score' || mode === 'product_review' || mode === 'ai_review' || mode === 'product_verification' || mode === 'verify') {
    const product = body.product || body;
    const result = computeQualityScore(product);
    return json(res, 200, {
      ...result,
      agent: 'tiqnora_product_verification_agent',
      verification: {
        overall_score: result.overall_score,
        image_score: result.image_score,
        content_score: result.content_score,
        specification_score: result.specification_score,
        seo_score: result.seo_score,
        business_score: result.business_score,
        status: result.status,
        issues: result.issues,
        recommendations: result.recommendations,
      },
      auto_publish: false,
      disclaimer: 'تحقق آلي — النشر يتطلب اعتماد مشرف. لا نشر تلقائي.',
    });
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
