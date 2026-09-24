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

async function callGemini({ prompt, system = '', grounded = false, maxOutputTokens = 8192 }) {
  const apiKey = geminiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Gemini request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const candidate = data?.candidates?.[0] || {};
  const text = (candidate?.content?.parts || []).map(part => part?.text || '').join('\n').trim();
  const groundingSources = (candidate?.groundingMetadata?.groundingChunks || [])
    .map(chunk => chunk?.web?.uri)
    .filter(Boolean);

  if (!text) throw new Error('Gemini returned an empty response.');
  return { text, model, groundingSources: [...new Set(groundingSources)] };
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
  const response = await callGemini({
    prompt: discoveryPrompt(),
    grounded: true,
    maxOutputTokens: 8192
  });

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
    model: response.model,
    candidates: candidates.length,
    saved: results.filter(item => item.inserted_or_updated).length,
    skipped: results.filter(item => item.skipped).length,
    failed: results.filter(item => item.failed).length,
    results
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
        provider: 'google_ai',
        model: result.model,
        status: 'completed'
      });

      await patchTask(task.id, { status: 'done' });
      runs.push({ task_id: task.id, title: task.title, completed: true });
    } catch (error) {
      if (agent && task.created_by) {
        await saveConversation({
          organization_id: task.organization_id,
          agent_id: task.agent_id,
          user_id: task.created_by,
          message: `[AUTO TASK] ${task.title}\n${task.description || ''}`,
          response: null,
          provider: 'google_ai',
          model: geminiModel(),
          status: 'failed',
          error_message: String(error.message || error).slice(0, 1000)
        }).catch(() => {});
      }
      await patchTask(task.id, { status: 'todo' }).catch(() => {});
      runs.push({ task_id: task.id, title: task.title, failed: true, error: String(error.message || error).slice(0, 500) });
    }
  }

  return {
    due: due.length,
    completed: runs.filter(run => run.completed).length,
    failed: runs.filter(run => run.failed).length,
    runs
  };
}


function riyadhDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function organizationOwnerUserId(organizationId) {
  const owner = await rest(
    `organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.owner&select=user_id&limit=1`
  ).catch(() => []);
  if (owner?.[0]?.user_id) return owner[0].user_id;

  const admin = await rest(
    `organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.admin&select=user_id&limit=1`
  ).catch(() => []);
  if (admin?.[0]?.user_id) return admin[0].user_id;

  const task = await rest(
    `ai_tasks?organization_id=eq.${encodeURIComponent(organizationId)}&select=created_by&order=created_at.desc&limit=1`
  ).catch(() => []);
  return task?.[0]?.created_by || null;
}

async function ensureDailyAgent(existingAgents, baseAgent, spec) {
  const current = existingAgents.find(agent => agent.slug === spec.slug);
  if (current) {
    await rest(`ai_agents?id=eq.${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        is_enabled: true,
        api_ready: true,
        status: 'active',
        provider: 'google_ai',
        model: current.model || geminiModel(),
        updated_at: new Date().toISOString()
      })
    });
    return { ...current, is_enabled: true, status: 'active', provider: 'google_ai' };
  }

  const rows = await rest('ai_agents?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: baseAgent.organization_id,
      slug: spec.slug,
      name: spec.name_ar,
      name_ar: spec.name_ar,
      name_en: spec.name_en,
      department: spec.department,
      description: spec.description_ar,
      description_ar: spec.description_ar,
      description_en: spec.description_en,
      provider: 'google_ai',
      model: geminiModel(),
      system_prompt: spec.system_prompt,
      temperature: spec.temperature ?? 0.55,
      is_enabled: true,
      api_ready: true,
      status: 'active',
      config: { daily_workforce: true }
    })
  });
  return rows?.[0] || null;
}

async function ensureDailyTask({ organizationId, ownerUserId, agent, dateKey, title, description }) {
  const fullTitle = `[DAILY ${dateKey}] ${title}`;
  const existing = await rest(
    `ai_tasks?organization_id=eq.${encodeURIComponent(organizationId)}&title=eq.${encodeURIComponent(fullTitle)}&select=id,title,status&limit=1`
  ).catch(() => []);
  if (existing?.length) return { created: false, task: existing[0] };

  const rows = await rest('ai_tasks?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      agent_id: agent.id,
      created_by: ownerUserId,
      title: fullTitle,
      description,
      status: 'todo',
      priority: 'high',
      due_at: new Date().toISOString()
    })
  });
  return { created: true, task: rows?.[0] || null };
}

export async function ensureDailyWorkforceTasks() {
  const existingAgents = await rest('ai_agents?select=*&order=created_at.asc&limit=50');
  const baseAgent =
    existingAgents.find(agent => agent.slug === 'social-media') ||
    existingAgents.find(agent => agent.is_enabled) ||
    existingAgents[0];

  if (!baseAgent?.organization_id) {
    throw new Error('Cannot determine Tiqnora organization for daily workforce.');
  }

  const organizationId = baseAgent.organization_id;
  const ownerUserId = await organizationOwnerUserId(organizationId);
  if (!ownerUserId) throw new Error('Cannot determine Tiqnora owner/admin user for daily tasks.');

  const specs = [
    {
      slug: 'sales',
      name_ar: 'محلل المبيعات الذكي',
      name_en: 'AI Sales Analyst',
      department: 'sales',
      description_ar: 'البحث عن فرص مبيعات وتأهيلها وصياغة رسائل مخصصة للمراجعة.',
      description_en: 'Researches and qualifies sales opportunities and drafts personalized outreach.',
      system_prompt: 'أنت وكيل المبيعات في Tiqnora AI. ابحث عن فرص حقيقية، لا تختلق بيانات، جهز رسائل مخصصة للمراجعة، ولا ترسل لأي عميل دون موافقة صريحة.'
    },
    {
      slug: 'marketing',
      name_ar: 'مدير التسويق الذكي',
      name_en: 'AI Marketing Manager',
      department: 'marketing',
      description_ar: 'تحليل السوق وبناء عروض وحملات يومية مرتبطة بخدمات Tiqnora.',
      description_en: 'Analyzes the market and prepares daily campaigns and offers for Tiqnora.',
      system_prompt: 'أنت مدير التسويق في Tiqnora AI. جهز حملات عملية قابلة للتنفيذ ومبنية على خدماتنا الحقيقية، بدون ادعاءات أو أرقام غير موثقة.'
    },
    {
      slug: 'social-media',
      name_ar: 'مدير السوشيال ميديا',
      name_en: 'Social Media Manager',
      department: 'marketing',
      description_ar: 'إعداد خطة ومنشورات يومية لمنصات Tiqnora الاجتماعية.',
      description_en: 'Plans and prepares daily social media content for Tiqnora.',
      system_prompt: 'أنت مدير السوشيال ميديا في Tiqnora AI. جهز يومياً خطة نشر لمنصات TikTok وInstagram وFacebook وLinkedIn مع النصوص والهاشتاقات وCTA. لا تنشر تلقائياً بدون موافقة.'
    },
    {
      slug: 'content',
      name_ar: 'كاتب المحتوى',
      name_en: 'Content Writer',
      department: 'content',
      description_ar: 'كتابة محتوى عربي احترافي يومي لخدمات ومنتجات Tiqnora.',
      description_en: 'Writes professional daily Arabic content for Tiqnora services and products.',
      system_prompt: 'أنت كاتب المحتوى في Tiqnora AI. اكتب محتوى عربي واضح واحترافي، نسخة قصيرة للسوشيال ونسخة أطول عند الحاجة، مع فكرة مقال أو موضوع تثقيفي. لا تختلق حقائق.'
    },
    {
      slug: 'image-designer',
      name_ar: 'مصمم الصور',
      name_en: 'Image Designer',
      department: 'creative',
      description_ar: 'تحويل فكرة المحتوى إلى تصور بصري وبرومبت تصميم جاهز للإنتاج.',
      description_en: 'Turns content ideas into production-ready visual concepts and image prompts.',
      system_prompt: 'أنت مصمم الصور في Tiqnora AI. التزم بهوية Tiqnora: Electric Blue #0A5CFF، Cyber Cyan #00D2FF، Midnight Navy #060B1E، Pure White #FFFFFF. جهز تصوراً بصرياً كاملاً، المقاسات، النص على التصميم، التكوين، وبرومبت إنتاج الصورة. لا تدّعي أنك أنشأت ملف صورة إذا لم يتم استدعاء أداة توليد صور.'
    },
    {
      slug: 'video-designer',
      name_ar: 'مصمم الفيديو',
      name_en: 'Video Designer',
      department: 'creative',
      description_ar: 'إعداد فكرة الفيديو والخطاف والسيناريو والشوت ليست والنصوص.',
      description_en: 'Creates video concepts, hooks, scripts, shot lists and captions.',
      system_prompt: 'أنت مصمم الفيديو في Tiqnora AI. جهز فيديوهات قصيرة للسوشيال: Hook قوي، سيناريو، shot list، نص على الشاشة، voice-over، CTA، وملاحظات المونتاج. لا تدّعي إنشاء ملف فيديو إذا لم يتم استدعاء أداة فيديو فعلية.'
    }
  ];

  const agents = [];
  for (const spec of specs) {
    const agent = await ensureDailyAgent(existingAgents, baseAgent, spec);
    if (agent) agents.push(agent);
  }

  // The owner requested that every Tiqnora agent participate in the daily cycle.
  // Enable all existing agents in this organization, then include any newly created creative agents.
  for (const agent of existingAgents.filter(x => x.organization_id === organizationId)) {
    await rest(`ai_agents?id=eq.${encodeURIComponent(agent.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        is_enabled: true,
        api_ready: true,
        status: 'active',
        provider: 'google_ai',
        model: agent.model || geminiModel(),
        updated_at: new Date().toISOString()
      })
    });
    if (!agents.some(x => x.id === agent.id)) {
      agents.push({ ...agent, is_enabled: true, api_ready: true, status: 'active', provider: 'google_ai' });
    }
  }

  const dateKey = riyadhDateKey();
  const work = [
    {
      slug: 'sales',
      title: 'البحث عن 10 عملاء وتأهيلهم',
      description: 'ابحث عن 10 فرص B2B جديدة في المدينة المنورة، تحقق من المعلومات، جهز رسالة مخصصة لكل فرصة، وحدد من يستحق المتابعة داخل CRM. لا ترسل أي رسالة تلقائياً.'
    },
    {
      slug: 'marketing',
      title: 'حملة تسويق اليوم',
      description: 'حلل خدمات Tiqnora والفرص الحالية واقترح حملة يومية واحدة واضحة: الجمهور، العرض، زاوية الرسالة، CTA، والقنوات المناسبة.'
    },
    {
      slug: 'social-media',
      title: 'خطة منشورات السوشيال اليومية',
      description: 'جهز خطة منشورات اليوم لـ TikTok وInstagram وFacebook وLinkedIn، مع فكرة كل منشور، النص، الهاشتاقات، CTA، ووقت نشر مقترح بين 7 و8 صباحاً بتوقيت السعودية. لا تنشر تلقائياً.'
    },
    {
      slug: 'content',
      title: 'كتابة محتوى اليوم',
      description: 'اكتب محتوى عربي احترافي لليوم مرتبط بخدمات Tiqnora: نسخة رئيسية، نسخة قصيرة للسوشيال، عنوان قوي، CTA، وفكرة مقال أو محتوى تثقيفي.'
    },
    {
      slug: 'image-designer',
      title: 'تصميم صورة اليوم',
      description: 'اختر أقوى فكرة محتوى لليوم وحولها إلى brief بصري كامل وبرومبت إنتاج صورة احترافية متوافقة مع هوية Tiqnora، مع مقاسات 1080x1080 و1080x1350 وStory 1080x1920.'
    },
    {
      slug: 'video-designer',
      title: 'تصميم فيديو اليوم',
      description: 'اختر أقوى فكرة تسويقية لليوم وجهز فيديو قصير 15-30 ثانية: Hook، سيناريو، shot list، نصوص الشاشة، voice-over، CTA، وكابشن للنشر على TikTok وInstagram Reels وFacebook Reels.'
    },
    {
      slug: 'ads',
      title: 'خطة الإعلانات المدفوعة اليوم',
      description: 'راجع عروض Tiqnora الحالية واقترح حملة إعلانية مدفوعة واحدة لليوم: الهدف، الجمهور، الرسالة، الكرياتيف، الميزانية المقترحة كمجال اختباري فقط، ومعايير القياس. لا تطلق أي إعلان ولا تصرف أي مبلغ.'
    },
    {
      slug: 'channel',
      title: 'فرص القنوات والشراكات اليوم',
      description: 'حدد فرصتين عمليتين لقنوات توزيع أو شراكات B2B يمكن أن تجلب عملاء لـ Tiqnora، مع طريقة التواصل والقيمة المشتركة وخطوة المتابعة التالية. لا ترسل أي تواصل تلقائياً.'
    },
    {
      slug: 'assistant',
      title: 'مراجعة تشغيل Tiqnora اليومية',
      description: 'راجع حالة الأعمال المفتوحة، رتب الأولويات، لخص ما يحتاج قراراً من المالك، واقترح 3 إجراءات تشغيلية واضحة لليوم بدون تنفيذ إجراءات خارجية غير مصرح بها.'
    },
    {
      slug: 'developer',
      title: 'فحص تقني يومي للمنصة',
      description: 'راجع مؤشرات Tiqnora التقنية المتاحة لك، المهام التقنية المفتوحة، وأبرز المخاطر أو الأعطال المحتملة، ثم قدم قائمة إصلاحات مرتبة حسب الأولوية. لا تدّعِ تنفيذ تعديل لم يتم فعلياً.'
    },
    {
      slug: 'commerce',
      title: 'مراجعة المتجر والمنتجات اليوم',
      description: 'راجع وضع المتجر والمنتجات والموردين المتاحين، واقترح أهم 5 إجراءات لتحسين المنتجات أو الجودة أو التوفر أو العرض. لا تنشر منتجاً ولا تشتري من مورد تلقائياً.'
    }
  ];

  const covered = new Set(work.map(item => item.slug));
  for (const agent of agents) {
    if (covered.has(agent.slug)) continue;
    work.push({
      slug: agent.slug,
      title: `مهمة يومية — ${agent.name_ar || agent.name || agent.slug}`,
      description: `اعمل ضمن تخصصك كوكيل ${agent.name_ar || agent.name || agent.slug} في Tiqnora AI. راجع بيانات المنصة والمهام المتاحة وقدّم نتيجة عملية واحدة قابلة للاستخدام اليوم، مع توضيح ما أنجزته وما يحتاج موافقة المالك. لا تنفذ نشر أو إرسال أو دفع أو شراء تلقائي بدون موافقة.`
    });
  }

  const tasks = [];
  for (const item of work) {
    const agent = agents.find(x => x.slug === item.slug);
    if (!agent) continue;
    tasks.push(await ensureDailyTask({
      organizationId,
      ownerUserId,
      agent,
      dateKey,
      title: item.title,
      description: item.description
    }));
  }

  return {
    date: dateKey,
    organization_id: organizationId,
    agents_enabled: agents.map(agent => agent.slug),
    tasks_created: tasks.filter(item => item.created).length,
    tasks_existing: tasks.filter(item => !item.created).length,
    task_ids: tasks.map(item => item.task?.id).filter(Boolean)
  };
}

export async function runDailyWorkforce() {
  const prepared = await ensureDailyWorkforceTasks();
  const execution = await runQueuedTasks({ limit: 30 });
  return { prepared, execution };
}

export async function runAutonomousGrowth() {
  const prospecting = await discoverProspects();
  const tasks = await runQueuedTasks({ limit: 30 });

  return {
    ran_at: new Date().toISOString(),
    prospecting,
    tasks
  };
}
