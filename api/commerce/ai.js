import { getConnector, listConnectorStatuses } from './connectors.js';
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



function levelFromScore(s) {
  if (s >= 75) return 'High';
  if (s >= 45) return 'Medium';
  return 'Low';
}

function handleMarketResearch(body) {
  const productName = String(body.product_name || body.name || body.name_ar || body.message || '').trim();
  if (!productName || productName.length > 200) {
    return { status: 400, payload: { error: 'product_name required' } };
  }
  const category = String(body.category || body.product_category || '').toLowerCase();
  const brand = String(body.brand || '').trim();
  const supplier = String(body.supplier || body.supplier_name || 'unknown').trim();
  const cost = num(body.cost ?? body.purchase_cost ?? body.cost_price, 0);
  const shipping = num(body.shipping ?? body.shipping_cost, cost > 0 ? Math.max(15, cost * 0.08) : 25);
  const targetMarket = String(body.target_market || 'saudi_arabia').toLowerCase();

  // —— Demand heuristics (Saudi B2B tech)
  let demand = 50;
  const demandKeywords = [
    [/pos|كاشير|نقاط بيع|android pos/i, 28],
    [/cctv|كاميرا|مراقبة|hikvision|dahua|nvr/i, 26],
    [/wifi|router|سويتش|شبكة|access point|omada|unifi/i, 24],
    [/hotel|فندق|grandstream|pbx|voip/i, 22],
    [/laptop|لابتوب|server|سيرفر|طابعة/i, 18],
    [/fingerprint|بصمة|access control|تحكم دخول/i, 20],
  ];
  for (const [re, pts] of demandKeywords) {
    if (re.test(productName) || re.test(category)) demand += pts;
  }
  if (/saudi|ksa|السعودية/.test(targetMarket)) demand += 5;
  if (brand) demand += 4;
  demand = Math.max(5, Math.min(100, Math.round(demand)));

  // —— Competition
  let competition = 55;
  if (/hikvision|dahua|tp-link|ubiquiti|cisco|hp|lenovo/i.test(productName + brand)) competition += 15;
  if (/generic|no-name|غير معروف/i.test(productName + brand)) competition -= 10;
  if (/pos|cctv|wifi|router/i.test(productName + category)) competition += 8;
  competition = Math.max(10, Math.min(95, Math.round(competition)));

  // —— Price intelligence
  const landed = cost + shipping;
  const vatOnMargin = 0.15; // informational; retail often tax-inclusive in display
  let suggested = num(body.suggested_price ?? body.selling_price, 0);
  if (suggested <= 0 && landed > 0) {
    // tech hardware retail target ~2.0–2.6x depending on competition
    const mult = competition >= 70 ? 2.05 : competition >= 50 ? 2.35 : 2.6;
    suggested = Number((landed * mult).toFixed(2));
  }
  const profit = suggested > 0 ? Number((suggested - landed).toFixed(2)) : 0;
  const margin = suggested > 0 ? Number((((suggested - landed) / suggested) * 100).toFixed(1)) : 0;

  // —— SEO opportunity
  let seo = 50;
  if (demand >= 70) seo += 15;
  if (competition <= 55) seo += 12;
  if (/saudi|السعودية|ksa/i.test(productName) === false) seo += 8; // room for geo keywords
  if (category) seo += 6;
  seo = Math.max(10, Math.min(100, Math.round(seo)));
  const keywords = [];
  const base = productName.split(/\s+/).slice(0, 4).join(' ');
  keywords.push(base, `${base} السعودية`, `${base} سعر`, category || 'تقنية', 'Tiqnora');
  if (/pos|كاشير/i.test(productName + category)) keywords.push('نظام كاشير', 'نقاط بيع مطاعم');
  if (/كاميرا|cctv|مراقبة/i.test(productName + category)) keywords.push('كاميرات مراقبة', 'NVR');

  // —— Supplier score
  let supplierScore = 55;
  if (supplier && supplier !== 'unknown') supplierScore += 15;
  if (/local|saudi|محلي|السعودية/i.test(supplier)) supplierScore += 12;
  if (/aliexpress|cj|generic/i.test(supplier)) supplierScore -= 5;
  if (cost > 0) supplierScore += 8;
  supplierScore = Math.max(15, Math.min(95, Math.round(supplierScore)));

  // —— Decision engine
  let decision = 'REVIEW_FIRST';
  const reasons = [];
  if (margin < 15 && cost > 0) {
    decision = 'NOT_RECOMMENDED';
    reasons.push('هامش ربح منخفض جداً');
  } else if (demand >= 70 && margin >= 25 && competition <= 80) {
    decision = 'ADD_PRODUCT';
    reasons.push('طلب جيد وهامش مقبول');
  } else if (demand < 40 || margin < 18) {
    decision = 'NOT_RECOMMENDED';
    reasons.push(demand < 40 ? 'طلب سوقي ضعيف' : 'هامش غير كافٍ');
  } else {
    decision = 'REVIEW_FIRST';
    reasons.push('يحتاج مراجعة مشرف قبل الإضافة');
  }
  if (competition >= 85 && margin < 30) {
    decision = decision === 'ADD_PRODUCT' ? 'REVIEW_FIRST' : decision;
    reasons.push('منافسة عالية — راجع التسعير');
  }

  const analysis = {
    target_market: targetMarket,
    landed_cost: landed,
    vat_rate: 0.15,
    vat_note: 'ضريبة 15٪ تقديرية عند العرض النهائي للعميل حسب سياسة التسعير',
    demand_level: levelFromScore(demand),
    competition_level: levelFromScore(competition),
    opportunity_level: levelFromScore(seo),
    reasons,
    brand: brand || null,
    category: category || null,
  };

  return {
    status: 200,
    payload: {
      product_name: productName,
      demand_score: demand,
      demand_level: levelFromScore(demand),
      competition_score: competition,
      competition_level: levelFromScore(competition),
      seo_score: seo,
      opportunity_level: levelFromScore(seo),
      keywords: Array.from(new Set(keywords.filter(Boolean))).slice(0, 12),
      supplier_score: supplierScore,
      supplier,
      cost,
      shipping_estimate: shipping,
      suggested_price: suggested,
      estimated_profit: profit,
      profit_margin: margin,
      ai_decision: decision,
      analysis,
      auto_publish: false,
      auto_purchase: false,
      agent: 'tiqnora_market_intelligence_agent',
      disclaimer: 'تحليل استرشادي — لا نشر ولا شراء تلقائي. قرار الإضافة للمشرف.',
    },
  };
}


function handleDynamicPricing(body) {
  const productName = String(body.product_name || body.name || body.name_ar || '').trim();
  const cost = num(body.cost ?? body.cost_price ?? body.supplier_cost ?? body.purchase_cost, 0);
  const shipping = num(body.shipping ?? body.shipping_cost, cost > 0 ? Math.max(10, cost * 0.06) : 0);
  const extraFees = num(body.extra_fees ?? body.additional_fees ?? body.fees, 0);
  const competitorPrice = num(body.competitor_price ?? body.market_price, 0);
  const category = String(body.category || '').toLowerCase();
  const currentPrice = num(body.current_price ?? body.price ?? body.selling_price, 0);

  const baseLanded = cost + shipping + extraFees;
  if (cost <= 0 && currentPrice <= 0) {
    return { status: 400, payload: { error: 'cost or current_price required' } };
  }

  let marketLow = competitorPrice > 0 ? competitorPrice * 0.9 : 0;
  let marketHigh = competitorPrice > 0 ? competitorPrice * 1.15 : 0;
  if (competitorPrice <= 0 && baseLanded > 0) {
    marketLow = baseLanded * 1.9;
    marketHigh = baseLanded * 2.7;
  }

  let multCompetitive = 2.25;
  let multPremium = 2.65;
  let multCheapest = 1.85;
  if (/pos|كاشير/.test(category + productName)) { multCompetitive = 2.15; multPremium = 2.5; }
  if (/cctv|كاميرا|مراقبة/.test(category + productName)) { multCompetitive = 2.2; multPremium = 2.55; }
  if (/network|سويتش|راوتر|wifi|hotel/.test(category + productName)) { multCompetitive = 2.1; multPremium = 2.4; }

  const priceCheapest = baseLanded > 0 ? Number((baseLanded * multCheapest).toFixed(2)) : 0;
  const priceCompetitive = baseLanded > 0 ? Number((baseLanded * multCompetitive).toFixed(2)) : 0;
  const pricePremium = baseLanded > 0 ? Number((baseLanded * multPremium).toFixed(2)) : 0;

  const minimumPrice = baseLanded > 0 ? Number((baseLanded * 1.2).toFixed(2)) : 0; // min viable ~20% over landed

  // Margin at market (if known)
  const marginAtMarket = competitorPrice > 0 && competitorPrice > 0
    ? Number((((competitorPrice - baseLanded) / competitorPrice) * 100).toFixed(1))
    : null;
  const profitAtMarket = competitorPrice > 0 ? Number((competitorPrice - baseLanded).toFixed(2)) : null;
  const marketBelowCost = competitorPrice > 0 && competitorPrice < baseLanded;
  const marketLowMargin = marginAtMarket != null && marginAtMarket < 20;

  let recommended = priceCompetitive;
  let strategy = 'competitive';
  const warnings = [];
  let decision = 'OK';

  if (competitorPrice > 0) {
    // Anchor to market: stay inside band when possible while protecting margin
    const mid = (marketLow + marketHigh) / 2;
    if (marketBelowCost) {
      // Cannot sell profitably at market
      recommended = minimumPrice;
      strategy = 'premium'; // would need above-market
      decision = 'NOT_RECOMMENDED';
      warnings.push('سعر السوق أقل من التكلفة الإجمالية — خسارة عند البيع بسعر السوق');
      warnings.push('لا يُنصح بإدراج المنتج بهذا العرض');
    } else if (marketLowMargin) {
      // Market exists but margin thin — recommend near market high if still viable, else flag
      recommended = Number(Math.max(minimumPrice, Math.min(marketHigh, competitorPrice * 1.05)).toFixed(2));
      strategy = recommended >= competitorPrice * 1.08 ? 'premium' : 'competitive';
      decision = marginAtMarket < 10 ? 'NOT_RECOMMENDED' : 'REVIEW_FIRST';
      warnings.push('هامش الربح عند سعر السوق منخفض (' + marginAtMarket + '%)');
      if (decision === 'NOT_RECOMMENDED') warnings.push('لا يُنصح بتسعير عدواني — راجع المورد أو الفئة');
    } else {
      // Healthy market: blend cost-based competitive with market mid, clamp to band
      recommended = Number(((priceCompetitive * 0.35) + (mid * 0.65)).toFixed(2));
      if (recommended < marketLow) recommended = Number(marketLow.toFixed(2));
      if (recommended > marketHigh) recommended = Number(marketHigh.toFixed(2));
      if (recommended < minimumPrice) recommended = minimumPrice;
      if (recommended <= competitorPrice * 0.92) strategy = 'cheapest';
      else if (recommended >= competitorPrice * 1.1) strategy = 'premium';
      else strategy = 'competitive';
      decision = 'OK';
    }
  } else {
    // No market data: cost-based ladder
    recommended = priceCompetitive;
    if (recommended < minimumPrice) recommended = minimumPrice;
    if (recommended <= priceCheapest * 1.05) strategy = 'cheapest';
    else if (recommended >= pricePremium * 0.95) strategy = 'premium';
    else strategy = 'competitive';
  }

  const expectedProfit = recommended > 0 ? Number((recommended - baseLanded).toFixed(2)) : 0;
  const profitMargin = recommended > 0 ? Number((((recommended - baseLanded) / recommended) * 100).toFixed(1)) : 0;
  const vatAmount = recommended > 0 ? Number(((recommended * 0.15) / 1.15).toFixed(2)) : 0;
  const healthyMargin = profitMargin >= 25 && decision !== 'NOT_RECOMMENDED';

  if (profitMargin < 15 && decision === 'OK') {
    decision = 'REVIEW_FIRST';
    warnings.push('الهامش عند السعر الموصى منخفض');
  }

  return {
    status: 200,
    payload: {
      product_name: productName || null,
      product_id: body.product_id || null,
      cost_price: cost,
      shipping_cost: shipping,
      extra_fees: extraFees,
      total_cost: Number(baseLanded.toFixed(2)),
      vat_rate: 0.15,
      vat_amount: vatAmount,
      recommended_price: recommended,
      minimum_price: minimumPrice,
      current_price: currentPrice || null,
      expected_profit: expectedProfit,
      profit_margin: profitMargin,
      pricing_strategy: strategy,
      decision,
      warnings,
      margin_at_market: marginAtMarket,
      profit_at_market: profitAtMarket,
      price_ladder: {
        cheapest: priceCheapest,
        competitive: priceCompetitive,
        premium: pricePremium,
      },
      market_band: competitorPrice > 0 ? { low: Number(marketLow.toFixed(2)), high: Number(marketHigh.toFixed(2)), competitor: competitorPrice } : null,
      analysis: {
        note: 'توصية تسعير فقط — لا تغيير تلقائي للسعر',
        category: category || null,
        healthy_margin: healthyMargin,
        market_below_cost: marketBelowCost,
        market_low_margin: marketLowMargin,
        decision,
        warnings,
      },
      auto_price_change: false,
      agent: 'tiqnora_dynamic_pricing_agent',
      disclaimer: 'لا تغيير أسعار تلقائي. اعتماد المشرف مطلوب.',
    },
  };
}

function handleSupplierCompare(body) {
  const productName = String(body.product_name || body.name || body.name_ar || '').trim();
  let suppliers = Array.isArray(body.suppliers) ? body.suppliers : [];

  // Default demo set if none provided (admin can pass real quotes)
  if (!suppliers.length) {
    const baseCost = num(body.cost ?? body.cost_price, 200);
    suppliers = [
      { name: 'AliExpress', type: 'international', cost: Number((baseCost * 0.92).toFixed(2)), shipping: 45, delivery_days: 18, rating: 3.8, warranty: false },
      { name: 'CJ Dropshipping', type: 'international', cost: Number((baseCost * 1.0).toFixed(2)), shipping: 35, delivery_days: 14, rating: 4.0, warranty: false },
      { name: 'Alibaba (MOQ)', type: 'international', cost: Number((baseCost * 0.75).toFixed(2)), shipping: 80, delivery_days: 25, rating: 4.1, warranty: false },
      { name: 'Saudi Local Distributor', type: 'local', cost: Number((baseCost * 1.15).toFixed(2)), shipping: 25, delivery_days: 3, rating: 4.4, warranty: true },
      { name: 'KSA Regional Supplier', type: 'local', cost: Number((baseCost * 1.08).toFixed(2)), shipping: 30, delivery_days: 5, rating: 4.2, warranty: true },
    ];
  }

  const scored = suppliers.map((s) => {
    const cost = num(s.cost ?? s.cost_price, 0);
    const shipping = num(s.shipping ?? s.shipping_cost, 0);
    const delivery = num(s.delivery_days ?? s.delivery, 14);
    const rating = num(s.rating, 3.5);
    const warranty = !!(s.warranty || s.has_warranty);
    const type = String(s.type || (/saudi|local|ksa|محلي/i.test(String(s.name || '')) ? 'local' : 'international')).toLowerCase();
    const landed = cost + shipping;
    // Score 0-100
    let score = 50;
    // lower landed better (up to 30 pts)
    const minLanded = Math.min(...suppliers.map(x => num(x.cost, 0) + num(x.shipping, 0)).filter(x => x > 0).concat([landed]));
    if (landed > 0 && minLanded > 0) {
      score += Math.max(0, 30 - ((landed - minLanded) / minLanded) * 40);
    }
    // delivery
    if (delivery <= 5) score += 15;
    else if (delivery <= 10) score += 10;
    else if (delivery <= 18) score += 5;
    else score -= 5;
    // rating
    score += (rating - 3) * 8;
    // warranty + local trust
    if (warranty) score += 10;
    if (type === 'local') score += 8;
    score = Math.max(5, Math.min(100, Math.round(score)));
    const sellAt = landed > 0 ? Number((landed * 2.2).toFixed(2)) : 0;
    const profit = sellAt > 0 ? Number((sellAt - landed).toFixed(2)) : 0;
    const margin = sellAt > 0 ? Number((((sellAt - landed) / sellAt) * 100).toFixed(1)) : 0;
    return {
      name: s.name || 'Unknown',
      type,
      cost,
      shipping,
      landed_cost: Number(landed.toFixed(2)),
      delivery_days: delivery,
      rating,
      warranty,
      score,
      estimated_profit_at_2_2x: profit,
      estimated_margin_pct: margin,
    };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0] || null;
  const reasons = [];
  if (best) {
    if (best.type === 'local') reasons.push('توريد محلي أسرع وثقة أعلى للعميل');
    if (best.warranty) reasons.push('توفر ضمان');
    if (best.delivery_days <= 5) reasons.push('مدة توصيل قصيرة');
    if (best.score >= 70) reasons.push('أفضل توازن تكلفة/سرعة/موثوقية');
    if (!reasons.length) reasons.push('أعلى درجة مقارنة بين الخيارات المتاحة');
  }

  return {
    status: 200,
    payload: {
      product_name: productName || null,
      product_id: body.product_id || null,
      suppliers: scored,
      recommended_supplier: best ? best.name : null,
      comparison_score: best ? best.score : null,
      reasons,
      analysis: {
        count: scored.length,
        best_landed: best ? best.landed_cost : null,
        note: 'مقارنة استرشادية — لا طلب شراء تلقائي من المورد',
      },
      auto_order: false,
      agent: 'tiqnora_supplier_comparison_agent',
      disclaimer: 'لا طلب مورد تلقائي. اعتماد المشرف مطلوب.',
    },
  };
}


async function handleSupplierCenter(body = {}) {
  // Thin wrapper around sbRest — never auto-purchase / auto-publish / auto price change
  const rest = async (path, opts = {}) => {
    const r = await sbRest(path, opts);
    if (r && r.error) return { error: r.error, data: null };
    return { data: r?.data ?? r, error: null };
  };
  const action = String(body.action || body.connector_action || 'status').toLowerCase();
  const provider = String(body.provider || 'cj_dropshipping').toLowerCase().replace(/-/g, '_');

  if (action === 'status' || action === 'list') {
    const statuses = listConnectorStatuses();
    return {
      status: 200,
      payload: {
        connectors: statuses,
        auto_purchase: false,
        auto_publish: false,
        agent: 'tiqnora_supplier_connector_engine',
        disclaimer: 'API keys only in Vercel env. No auto-purchase / no auto-publish.',
      },
    };
  }

  if (action === 'test' || action === 'test_connection') {
    const c = getConnector(provider);
    if (!c) return { status: 400, payload: { error: 'Unknown provider', provider } };
    const result = await c.testConnection();
    try {
      await rest('inventory_sync_logs', {
        method: 'POST',
        body: {
          supplier: provider,
          provider,
          change_type: 'connection',
          old_value: null,
          new_value: result.status,
          message: result.message || null,
          requires_review: !result.ok,
        },
        prefer: 'return=minimal',
      });
    } catch (_) {}
    try {
      await rest(
        `supplier_connections?provider=eq.${encodeURIComponent(provider)}`,
        {
          method: 'PATCH',
          body: {
            status: result.status === 'connected' ? 'connected' : result.status === 'not_configured' ? 'not_configured' : 'error',
            last_test_at: new Date().toISOString(),
            last_error: result.ok ? null : (result.message || 'test failed'),
            updated_at: new Date().toISOString(),
          },
          prefer: 'return=minimal',
        }
      );
    } catch (_) {}
    return { status: 200, payload: { ...result, auto_purchase: false } };
  }

  if (action === 'search') {
    const c = getConnector(provider);
    if (!c) return { status: 400, payload: { error: 'Unknown provider' } };
    const result = await c.searchProducts(body.query || body.q || '', Number(body.limit) || 10);
    return { status: 200, payload: { ...result, auto_purchase: false, auto_publish: false } };
  }

  if (action === 'sync' || action === 'sync_products') {
    const c = getConnector(provider);
    if (!c) return { status: 400, payload: { error: 'Unknown provider' } };
    const test = await c.testConnection();
    // Allow demo sync even when not_configured (CJ demo catalog)
    const search = await c.searchProducts(body.query || 'tech', Number(body.limit) || 5);
    const products = search.products || [];
    let mapped = 0;
    for (const p of products) {
      try {
        await rest('supplier_product_mapping?on_conflict=provider,supplier_product_id', {
          method: 'POST',
          body: {
            provider,
            supplier_product_id: String(p.supplier_product_id),
            supplier_price: p.cost,
            supplier_stock: p.stock,
            shipping_estimate: p.shipping_estimate || null,
            currency: p.currency || 'USD',
            raw_snapshot: p,
            last_checked: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          prefer: 'resolution=merge-duplicates,return=minimal',
        });
        mapped += 1;
      } catch (_) {}
    }
    try {
      await rest(
        `supplier_connections?provider=eq.${encodeURIComponent(provider)}`,
        {
          method: 'PATCH',
          body: {
            status: test.ok ? 'connected' : (test.status || 'not_configured'),
            last_sync_at: new Date().toISOString(),
            products_synced: mapped,
            sync_result: { mapped, mock: !!search.mock, at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          },
          prefer: 'return=minimal',
        }
      );
    } catch (_) {}
    try {
      await rest('inventory_sync_logs', {
        method: 'POST',
        body: {
          supplier: provider,
          provider,
          change_type: 'sync',
          old_value: null,
          new_value: String(mapped),
          message: `Sync mapped ${mapped} supplier products (staging only — not published)`,
          requires_review: true,
        },
        prefer: 'return=minimal',
      });
    } catch (_) {}
    return {
      status: 200,
      payload: {
        ok: true,
        provider,
        synced: mapped,
        products,
        mock: !!search.mock,
        auto_purchase: false,
        auto_publish: false,
        disclaimer: 'Products staged in mapping only — admin approval required to publish.',
      },
    };
  }

  if (action === 'sync_inventory' || action === 'check_inventory' || action === 'sync_prices') {
    let mappings = [];
    try {
      const mr = await rest(
        `supplier_product_mapping?select=id,provider,supplier_product_id,tiqnora_product_id,supplier_price,supplier_stock&provider=eq.${encodeURIComponent(provider)}&limit=50`
      );
      mappings = Array.isArray(mr.data) ? mr.data : [];
      if (!mappings.length) {
        const all = await rest('supplier_product_mapping?select=id,provider,supplier_product_id,tiqnora_product_id,supplier_price,supplier_stock&limit=50');
        mappings = Array.isArray(all.data) ? all.data : [];
      }
    } catch (_) {
      mappings = [];
    }
    const alerts = [];
    for (const m of mappings) {
      const c = getConnector(m.provider || provider);
      if (!c) continue;
      const inv = await c.getInventory(m.supplier_product_id);
      const price = await c.getPrice(m.supplier_product_id);
      const newStock = inv.stock;
      const newPrice = price.price;
      if (m.supplier_stock != null && newStock != null && Number(newStock) !== Number(m.supplier_stock)) {
        const changeType = Number(newStock) <= 0 ? 'availability' : 'stock';
        const message =
          Number(newStock) <= 0
            ? 'Product requires review — out of stock at supplier'
            : Number(newStock) < 5
              ? 'Low stock at supplier — product requires review'
              : `Stock changed ${m.supplier_stock} → ${newStock}`;
        alerts.push({ type: changeType, mapping_id: m.id, old_stock: m.supplier_stock, new_stock: newStock, message });
        try {
          await rest('inventory_sync_logs', {
            method: 'POST',
            body: {
              supplier: m.provider || provider,
              provider: m.provider || provider,
              product_id: m.tiqnora_product_id,
              mapping_id: m.id,
              change_type: changeType,
              old_value: String(m.supplier_stock),
              new_value: String(newStock),
              message,
              requires_review: true,
            },
            prefer: 'return=minimal',
          });
        } catch (_) {}
      }
      if (m.supplier_price != null && newPrice != null && Number(newPrice) !== Number(m.supplier_price)) {
        const oldP = Number(m.supplier_price);
        const newP = Number(newPrice);
        const pct = oldP > 0 ? Math.round(((newP - oldP) / oldP) * 100) : 0;
        const msg = `Supplier price changed ${oldP} → ${newP} (${pct > 0 ? '+' : ''}${pct}%). Review selling price.`;
        alerts.push({ type: 'price', mapping_id: m.id, old_price: oldP, new_price: newP, pct, message: msg });
        try {
          await rest('inventory_sync_logs', {
            method: 'POST',
            body: {
              supplier: m.provider || provider,
              provider: m.provider || provider,
              product_id: m.tiqnora_product_id,
              mapping_id: m.id,
              change_type: 'price',
              old_value: String(oldP),
              new_value: String(newP),
              message: msg,
              requires_review: true,
            },
            prefer: 'return=minimal',
          });
        } catch (_) {}
      }
      try {
        await rest(`supplier_product_mapping?id=eq.${encodeURIComponent(m.id)}`, {
          method: 'PATCH',
          body: {
            supplier_price: newPrice != null ? newPrice : m.supplier_price,
            supplier_stock: newStock != null ? newStock : m.supplier_stock,
            last_checked: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          prefer: 'return=minimal',
        });
      } catch (_) {}
    }
    return {
      status: 200,
      payload: {
        ok: true,
        checked: mappings.length,
        alerts,
        auto_price_change: false,
        auto_purchase: false,
        disclaimer: 'Alerts only — selling prices not changed automatically.',
      },
    };
  }

  // ── Phase 035: Import one (or few) products into queue + optional draft product ──
  if (action === 'import_product' || action === 'import_test' || action === 'import_one') {
    const c = getConnector(provider);
    if (!c) return { status: 400, payload: { error: 'Unknown provider' } };

    let product = null;
    const externalId = body.supplier_product_id || body.pid || body.external_product_id;

    if (externalId) {
      const det = await c.getProduct(externalId);
      if (det.ok && det.product) product = det.product;
    }
    if (!product) {
      const search = await c.searchProducts(body.query || 'power bank magnetic', 3);
      product = (search.products && search.products[0]) || null;
    }
    if (!product && provider === 'cj_dropshipping') {
      // Guaranteed demo path so admin can test the full workflow without CJ_API_KEY
      const { getDemoCatalog } = await import('../../lib/suppliers/cj.js');
      product = getDemoCatalog(1)[0];
    }
    if (!product) {
      return { status: 400, payload: { error: 'No product found to import', provider } };
    }

    // AI pipeline (rules-based, no external LLM required for deterministic test)
    const costUsd = Number(product.cost || 50);
    const shipUsd = Number(product.shipping_cost_usd || 3.5);
    const usdToSar = 3.75;
    const landedSar = Number(((costUsd + shipUsd) * usdToSar).toFixed(2));
    const suggestedPrice = Number((landedSar * 1.55).toFixed(2)); // ~35%+ margin target
    const marginPct = suggestedPrice > 0 ? Number((((suggestedPrice - landedSar) / suggestedPrice) * 100).toFixed(1)) : 0;

    const market = {
      demand: 'medium',
      competition: 'medium',
      seo_opportunity: 'high',
      notes: 'Tech accessory — suitable for Saudi National Day / everyday mobile accessories demand.',
    };
    const pricing = {
      cost_usd: costUsd,
      shipping_usd: shipUsd,
      landed_sar: landedSar,
      recommended_price_sar: suggestedPrice,
      margin_pct: marginPct,
      strategy: marginPct >= 30 ? 'competitive' : 'review',
      vat_inclusive: true,
    };
    let aiScore = 70;
    if (marginPct >= 30) aiScore += 10;
    if ((product.images || []).length >= 1) aiScore += 5;
    else aiScore -= 15;
    if (product.stock > 20) aiScore += 5;
    if (product.mock) aiScore -= 5;
    aiScore = Math.max(0, Math.min(100, aiScore));
    const recommendation = aiScore >= 80 ? 'PUBLISH_READY' : aiScore >= 60 ? 'REVIEW_FIRST' : 'NEEDS_WORK';
    const verification = {
      image_quality: (product.images || []).length ? 'acceptable' : 'missing',
      content_quality: product.description ? 'ok' : 'thin',
      seo_readiness: 'needs_review',
      ai_score: aiScore,
      recommendation,
      reason:
        recommendation === 'REVIEW_FIRST'
          ? 'Need better images / Arabic SEO polish before publish'
          : recommendation === 'PUBLISH_READY'
            ? 'Good margin and basic content'
            : 'Insufficient data or low margin',
    };

    const aiResearch = {
      market_intelligence: market,
      dynamic_pricing: pricing,
      product_verification: verification,
      pipeline: ['market_intelligence', 'dynamic_pricing', 'product_verification'],
      imported_at: new Date().toISOString(),
      auto_publish: false,
      auto_purchase: false,
    };

    const nameEn = String(product.title || 'Imported product').slice(0, 180);
    const nameAr = String(product.title_ar || product.title || nameEn).slice(0, 180);
    const slugBase = nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'cj-import';
    const slug = `${slugBase}-${String(product.supplier_product_id || 'x').slice(-6)}`.toLowerCase();
    const sku = `CJ-${String(product.supplier_product_id || Date.now()).replace(/[^A-Za-z0-9-]/g, '').slice(0, 24)}`;

    // 1) product_import_queue (always)
    let queueId = null;
    try {
      const q = await rest('product_import_queue', {
        method: 'POST',
        body: {
          external_product_id: String(product.supplier_product_id),
          source_url: product.source_url || `cj://${product.supplier_product_id}`,
          raw_payload: product,
          proposed_name_ar: nameAr,
          proposed_name_en: nameEn,
          proposed_description_ar: product.description_ar || product.description || null,
          proposed_price: suggestedPrice,
          proposed_cost: landedSar,
          proposed_images: product.images || [],
          seo_title_ar: nameAr,
          seo_keywords_ar: 'اكسسوارات جوال, باور بانك, تقنية',
          profit_margin_pct: marginPct,
          ai_research: aiResearch,
          status: 'pending_review',
        },
        prefer: 'return=representation',
      });
      const row = Array.isArray(q.data) ? q.data[0] : q.data;
      queueId = row?.id || null;
    } catch (e) {
      return {
        status: 500,
        payload: { error: 'Failed to insert product_import_queue', detail: String(e.message || e), auto_publish: false },
      };
    }

    // 2) Draft product (is_active = false) — never published
    let productId = null;
    try {
      const pr = await rest('products', {
        method: 'POST',
        body: {
          slug,
          sku,
          name_ar: nameAr,
          name_en: nameEn,
          description_ar: product.description_ar || product.description || nameAr,
          description_en: product.description || nameEn,
          price: suggestedPrice,
          cost_price: landedSar,
          stock_quantity: Number(product.stock || 0),
          track_stock: true,
          images: product.images || [],
          is_active: false,
          featured: false,
          fulfillment_type: 'dropship',
          delivery_note_ar: 'التوصيل المتوقع: 7–15 يومًا',
          delivery_note_en: 'Estimated delivery: 7–15 days',
        },
        prefer: 'return=representation',
      });
      const prow = Array.isArray(pr.data) ? pr.data[0] : pr.data;
      productId = prow?.id || null;
      if (productId && queueId) {
        await rest(`product_import_queue?id=eq.${encodeURIComponent(queueId)}`, {
          method: 'PATCH',
          body: { published_product_id: productId, updated_at: new Date().toISOString() },
          prefer: 'return=minimal',
        });
      }
    } catch (_) {
      // Product insert may fail on unique slug/sku — queue still holds the import
    }

    // 3) supplier_product_mapping
    try {
      await rest('supplier_product_mapping?on_conflict=provider,supplier_product_id', {
        method: 'POST',
        body: {
          provider,
          supplier_product_id: String(product.supplier_product_id),
          tiqnora_product_id: productId,
          supplier_price: costUsd,
          supplier_stock: product.stock,
          shipping_estimate: product.shipping_estimate || null,
          currency: product.currency || 'USD',
          raw_snapshot: product,
          last_checked: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
    } catch (_) {}

    // 4) Log
    try {
      await rest('inventory_sync_logs', {
        method: 'POST',
        body: {
          supplier: provider,
          provider,
          product_id: productId,
          change_type: 'sync',
          old_value: null,
          new_value: String(product.supplier_product_id),
          message: `Imported to queue (pending_review). AI score ${aiScore}/100 → ${recommendation}. is_active=false.`,
          requires_review: true,
        },
        prefer: 'return=minimal',
      });
    } catch (_) {}

    return {
      status: 200,
      payload: {
        ok: true,
        provider,
        imported: 1,
        queue_id: queueId,
        product_id: productId,
        is_active: false,
        status: 'pending_review',
        mock: !!product.mock,
        ai_score: aiScore,
        recommendation,
        reason: verification.reason,
        pricing,
        market,
        verification,
        product_summary: {
          name_en: nameEn,
          name_ar: nameAr,
          sku,
          cost_sar: landedSar,
          suggested_price_sar: suggestedPrice,
          stock: product.stock,
          images: (product.images || []).length,
        },
        auto_purchase: false,
        auto_publish: false,
        disclaimer: 'Draft only. Admin must approve before publish. No auto-purchase.',
      },
    };
  }

  if (action === 'logs') {
    try {
      const lr = await rest(
        'inventory_sync_logs?select=*&order=created_at.desc&limit=40'
      );
      return { status: 200, payload: { logs: Array.isArray(lr.data) ? lr.data : [], auto_purchase: false } };
    } catch (e) {
      return { status: 200, payload: { logs: [], message: e.message || 'migration 034 required' } };
    }
  }


  // Phase 3: full variant → VID → inventory → SA freight audit
  if (action === 'audit_product' || action === 'audit_pipeline' || action === 'verify_freight') {
    const c = getConnector(provider);
    if (!c) return { status: 400, payload: { error: 'Unknown provider' } };
    const externalId = String(body.supplier_product_id || body.pid || body.external_product_id || '').trim();
    if (!externalId) return { status: 400, payload: { error: 'supplier_product_id required' } };
    if (typeof c.auditProductPipeline !== 'function') {
      return { status: 500, payload: { error: 'auditProductPipeline not available on connector' } };
    }
    const audit = await c.auditProductPipeline(externalId, { countryCode: body.country || 'SA' });
    // Pricing helper (SAR)
    const USD_SAR = 3.75;
    const pricing_buffer = 0.05; // 5% buffer on landed — explicit, not hidden in freight
    const primary = audit.primary;
    let pricing = null;
    if (primary && primary.supplier_price != null && primary.shipping_cost_source === 'cj_live_freight') {
      const supplier = Number(primary.supplier_price) || 0;
      const ship = Number(primary.shipping_cost_usd) || 0;
      const landed_usd = supplier + ship;
      const buffer_usd = Number((landed_usd * pricing_buffer).toFixed(4));
      const landed_with_buffer_usd = landed_usd + buffer_usd;
      const landed_sar = Number((landed_with_buffer_usd * USD_SAR).toFixed(2));
      // target ~32% margin on sell price for accessories
      let sell = Number((landed_sar / 0.68).toFixed(2));
      const targets = [19, 29, 39, 49, 59, 69, 79, 89, 99, 119, 129, 149, 179, 199, 249, 299, 349, 399];
      sell = targets.find((t) => t >= sell) || Math.ceil(sell / 10) * 10;
      const profit = Number((sell - landed_sar).toFixed(2));
      const margin = sell > 0 ? Number(((profit / sell) * 100).toFixed(1)) : 0;
      pricing = {
        supplier_cost_usd: supplier,
        shipping_cost_usd: ship,
        shipping_cost_source: primary.shipping_cost_source,
        pricing_buffer_usd: buffer_usd,
        pricing_buffer_pct: pricing_buffer,
        landed_cost_usd: landed_usd,
        landed_cost_sar: landed_sar,
        exchange_rate: USD_SAR,
        exchange_rate_source: 'fixed_pipeline_3.75',
        selling_price_sar: sell,
        profit_sar: profit,
        gross_margin_percentage: margin,
      };
    }
    return {
      status: 200,
      payload: {
        ...audit,
        pricing,
        auto_purchase: false,
        auto_publish: false,
      },
    };
  }

  // Live product verify (details + inventory + variants + shipping estimate)
  if (action === 'get_product' || action === 'product_details' || action === 'verify_product') {
    const c = getConnector(provider);
    if (!c) return { status: 400, payload: { error: 'Unknown provider' } };
    const externalId = String(body.supplier_product_id || body.pid || body.external_product_id || '').trim();
    if (!externalId) return { status: 400, payload: { error: 'supplier_product_id required' } };

    const details = await c.getProduct(externalId);
    let inventory = null;
    let variants = null;
    let shipping = null;
    try {
      inventory = await c.getInventory(externalId);
    } catch (_) {}
    try {
      if (typeof c.getVariants === 'function') variants = await c.getVariants(externalId);
    } catch (_) {}
    try {
      shipping = await c.getShippingInfo(externalId, { countryCode: body.country || 'SA', quantity: Number(body.quantity) || 1 });
    } catch (_) {}

    const product = details?.product || null;
    const stock =
      (inventory && inventory.stock != null ? inventory.stock : null) ??
      (product && product.stock != null ? product.stock : null);
    const shipCost = shipping && shipping.shipping_cost_usd != null ? shipping.shipping_cost_usd : null;
    const shippingStatus =
      shipCost != null && Number(shipCost) >= 0
        ? 'verified'
        : shipping && shipping.ok
          ? 'estimate_only'
          : 'requires_check';

    return {
      status: 200,
      payload: {
        ok: !!(details && details.ok),
        provider,
        supplier_product_id: externalId,
        product,
        inventory,
        variants: variants?.variants || variants || [],
        shipping,
        stock,
        cost: product?.cost ?? null,
        currency: product?.currency || 'USD',
        images: product?.images || [],
        shipping_cost_usd: shipCost,
        shipping_status: shippingStatus,
        shipping_estimate: shipping?.estimate || product?.shipping_estimate || null,
        mock: !!(details && details.mock),
        live_api: !(details && details.mock),
        auto_purchase: false,
        auto_publish: false,
      },
    };
  }

  // Publish / hold reviewed drafts (no CJ purchase)
  if (action === 'publish_product' || action === 'hold_product' || action === 'reject_product') {
    const productId = String(body.product_id || body.tiqnora_product_id || '').trim();
    if (!productId) return { status: 400, payload: { error: 'product_id required' } };

    const decision = action.startsWith('publish') ? 'PUBLISH' : action.startsWith('hold') ? 'HOLD' : 'REJECT';
    const patch = {
      updated_at: new Date().toISOString(),
    };
    if (decision === 'PUBLISH') {
      patch.is_active = true;
      if (body.price != null && Number(body.price) > 0) patch.price = Number(body.price);
      if (body.name_ar) patch.name_ar = String(body.name_ar).slice(0, 200);
      if (body.name_en) patch.name_en = String(body.name_en).slice(0, 200);
      if (body.description_ar) patch.description_ar = String(body.description_ar).slice(0, 8000);
      if (body.description_en) patch.description_en = String(body.description_en).slice(0, 8000);
      if (body.delivery_note_ar) patch.delivery_note_ar = String(body.delivery_note_ar).slice(0, 300);
      if (body.delivery_note_en) patch.delivery_note_en = String(body.delivery_note_en).slice(0, 300);
      if (body.stock != null && Number(body.stock) >= 0) patch.stock_quantity = Number(body.stock);
      // cost_price is INTERNAL — only update when explicitly passed by admin tools
      if (body.cost_price != null) patch.cost_price = Number(body.cost_price);
      if (Array.isArray(body.images) && body.images.length) {
        // flatten accidental nested JSON strings in image arrays
        const imgs = [];
        for (const im of body.images) {
          if (typeof im === 'string' && im.startsWith('http')) imgs.push(im);
          else if (typeof im === 'string' && im.trim().startsWith('[')) {
            try { const parsed = JSON.parse(im); if (Array.isArray(parsed)) imgs.push(...parsed.filter((x) => typeof x === 'string' && x.startsWith('http'))); } catch (_) {}
          }
        }
        if (imgs.length) patch.images = [...new Set(imgs)].slice(0, 12);
      }
    } else {
      patch.is_active = false;
    }

    try {
      const pr = await rest(`products?id=eq.${encodeURIComponent(productId)}`, {
        method: 'PATCH',
        body: patch,
        prefer: 'return=representation',
      });
      const row = Array.isArray(pr.data) ? pr.data[0] : pr.data;
      if (!row) {
        return { status: 404, payload: { error: 'Product not found', product_id: productId } };
      }
      // Update queue status if present
      try {
        const qStatus = decision === 'PUBLISH' ? 'published' : decision === 'HOLD' ? 'pending_review' : 'rejected';
        await rest(`product_import_queue?published_product_id=eq.${encodeURIComponent(productId)}`, {
          method: 'PATCH',
          body: { status: qStatus, updated_at: new Date().toISOString() },
          prefer: 'return=minimal',
        });
      } catch (_) {}
      try {
        await rest('inventory_sync_logs', {
          method: 'POST',
          body: {
            supplier: provider,
            provider,
            product_id: productId,
            change_type: decision === 'PUBLISH' ? 'publish' : decision.toLowerCase(),
            old_value: 'pending_review',
            new_value: decision === 'PUBLISH' ? 'active' : decision.toLowerCase(),
            message: body.reason || `Merchandising decision: ${decision}`,
            requires_review: decision !== 'PUBLISH',
          },
          prefer: 'return=minimal',
        });
      } catch (_) {}
      return {
        status: 200,
        payload: {
          ok: true,
          decision,
          product_id: productId,
          is_active: !!row.is_active,
          slug: row.slug,
          price: row.price,
          name_ar: row.name_ar,
          name_en: row.name_en,
          stock_quantity: row.stock_quantity,
          auto_purchase: false,
          public_url: row.is_active && row.slug ? `https://www.tiqnora.com/product?slug=${encodeURIComponent(row.slug)}` : null,
        },
      };
    } catch (e) {
      return { status: 500, payload: { error: e.message || 'publish failed', product_id: productId } };
    }
  }

  return {
    status: 400,
    payload: {
      error: 'Unknown action. Use status|test|search|sync|import_product|get_product|audit_product|publish_product|hold_product|reject_product|logs',
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
      if (action === 'connector_search' || action === 'search') {
        const out = await handleSupplierCenter({
          action: 'search',
          provider: url.searchParams.get('provider') || 'aliexpress',
          query: url.searchParams.get('q') || url.searchParams.get('query') || '',
          limit: Number(url.searchParams.get('limit') || 10),
        });
        return json(res, out.status, out.payload);
      }
      if (action === 'connector_product' || action === 'get_product') {
        const out = await handleSupplierCenter({
          action: 'get_product',
          provider: url.searchParams.get('provider') || 'aliexpress',
          supplier_product_id: url.searchParams.get('product_id') || url.searchParams.get('supplier_product_id') || '',
        });
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
  if (mode === 'scout' || (body.product_name && mode !== 'product_seo' && mode !== 'quality_score' && mode !== 'product_review' && mode !== 'ai_review' && mode !== 'product_verification' && mode !== 'verify' && mode !== 'market_research' && mode !== 'market_intelligence' && mode !== 'product_intelligence' && mode !== 'dynamic_pricing' && mode !== 'pricing' && mode !== 'supplier_compare' && mode !== 'supplier_comparison' && mode !== 'supplier_center' && mode !== 'supplier_connectors' && mode !== 'supplier_sync')) {
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

  if (mode === 'market_research' || mode === 'market_intelligence' || mode === 'product_intelligence') {
    try {
      const out = handleMarketResearch(body);
      return json(res, out.status, out.payload);
    } catch (e) {
      return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
    }
  }

  if (mode === 'dynamic_pricing' || mode === 'pricing') {
    try {
      const out = handleDynamicPricing(body);
      return json(res, out.status, out.payload);
    } catch (e) {
      return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
    }
  }

  if (mode === 'supplier_compare' || mode === 'supplier_comparison') {
    try {
      const out = handleSupplierCompare(body);
      return json(res, out.status, out.payload);
    } catch (e) {
      return json(res, e.status || 500, { error: e.message || 'خطأ داخلي' });
    }
  }

  if (mode === 'supplier_center' || mode === 'supplier_connectors' || mode === 'supplier_sync') {
    try {
      const out = await handleSupplierCenter(body);
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
