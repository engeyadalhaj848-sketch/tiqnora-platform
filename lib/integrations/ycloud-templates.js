/**
 * YCloud WhatsApp template helpers.
 * Server-side only. Never expose YCLOUD_API_KEY to the browser.
 */

export const TIQNORA_YCLOUD_TEMPLATE_PRESETS = [
  {
    name: 'tiqnora_building_intro_ar',
    language: 'ar',
    category: 'MARKETING',
    label: 'مواد البناء — تعريف Tiqnora',
    components: [
      {
        type: 'BODY',
        text: 'مرحبًا فريق {{1}}، معكم Tiqnora AI في المدينة المنورة. نساعد منشآت مواد البناء على تنظيم طلبات عروض الأسعار واستفسارات المقاولين عبر واتساب وCRM وكتالوج رقمي. إذا حابين نرسل لكم تصورًا مختصرًا مناسبًا لنشاطكم.',
        example: { body_text: [['مؤسسة مواد بناء']] }
      },
      { type: 'FOOTER', text: 'Tiqnora AI | المدينة المنورة' }
    ]
  },
  {
    name: 'tiqnora_electrical_intro_ar',
    language: 'ar',
    category: 'MARKETING',
    label: 'المواد الكهربائية — تعريف Tiqnora',
    components: [
      {
        type: 'BODY',
        text: 'مرحبًا فريق {{1}}، معكم Tiqnora AI في المدينة المنورة. نساعد محلات وموردي المواد الكهربائية على تنظيم طلبات الأسعار والاستفسارات ومتابعة العملاء عبر واتساب وCRM وكتالوج رقمي. إذا حابين نرسل لكم تصورًا مختصرًا مناسبًا لنشاطكم.',
        example: { body_text: [['متجر مواد كهربائية']] }
      },
      { type: 'FOOTER', text: 'Tiqnora AI | المدينة المنورة' }
    ]
  },
  {
    name: 'tiqnora_sales_followup_ar',
    language: 'ar',
    category: 'MARKETING',
    label: 'متابعة المبيعات',
    components: [
      {
        type: 'BODY',
        text: 'مرحبًا فريق {{1}}، متابعة سريعة من Tiqnora بخصوص التصور المقترح لأتمتة طلبات الأسعار ومتابعة العملاء. إذا مناسب لكم، نرسل التفاصيل هنا على واتساب.',
        example: { body_text: [['اسم المنشأة']] }
      },
      { type: 'FOOTER', text: 'Tiqnora AI | المدينة المنورة' }
    ]
  }
];

export async function ycloudRequest(path, { method = 'GET', body = null, query = {}, timeoutMs = 20000 } = {}) {
  const apiKey = String(process.env.YCLOUD_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('YCloud API key is not configured.');
    error.status = 503;
    error.code = 'ycloud_key_missing';
    throw error;
  }
  const url = new URL('https://api.ycloud.com' + path);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    ...(body == null ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || payload?.message || payload?.error_data || `YCloud HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status || 502;
    error.code = payload?.error?.code || payload?.code || 'ycloud_api_error';
    error.detail = payload;
    throw error;
  }
  return payload;
}

export function normalizeYCloudTemplateList(payload) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.data?.items) ? payload.data.items : Array.isArray(payload?.data) ? payload.data : [];
  return items.map(item => ({
    official_template_id: item.officialTemplateId || item.id || null,
    waba_id: item.wabaId || null,
    name: item.name || null,
    language: item.language || null,
    category: item.category || null,
    status: item.status || null,
    quality_score: item.qualityScore || item.quality_score || null,
    rejected_reason: item.rejectedReason || item.rejected_reason || item.reason || null,
    components: Array.isArray(item.components) ? item.components : []
  }));
}

export async function listYCloudTemplates(wabaId) {
  const payload = await ycloudRequest('/v2/whatsapp/templates', { query: { 'filter.wabaId': wabaId, limit: 100, includeTotal: true } });
  return normalizeYCloudTemplateList(payload);
}

export async function ensureYCloudTemplatePresets(wabaId) {
  const existing = await listYCloudTemplates(wabaId);
  const byKey = new Map(existing.map(t => [`${t.name}:${t.language}`, t]));
  const results = [];
  for (const preset of TIQNORA_YCLOUD_TEMPLATE_PRESETS) {
    const key = `${preset.name}:${preset.language}`;
    if (byKey.has(key)) {
      results.push({ ...byKey.get(key), label: preset.label, created: false });
      continue;
    }
    const created = await ycloudRequest('/v2/whatsapp/templates', {
      method: 'POST',
      body: { wabaId: String(wabaId), name: preset.name, language: preset.language, category: preset.category, components: preset.components }
    });
    const normalized = normalizeYCloudTemplateList([created])[0] || { name: preset.name, language: preset.language, category: preset.category, status: created?.status || 'PENDING' };
    results.push({ ...normalized, label: preset.label, created: true });
  }
  return results;
}

export async function retrieveYCloudTemplate(wabaId, name, language = 'ar') {
  return ycloudRequest(`/v2/whatsapp/templates/${encodeURIComponent(wabaId)}/${encodeURIComponent(name)}/${encodeURIComponent(language)}`);
}

export async function sendYCloudTemplateMessage({ from, to, name, language = 'ar', components = [] }) {
  return ycloudRequest('/v2/whatsapp/messages', {
    method: 'POST',
    body: { from, to, type: 'template', template: { name, language: { code: language }, components } }
  });
}
