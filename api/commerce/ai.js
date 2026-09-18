/** Commerce AI — research, profit, trends, campaign, content. No auto-purchase. */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

const MODE_PROMPTS = {
  research: `You are Tiqnora AI Commerce Agent for Saudi Arabia dropshipping MVP.
Help with product research for the Saudi market (National Day seasonal offers).
Suggest product ideas, niches, and sourcing angles (AliExpress/Alibaba/CJ as future options only).
Never claim you placed an order. Never invent live supplier stock. Mark ideas as candidates for owner approval.
Reply in Arabic unless the user writes in English. Be concise and practical.`,
  profit: `You are Tiqnora AI profit analyst for SAR-priced dropshipping.
Given cost, shipping, fees, and target margin, estimate selling price and margin %.
Assume payment fee ~2.5% optional, VAT awareness for SA if relevant, shipping separate.
Never authorize a purchase. Reply in Arabic unless user uses English. Show clear numbers.`,
  trend: `You are Tiqnora AI trends advisor for Saudi e-commerce seasonal campaigns (National Day, Ramadan, back-to-school).
Suggest trending product themes suitable for SA with short rationale. No auto-buy. Arabic preferred.`,
  campaign: `You are Tiqnora AI Marketing Agent.
Draft a short National Day campaign: headline, offer angle, WhatsApp/Instagram caption, CTA.
Saudi cultural tone, respectful, commercial. No purchase execution. Arabic primary.`,
  market_compare: `You are Tiqnora market comparison analyst for Saudi e-commerce.
Compare product positioning, rough price bands in SAR, and risks (shipping time, returns, competition).
Never invent live competitor stock or certified rankings. Output structured bullets in Arabic.
No supplier order placement.`,
  import_brief: `You prepare a product import brief for Tiqnora admin review.
Given a supplier product idea, produce: Arabic title, English title, short sales description, 3 benefits, SEO keywords, suggested retail SAR vs cost, margin %, and risks.
Never publish. Never place orders. Mark as candidate for owner approval.`,
  content: `You are Tiqnora AI Content Agent for product catalog.
Write Arabic product title + short description + 3 bullet benefits + SEO keywords for a dropshipping product.
Honest claims only. No fake certifications. Owner will review before publish.`,
};

async function callGemini(system, message) {
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
        generationConfig: { temperature: 0.45, maxOutputTokens: 1400 },
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(payload.error?.message || 'Gemini failed'), { status: 502 });
  }
  return (payload.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const mode = String(req.body?.mode || 'research').toLowerCase();
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > 4000) return json(res, 400, { error: 'رسالة غير صالحة' });

  const system = MODE_PROMPTS[mode] || MODE_PROMPTS.research;

  try {
    const reply = await callGemini(system, message);

    // best-effort log if service role available
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
            page_path: '/national-day',
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
