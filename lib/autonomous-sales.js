import { generateText } from './ai/provider.js';
const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function supabaseKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for autonomous sales.');
  return key;
}

async function rest(path, options = {}) {
  const key = supabaseKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || body?.hint || `Supabase ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
}

function geminiModel() {
  return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
}

function classifyGeminiHttpError(status, message = '') {
  const msg = String(message || '').toLowerCase();
  if (
    status === 429 ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests')
  ) {
    return 'AI_PROVIDER_QUOTA';
  }
  if ([500, 502, 503, 504].includes(status) || msg.includes('timeout') || msg.includes('temporarily unavailable')) {
    return 'AI_PROVIDER_UNAVAILABLE';
  }
  if (status === 401 || status === 403) return 'AI_PROVIDER_AUTH';
  return 'AI_PROVIDER_ERROR';
}

async function callGemini({ prompt, system = '', grounded = false, maxOutputTokens = 8192 }) {
  if (!grounded) {
    const result = await generateText({
      system,
      prompt,
      model: geminiModel(),
      maxTokens: maxOutputTokens,
      allowDeterministic: true
    });
    return {
      text: result.text,
      model: result.model,
      provider: result.provider || 'gemini',
      groundingSources: [],
      fallback_used: Boolean(result.fallback_used || result.degraded),
      degraded: Boolean(result.degraded || result.fallback_used)
    };
  }

  const apiKey = geminiKey();
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not configured.');
    error.code = 'AI_PROVIDER_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
  const model = geminiModel();
  const payload = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(grounded ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: grounded ? 0.2 : 0.45,
      maxOutputTokens
    }
  };

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
  } catch (networkError) {
    const error = new Error(String(networkError.message || networkError));
    error.code = 'AI_PROVIDER_UNAVAILABLE';
    error.status = 503;
    error.provider = 'gemini';
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.provider = 'gemini';
    error.code = classifyGeminiHttpError(response.status, message);
    throw error;
  }

  const candidate = data?.candidates?.[0] || {};
  const text = (candidate?.content?.parts || []).map(part => part?.text || '').join('\n').trim();
  const groundingSources = (candidate?.groundingMetadata?.groundingChunks || [])
    .map(chunk => chunk?.web?.uri)
    .filter(Boolean);

  if (!text) {
    const error = new Error('Gemini returned an empty response.');
    error.code = 'AI_EMPTY_RESPONSE';
    error.status = 502;
    throw error;
  }
  return {
    text,
    model,
    provider: 'gemini',
    groundingSources: [...new Set(groundingSources)],
    fallback_used: false
  };
}

function parseJsonArray(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('Gemini response did not contain a JSON array.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00966')) digits = digits.slice(2);
  if (digits.startsWith('05') && digits.length === 10) digits = `966${digits.slice(1)}`;
  else if (digits.startsWith('5') && digits.length === 9) digits = `966${digits}`;
  return digits;
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch (_) {
    return null;
  }
}

function domainFromUrl(value) {
  const url = normalizeUrl(value);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return null;
  }
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function scoreProspect(candidate) {
  let score = 0;
  const websiteExists = boolOrNull(candidate.website_exists);
  const hasWhatsApp = boolOrNull(candidate.has_whatsapp);
  const hasInstagram = boolOrNull(candidate.has_instagram);
  const hasBooking = boolOrNull(candidate.has_booking);
  const hasContact = boolOrNull(candidate.has_contact_form);
  const hasServices = boolOrNull(candidate.has_services_page);

  if (websiteExists === false) score += 30;
  else if (websiteExists == null) score += 12;
  if (hasWhatsApp === false) score += 10;
  if (hasInstagram === false) score += 6;
  if (hasBooking === false) score += 12;
  if (hasContact === false) score += 10;
  if (hasServices === false) score += 10;
  if (candidate.phone || candidate.whatsapp) score += 7;
  if (candidate.source_url || (candidate.source_urls || []).length) score += 5;

  return Math.max(0, Math.min(100, score));
}

function missingOpportunities(candidate) {
  const items = [];
  if (candidate.website_exists === false) items.push('موقع رسمي');
  if (candidate.has_whatsapp === false) items.push('واتساب للأعمال');
  if (candidate.has_instagram === false) items.push('Instagram');
  if (candidate.has_booking === false) items.push('الحجز/طلب الخدمة');
  if (candidate.has_contact_form === false) items.push('نماذج العملاء');
  if (candidate.has_services_page === false) items.push('صفحات خدمات');
  if (!items.length) items.push('SEO/GEO محلي وتحسين التحويل');
  return items;
}

function cleanText(value, max = 1200) {
  return String(value || '').trim().slice(0, max) || null;
}

function validSourceUrl(value) {
  const url = normalizeUrl(value);
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'google.com' || host.endsWith('.google.com')) return null;
    return url;
  } catch (_) {
    return null;
  }
}

async function upsertProspect(raw, groundingSources) {
  const businessName = cleanText(raw.business_name, 240);
  if (!businessName) return { skipped: true, reason: 'missing_name' };

  const candidateSources = [
    ...(Array.isArray(raw.source_urls) ? raw.source_urls : []),
    raw.source_url
  ].map(validSourceUrl).filter(Boolean);

  const uniqueCandidateSources = [...new Set(candidateSources)];
  const groundedSources = [...new Set((groundingSources || []).map(validSourceUrl).filter(Boolean))];

  const groundedHosts = new Set(groundedSources.map(url => {
    try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase(); }
    catch (_) { return ''; }
  }).filter(Boolean));

  const verifiedCandidateSources = uniqueCandidateSources.filter(url => {
    if (!groundedHosts.size) return true;
    try {
      const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
      return groundedHosts.has(host);
    } catch (_) {
      return false;
    }
  });

  const sourceUrl = verifiedCandidateSources[0] || null;
  if (!sourceUrl) return { skipped: true, reason: 'missing_verifiable_source', business_name: businessName };

  const phoneNorm = normalizePhone(raw.phone || raw.whatsapp);
  const website = normalizeUrl(raw.website);
  const whatsapp = cleanText(raw.whatsapp || (phoneNorm ? `+${phoneNorm}` : ''), 80);
  const score = scoreProspect({ ...raw, phone: raw.phone || phoneNorm, whatsapp, source_url: sourceUrl });
  const priority = score >= 60 ? 'HIGH' : (score >= 35 ? 'MEDIUM' : 'LOW');
  const missing = Array.isArray(raw.missing_opportunities) && raw.missing_opportunities.length
    ? raw.missing_opportunities.map(item => cleanText(item, 120)).filter(Boolean).slice(0, 10)
    : missingOpportunities(raw);

  const payload = {
    business_name: businessName,
    category: cleanText(raw.category, 160),
    city: cleanText(raw.city, 120) || 'المدينة المنورة',
    district: cleanText(raw.district, 160),
    website,
    website_domain: domainFromUrl(website),
    phone: cleanText(raw.phone || (phoneNorm ? `+${phoneNorm}` : ''), 80),
    phone_norm: phoneNorm,
    whatsapp,
    email: cleanText(raw.email, 220),
    instagram: cleanText(raw.instagram, 500),
    facebook: cleanText(raw.facebook, 500),
    tiktok: cleanText(raw.tiktok, 500),
    linkedin: cleanText(raw.linkedin, 500),
    google_maps_url: normalizeUrl(raw.google_maps_url),
    source: 'gemini_grounded_sales_scout',
    source_url: sourceUrl,
    website_exists: boolOrNull(raw.website_exists),
    website_quality: cleanText(raw.website_quality, 80),
    mobile_quality: cleanText(raw.mobile_quality, 80),
    has_whatsapp: boolOrNull(raw.has_whatsapp),
    has_instagram: boolOrNull(raw.has_instagram),
    has_booking: boolOrNull(raw.has_booking),
    has_contact_form: boolOrNull(raw.has_contact_form),
    has_services_page: boolOrNull(raw.has_services_page),
    opportunity_score: score,
    priority,
    audit_summary: cleanText(raw.evidence_summary || raw.audit_summary, 1800),
    missing_opportunities: missing,
    audit_json: {
      generated_by: 'gemini_grounded_sales_scout',
      generated_at: new Date().toISOString(),
      source_urls: verifiedCandidateSources.slice(0, 12),
      grounding_sources: groundedSources.slice(0, 20),
      outreach_message: cleanText(raw.outreach_message, 900),
      offer_angle: cleanText(raw.offer_angle, 500),
      evidence_summary: cleanText(raw.evidence_summary, 1800)
    },
    status: 'new',
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const rows = await rest('prospects?on_conflict=business_name_norm,city', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });
    return { inserted_or_updated: true, row: rows?.[0] || null };
  } catch (error) {
    if (error.status === 409 && phoneNorm) {
      const rows = await rest(`prospects?phone_norm=eq.${encodeURIComponent(phoneNorm)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      if (rows?.length) return { inserted_or_updated: true, row: rows[0], matched_by_phone: true };
    }
    throw error;
  }
}

function discoveryPrompt() {
  return `
أنت وكيل مبيعات B2B لمنصة Tiqnora AI في المدينة المنورة، السعودية.
ابحث في الويب الآن باستخدام Google Search عن 10 منشآت محلية حقيقية في المدينة المنورة لديها فرصة واضحة لخدمات رقمية من Tiqnora.

ركّز على القطاعات التي يمكن إغلاق صفقة معها بسرعة:
- الأمن والسلامة والأنظمة الأمنية
- العقار وإدارة الأملاك
- المقاولات ومواد البناء
- المطاعم والمقاهي
- العيادات والمراكز الطبية
- الفنادق والشقق الفندقية

شروط إلزامية:
1) المنشأة يجب أن تكون مرتبطة فعلياً بالمدينة المنورة بمصدر عام قابل للتحقق.
2) لا تختر منشأة بلا مصدر URL حقيقي.
3) فضّل المنشآت التي لديها رقم اتصال أو واتساب.
4) لا تدّعِ أن الموقع أو الواتساب أو الإنستغرام غير موجود إلا إذا دعمت نتائج البحث ذلك. عند عدم اليقين استخدم null بدلاً من false.
5) لا تختر شركات ضخمة أو جهات حكومية.
6) لا تكرر نفس المنشأة.
7) الرسالة المقترحة يجب أن تكون شخصية ومختصرة وغير سبامية، وهدفها أخذ إذن لإرسال تحليل مجاني أو حجز مكالمة، بدون وعود مالية مبالغ فيها.

أعد فقط JSON array صالح، بدون Markdown أو شرح، وكل عنصر بالشكل التالي:
{
  "business_name": "string",
  "category": "string",
  "city": "المدينة المنورة",
  "district": "string|null",
  "website": "https://...|null",
  "phone": "string|null",
  "whatsapp": "string|null",
  "email": "string|null",
  "instagram": "string|null",
  "facebook": "string|null",
  "tiktok": "string|null",
  "linkedin": "string|null",
  "google_maps_url": "https://...|null",
  "website_exists": true|false|null,
  "website_quality": "good|average|weak|null",
  "mobile_quality": "good|average|weak|null",
  "has_whatsapp": true|false|null,
  "has_instagram": true|false|null,
  "has_booking": true|false|null,
  "has_contact_form": true|false|null,
  "has_services_page": true|false|null,
  "evidence_summary": "ملخص واقعي قصير لما وجدته ولماذا هي فرصة",
  "missing_opportunities": ["..."],
  "offer_angle": "الخدمة الأنسب من Tiqnora",
  "outreach_message": "رسالة افتتاحية عربية قصيرة مخصصة",
  "source_url": "https://...",
  "source_urls": ["https://..."]
}
`.trim();
}

export async function discoverProspects() {
  let response;
  try {
    response = await callGemini({
      prompt: discoveryPrompt(),
      grounded: true,
      maxOutputTokens: 8192
    });
  } catch (error) {
    const code = error.code || 'AI_PROVIDER_ERROR';
    const msg = String(error.message || error).toLowerCase();
    const isProviderFailure =
      ['AI_PROVIDER_QUOTA', 'AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_NOT_CONFIGURED', 'AI_PROVIDER_AUTH', 'AI_PROVIDER_ERROR', 'AI_EMPTY_RESPONSE'].includes(code) ||
      msg.includes('quota') ||
      msg.includes('rate limit') ||
      msg.includes('resource exhausted');

    if (isProviderFailure) {
      return {
        degraded: true,
        provider: error.provider || 'gemini',
        model: geminiModel(),
        candidates: 0,
        saved: 0,
        skipped: 0,
        failed: 0,
        results: [],
        error_code: code,
        error_message: String(error.message || error).slice(0, 500),
        fallback_used: true
      };
    }
    throw error;
  }

  const candidates = parseJsonArray(response.text).slice(0, 12);
  const results = [];
  for (const candidate of candidates) {
    try {
      results.push(await upsertProspect(candidate, response.groundingSources));
    } catch (error) {
      results.push({
        failed: true,
        business_name: candidate?.business_name || null,
        error: String(error.message || error).slice(0, 500)
      });
    }
  }

  return {
    degraded: false,
    provider: response.provider || 'gemini',
    model: response.model,
    candidates: candidates.length,
    saved: results.filter(item => item.inserted_or_updated).length,
    skipped: results.filter(item => item.skipped).length,
    failed: results.filter(item => item.failed).length,
    results,
    fallback_used: Boolean(response.fallback_used)
  };
}

async function getAgent(agentId) {
  const rows = await rest(`ai_agents?id=eq.${encodeURIComponent(agentId)}&select=*&limit=1`);
  return rows?.[0] || null;
}

async function topProspectContext() {
  return rest(
    'prospects?select=business_name,category,city,district,phone,whatsapp,website,opportunity_score,priority,audit_summary,missing_opportunities,audit_json&order=opportunity_score.desc&limit=15'
  ).catch(() => []);
}

async function saveConversation(row) {
  const rows = await rest('ai_conversations?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return rows?.[0] || null;
}

async function patchTask(id, patch) {
  return rest(`ai_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
}

function taskPrompt(task, prospects) {
  return `
هذه مهمة تشغيلية حقيقية داخل Tiqnora AI.

العنوان: ${task.title}
الوصف: ${task.description || '—'}

أعلى فرص المبيعات الحالية في CRM:
${JSON.stringify(prospects, null, 2)}

نفّذ المهمة الآن. أعطني نتيجة عملية قابلة للاستخدام مباشرة، لا تنظيراً عاماً.
إذا كانت المهمة مبيعات أو تواصل:
- خصّص التوصية لكل شركة.
- لا تخترع حقائق غير موجودة في البيانات.
- لا ترسل أي رسالة فعلياً؛ جهّزها للمراجعة فقط.
- اجعل CTA هو الحصول على إذن لإرسال تحليل مجاني أو حجز مكالمة.
`.trim();
}

export async function runQueuedTasks({ limit = 8 } = {}) {
  const rows = await rest('ai_tasks?select=*&status=eq.todo&order=created_at.asc&limit=30').catch(() => []);
  const due = (rows || [])
    .filter(task => !task.due_at || new Date(task.due_at).getTime() <= Date.now())
    .slice(0, limit);

  if (!due.length) return { due: 0, completed: 0, failed: 0, runs: [] };

  const prospects = await topProspectContext();
  const runs = [];

  for (const task of due) {
    let agent = null;
    try {
      agent = await getAgent(task.agent_id);
      if (!agent || agent.status !== 'active' || !agent.is_enabled) {
        runs.push({ task_id: task.id, skipped: true, reason: 'agent_inactive' });
        continue;
      }

      await patchTask(task.id, { status: 'in_progress' });

      const result = await callGemini({
        system: agent.system_prompt || agent.description || 'أنت موظف ذكي داخل Tiqnora AI.',
        prompt: taskPrompt(task, prospects),
        grounded: false,
        maxOutputTokens: 4096
      });

      await saveConversation({
        organization_id: task.organization_id,
        agent_id: task.agent_id,
        user_id: task.created_by,
        message: `[AUTO TASK] ${task.title}\n${task.description || ''}`,
        response: result.text,
        provider: result.provider || 'google_ai',
        model: result.model,
        status: 'completed'
      });

      await patchTask(task.id, { status: 'done' });
      runs.push({
        task_id: task.id,
        title: task.title,
        completed: true,
        provider: result.provider,
        model: result.model,
        fallback_used: Boolean(result.fallback_used || result.degraded)
      });
    } catch (error) {
      const errCode = error.code || 'AI_PROVIDER_ERROR';
      const retryable = ['AI_PROVIDER_QUOTA', 'AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_NOT_CONFIGURED', 'AI_EMPTY_RESPONSE'].includes(errCode)
        || String(error.message || '').toLowerCase().includes('quota');

      if (agent && task.created_by) {
        await saveConversation({
          organization_id: task.organization_id,
          agent_id: task.agent_id,
          user_id: task.created_by,
          message: `[AUTO TASK] ${task.title}\n${task.description || ''}`,
          response: `FAILED: ${String(error.message || error).slice(0, 800)}`,
          provider: error.provider || 'unknown',
          model: null,
          status: 'failed'
        }).catch(() => null);
      }

      await patchTask(task.id, {
        status: retryable ? 'todo' : 'failed',
        notes: String(error.message || error).slice(0, 500)
      }).catch(() => null);

      runs.push({
        task_id: task.id,
        title: task.title,
        failed: true,
        retryable,
        error_code: errCode,
        error: String(error.message || error).slice(0, 500)
      });
    }
  }

  return {
    due: due.length,
    completed: runs.filter(r => r.completed).length,
    failed: runs.filter(r => r.failed).length,
    runs
  };
}

function dateKeyRiyadh() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

export async function ensureDailyWorkforceTasks() {
  const agents = await rest('ai_agents?select=id,slug,name,status,is_enabled&is_enabled=eq.true&status=eq.active').catch(() => []);
  const enabled = agents || [];
  if (!enabled.length) {
    return { agents_enabled: [], tasks_created: 0, tasks_existing: 0 };
  }

  const day = dateKeyRiyadh();
  let created = 0;
  let existing = 0;

  const templates = [
    { title: `Daily prospect research — ${day}`, description: 'Discover and score local B2B prospects in Madinah for Tiqnora services. Draft only.' },
    { title: `Daily outreach drafts — ${day}`, description: 'Prepare personalized outreach drafts for top HIGH prospects. Do not send. Approval required.' },
    { title: `Daily pipeline review — ${day}`, description: 'Review open opportunities and recommend next best actions. No external messages.' }
  ];

  for (const agent of enabled.slice(0, 6)) {
    for (const tpl of templates) {
      const title = `${tpl.title} [${agent.slug || agent.name}]`;
      const found = await rest(
        `ai_tasks?select=id&title=eq.${encodeURIComponent(title)}&limit=1`
      ).catch(() => []);
      if (found?.length) {
        existing += 1;
        continue;
      }
      try {
        await rest('ai_tasks', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            organization_id: agent.organization_id || null,
            agent_id: agent.id,
            title,
            description: tpl.description,
            status: 'todo',
            priority: 'normal',
            due_at: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString()
          })
        });
        created += 1;
      } catch (_) {
        /* ignore race */
      }
    }
  }

  return {
    agents_enabled: enabled.map(a => ({ id: a.id, slug: a.slug, name: a.name })),
    tasks_created: created,
    tasks_existing: existing
  };
}

export async function runAutonomousGrowth() {
  let prospecting;
  try {
    prospecting = await discoverProspects();
  } catch (error) {
    prospecting = {
      degraded: true,
      candidates: 0,
      saved: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error_code: error.code || 'GROWTH_FAILED',
      error_message: String(error.message || error).slice(0, 500),
      fallback_used: true
    };
  }

  let tasks;
  try {
    tasks = await runQueuedTasks({ limit: 8 });
  } catch (error) {
    tasks = {
      due: 0,
      completed: 0,
      failed: 1,
      runs: [{ failed: true, error: String(error.message || error).slice(0, 500) }]
    };
  }

  return {
    degraded: Boolean(prospecting?.degraded || tasks?.failed),
    prospecting,
    tasks
  };
}
