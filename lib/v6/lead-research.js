/**
 * Tiqnora V6 — Lead Research & Intelligence Engine
 *
 * Multi-source discovery → normalize → dedupe → enrich → score → CRM (human review).
 * No automatic outreach. No invented contact data.
 */

import { enrichLead } from './lead-enrichment.js';
import { buildSalesPlaybookResult } from './sales-playbooks.js';
import { discoverWithProvider } from './research/provider-registry.js';

export const RESEARCH_JOB_STATUSES = Object.freeze([
  'draft',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled'
]);

export const CANDIDATE_STATUSES = Object.freeze([
  'discovered',
  'enriched',
  'qualified',
  'imported',
  'ignored',
  'duplicate'
]);

const SOURCE_TYPES = Object.freeze([
  'manual',
  'csv',
  'google_places',
  'search',
  'directory',
  'website',
  'api',
  'fixture'
]);

function asString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function lower(v) {
  const s = asString(v);
  return s ? s.toLowerCase() : null;
}

function normalizePhone(phone) {
  const s = asString(phone);
  if (!s) return null;
  const digits = s.replace(/[^\d+]/g, '');
  if (digits.length < 8) return null;
  return digits;
}

function normalizeDomain(website) {
  const s = asString(website);
  if (!s) return null;
  try {
    const url = s.includes('://') ? new URL(s) : new URL(`https://${s}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase() || null;
  }
}

function normalizeNameKey(name) {
  const s = lower(name);
  if (!s) return null;
  return s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normalize a raw discovery row into a standard business record.
 */
export function normalizeBusinessRecord(raw = {}, defaults = {}) {
  const business_name = asString(raw.business_name || raw.name || raw.company_name || raw.title);
  const phone = normalizePhone(raw.phone || raw.telephone || raw.mobile);
  const whatsapp = normalizePhone(raw.whatsapp || raw.wa) || phone;
  const email = lower(raw.email);
  const website = asString(raw.website || raw.url || raw.site);
  const domain = normalizeDomain(website || raw.domain);
  const city = asString(raw.city || raw.locality || defaults.city);
  const country = asString(raw.country || defaults.country || 'SA') || 'SA';
  const industry = lower(raw.industry || raw.category || defaults.industry);
  const source = asString(raw.source || defaults.source || 'manual') || 'manual';
  const source_url = asString(raw.source_url || raw.maps_url || raw.place_url);
  const address = asString(raw.address || raw.formatted_address);
  const rating = raw.rating != null && Number.isFinite(Number(raw.rating)) ? Number(raw.rating) : null;
  const reviews_count =
    raw.reviews_count != null && Number.isFinite(Number(raw.reviews_count))
      ? Number(raw.reviews_count)
      : raw.user_ratings_total != null && Number.isFinite(Number(raw.user_ratings_total))
        ? Number(raw.user_ratings_total)
        : null;
  const description = asString(raw.description || raw.about);
  const social = {
    instagram: asString(raw.instagram || raw.social?.instagram),
    facebook: asString(raw.facebook || raw.social?.facebook),
    twitter: asString(raw.twitter || raw.social?.twitter),
    linkedin: asString(raw.linkedin || raw.social?.linkedin),
    tiktok: asString(raw.tiktok || raw.social?.tiktok)
  };
  Object.keys(social).forEach((k) => {
    if (!social[k]) delete social[k];
  });

  const confidence = {
    business_name: business_name ? 'verified' : 'missing',
    phone: phone ? (raw.phone_verified ? 'verified' : 'inferred') : 'missing',
    website: website ? 'verified' : 'missing',
    email: email ? 'verified' : 'missing',
    city: city ? (raw.city ? 'verified' : 'inferred') : 'missing',
    industry: industry ? (raw.industry || raw.category ? 'verified' : 'inferred') : 'missing'
  };

  return {
    business_name,
    industry,
    city,
    country,
    website,
    domain,
    phone,
    whatsapp,
    email,
    source,
    source_url,
    address,
    rating,
    reviews_count,
    description,
    social_links: social,
    external_id: asString(raw.external_id || raw.place_id || raw.id),
    place_id: asString(raw.place_id || raw.external_id || raw.id),
    provider: asString(raw.provider || source),
    fetched_at: asString(raw.fetched_at) || null,
    name_key: normalizeNameKey(business_name),
    confidence,
    raw_ref: raw.raw_ref || null
  };
}

/**
 * Deduplicate against existing CRM / research candidates.
 * Match priority: phone → whatsapp → email → domain → name+city
 */
export function findDuplicateMatch(record, existing = []) {
  const rows = Array.isArray(existing) ? existing : [];
  const phone = normalizePhone(record.phone);
  const whatsapp = normalizePhone(record.whatsapp);
  const email = lower(record.email);
  const domain = record.domain || normalizeDomain(record.website);
  const nameKey = record.name_key || normalizeNameKey(record.business_name);
  const city = lower(record.city);
  const placeId = asString(record.place_id || record.external_id);

  for (const row of rows) {
    const rPlace = asString(row.place_id || row.external_id || row.custom_fields?.place_id);
    if (placeId && rPlace && placeId === rPlace) {
      return { matched: true, match_on: 'place_id', existing: row };
    }
    const rPhone = normalizePhone(row.phone || row.whatsapp);
    const rWa = normalizePhone(row.whatsapp || row.phone);
    const rEmail = lower(row.email);
    const rDomain = row.domain || normalizeDomain(row.website);
    const rName = row.name_key || normalizeNameKey(row.business_name || row.company_name || row.name);
    const rCity = lower(row.city);

    if (phone && rPhone && phone === rPhone) {
      return { matched: true, match_on: 'phone', existing: row };
    }
    if (whatsapp && rWa && whatsapp === rWa) {
      return { matched: true, match_on: 'whatsapp', existing: row };
    }
    if (email && rEmail && email === rEmail) {
      return { matched: true, match_on: 'email', existing: row };
    }
    if (domain && rDomain && domain === rDomain) {
      return { matched: true, match_on: 'domain', existing: row };
    }
    if (nameKey && rName && city && rCity && nameKey === rName && city === rCity) {
      return { matched: true, match_on: 'name_city', existing: row };
    }
  }
  return { matched: false, match_on: null, existing: null };
}

/**
 * Merge non-empty fields from discovered record into existing (no overwrite of stronger verified data with empty).
 */
export function mergeCandidateData(existing = {}, incoming = {}) {
  const out = { ...existing };
  const keys = [
    'business_name',
    'industry',
    'city',
    'country',
    'website',
    'domain',
    'phone',
    'whatsapp',
    'email',
    'source',
    'source_url',
    'address',
    'rating',
    'reviews_count',
    'description'
  ];
  for (const k of keys) {
    if (incoming[k] != null && incoming[k] !== '' && (out[k] == null || out[k] === '')) {
      out[k] = incoming[k];
    }
  }
  if (incoming.social_links && typeof incoming.social_links === 'object') {
    out.social_links = { ...(out.social_links || {}), ...incoming.social_links };
  }
  out.updated_from_research = true;
  return out;
}

/**
 * Build research job definition (pure).
 */
export function createResearchJobSpec(input = {}) {
  const query = asString(input.query) || '';
  const city = asString(input.city);
  const industry = lower(input.industry);
  const target_count = Math.min(Math.max(parseInt(input.target_count || input.limit || 20, 10) || 20, 1), 100);
  const source = asString(input.source || 'manual') || 'manual';
  if (!SOURCE_TYPES.includes(source) && source !== 'fixture') {
    /* allow custom source labels */
  }
  const filters = input.filters && typeof input.filters === 'object' ? { ...input.filters } : {};
  if (input.min_rating != null) filters.min_rating = input.min_rating;
  if (input.min_reviews != null) filters.min_reviews = input.min_reviews;
  if (input.latitude != null) filters.latitude = input.latitude;
  if (input.longitude != null) filters.longitude = input.longitude;
  if (input.radius_m != null) filters.radius_m = input.radius_m;

  return {
    id: input.id || null,
    query,
    city,
    industry,
    target_count,
    source,
    filters,
    status: 'draft',
    discovered_count: 0,
    qualified_count: 0,
    created_at: new Date().toISOString(),
    completed_at: null,
    requires_approval: true,
    auto_outreach: false
  };
}

/**
 * Fixture / offline provider — deterministic sample businesses for tests & demos.
 * Not a live scraper.
 */
export function fixtureDiscover(job) {
  const city = job.city || 'المدينة المنورة';
  const industry = job.industry || 'dental_clinic';
  const samples = [
    {
      business_name: `عيادة النور للأسنان — ${city}`,
      industry: 'dental_clinic',
      city,
      phone: '0148211001',
      website: null,
      rating: 4.6,
      reviews_count: 120,
      source: 'fixture',
      description: 'عيادة أسنان بدون موقع احترافي واضح'
    },
    {
      business_name: `مجمع الأمل الطبي — ${city}`,
      industry: 'clinics',
      city,
      phone: '0148211002',
      website: 'https://example-clinic.sa',
      email: 'info@example-clinic.sa',
      rating: 4.2,
      reviews_count: 45,
      source: 'fixture'
    },
    {
      business_name: `عقارات الواحة — ${city}`,
      industry: 'real_estate',
      city,
      phone: '0148211003',
      website: null,
      rating: 4.0,
      reviews_count: 30,
      source: 'fixture',
      description: 'مكتب عقاري بحضور رقمي ضعيف'
    },
    {
      business_name: `مطعم البيت الأصيل — ${city}`,
      industry: 'restaurants',
      city,
      phone: '0148211004',
      website: null,
      rating: 4.7,
      reviews_count: 200,
      source: 'fixture',
      description: 'تقييمات جيدة وحضور رقمي ضعيف'
    },
    {
      business_name: `صالون لمسة — ${city}`,
      industry: 'salons',
      city,
      phone: '0148211005',
      website: 'https://lamsa-salon.example',
      rating: 4.3,
      reviews_count: 80,
      source: 'fixture'
    }
  ];

  let filtered = samples;
  if (industry) {
    const ind = industry.toLowerCase();
    const mapped = samples.filter((s) => String(s.industry).includes(ind) || ind.includes(String(s.industry)));
    if (mapped.length) filtered = mapped;
  }
  // Expand to target_count by suffixing variants (still offline)
  const out = [];
  let i = 0;
  while (out.length < job.target_count) {
    const base = filtered[i % filtered.length];
    const n = Math.floor(i / filtered.length);
    out.push({
      ...base,
      business_name: n === 0 ? base.business_name : `${base.business_name} (${n + 1})`,
      phone: base.phone ? String(Number(base.phone) + n) : null,
      external_id: `fixture-${industry || 'gen'}-${i}`
    });
    i += 1;
    if (i > 500) break;
  }
  return out;
}

/**
 * Manual / CSV import provider — pass through rows only.
 */
export function manualDiscover(job, rows = []) {
  return (Array.isArray(rows) ? rows : []).slice(0, job.target_count || 20);
}

/**
 * Run discovery for a job using provider registry (offline-safe defaults).
 */
export async function discoverBusinesses(job, options = {}) {
  const provider = options.provider || job.source || 'fixture';
  if (typeof options.discoverFn === 'function') {
    return options.discoverFn(job);
  }
  if (provider === 'manual' || provider === 'csv') {
    return manualDiscover(job, options.rows || []);
  }
  if (provider === 'fixture') {
    return fixtureDiscover(job);
  }
  // Registered live providers (google_places, future: hunter, apollo, …)
  try {
    const live = await discoverWithProvider(provider, job, options);
    if (Array.isArray(live)) return live;
  } catch (err) {
    // Surface missing key / API errors to caller (job fails visibly)
    if (err && (err.code === 'missing_api_key' || err.status === 503 || err.status === 400)) throw err;
    if (err && (err.status >= 400 || err.code)) throw err;
    throw err;
  }
  // Unknown source → safe offline fixture (not for google_places if misconfigured)
  if (provider === 'google_places') {
    const err = new Error('Google Places provider unavailable');
    err.code = 'provider_unavailable';
    throw err;
  }
  return fixtureDiscover(job);
}

/**
 * Enrich + score a normalized research candidate.
 */
export async function analyzeResearchCandidate(record, options = {}) {
  const inbox_analysis = {
    intent: 'sales',
    industry: record.industry,
    contact: {
      name: record.business_name,
      phone: record.phone,
      email: record.email
    },
    service_interest: options.service_interest || [],
    qualification: {},
    location: { city: record.city },
    opportunity_score: { score: null }
  };

  const enrichment = await enrichLead({
    inbox_analysis,
    intent: 'sales',
    industry: record.industry,
    phone: record.phone,
    email: record.email,
    company_name: record.business_name,
    city: record.city,
    website: record.website,
    service_interest: options.service_interest || []
  });

  const playbook = buildSalesPlaybookResult({
    inbox_analysis,
    enrichment,
    lead: {
      company_name: record.business_name,
      phone: record.phone,
      industry: record.industry,
      city: record.city,
      website: record.website
    }
  });

  const quality = enrichment.quality || {};
  const score = Number(quality.score ?? enrichment.opportunity_score ?? 0);
  let grade = 'D';
  if (score >= 80) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score >= 45) grade = 'C';

  // Digital presence heuristic (explicit, not invented contacts)
  const digital_weak =
    !record.website ||
    (record.rating != null && record.rating >= 4 && !record.website);

  const reasons = [
    ...(quality.reasons || quality.signals || []),
    digital_weak ? 'weak_digital_presence' : null,
    record.rating != null ? `rating:${record.rating}` : null
  ].filter(Boolean);

  const recommended_services =
    enrichment.services?.primary ||
    playbook.playbook?.primary_services ||
    [];

  return {
    record,
    enrichment,
    playbook,
    opportunity_score: score,
    grade,
    reasons,
    missing_data: quality.missing_data || enrichment.missing_qualification?.missing || [],
    recommended_services,
    next_best_action:
      playbook.action?.action ||
      playbook.sales_action?.action ||
      'qualify',
    vertical: enrichment.vertical?.id || record.industry || 'general',
    requires_approval: true,
    auto_send: false
  };
}

/**
 * Build CRM lead payload from research analysis (no write).
 */
export function buildCrmLeadPayload(analysis, job = {}) {
  const r = analysis.record || {};
  return {
    company_name: r.business_name,
    contact_name: r.business_name,
    phone: r.phone,
    whatsapp: r.whatsapp || r.phone,
    email: r.email,
    website: r.website,
    city: r.city,
    country: r.country || 'SA',
    industry: analysis.vertical || r.industry,
    pipeline_stage: 'new',
    status: 'new',
    opportunity_score: analysis.opportunity_score,
    lead_score: analysis.opportunity_score,
    score_breakdown: {
      grade: analysis.grade,
      reasons: analysis.reasons,
      missing_data: analysis.missing_data,
      source: 'lead_research'
    },
    tags: ['research', job.source || 'research'].filter(Boolean),
    custom_fields: {
      research_source: r.source,
      research_source_url: r.source_url,
      research_job_query: job.query || null,
      rating: r.rating,
      reviews_count: r.reviews_count,
      recommended_services: analysis.recommended_services,
      next_best_action: analysis.next_best_action,
      confidence: r.confidence,
      requires_approval: true
    },
    notes: r.description || null
  };
}

/**
 * Outreach draft only — never sends.
 */
export function buildResearchOutreachDraft(analysis, options = {}) {
  const lang = options.language === 'en' ? 'en' : 'ar';
  const name = analysis.record?.business_name || (lang === 'en' ? 'there' : 'فريقكم');
  const services = (analysis.recommended_services || []).slice(0, 3).join(', ');
  const city = analysis.record?.city || '';

  const text =
    lang === 'en'
      ? `Hello ${name}${city ? ` in ${city}` : ''},\n\nWe help local businesses improve their digital presence${services ? ` (e.g. ${services})` : ''}.\nIf useful, we can share a short tailored proposal.\n\n— Tiqnora`
      : `مرحباً ${name}${city ? ` في ${city}` : ''},\n\nنساعد المنشآت على تحسين حضورها الرقمي${services ? ` (مثل: ${services})` : ''}.\nإن رغبتم، نجهّز عرضًا مختصرًا يناسب احتياجكم.\n\n— Tiqnora`;

  return {
    channel: options.channel || (analysis.record?.whatsapp || analysis.record?.phone ? 'whatsapp' : 'manual'),
    text,
    requires_approval: true,
    auto_send: false,
    status: 'pending_approval',
    purpose: 'research_outreach'
  };
}

/**
 * Full offline job runner.
 */
export async function runResearchJob(jobInput = {}, options = {}) {
  const job = createResearchJobSpec(jobInput);
  job.status = 'running';

  const existing = options.existingCandidates || options.existingLeads || [];
  const rawRows = await discoverBusinesses(job, options);
  const candidates = [];
  let qualified = 0;
  let duplicates = 0;

  for (const raw of rawRows) {
    const record = normalizeBusinessRecord(raw, {
      city: job.city,
      industry: job.industry,
      source: job.source
    });
    if (!record.business_name && !record.phone && !record.website) continue;

    const dup = findDuplicateMatch(record, [...existing, ...candidates.map((c) => c.record)]);
    if (dup.matched) {
      duplicates += 1;
      candidates.push({
        status: 'duplicate',
        match_on: dup.match_on,
        record: mergeCandidateData(dup.existing, record),
        opportunity_score: null,
        grade: null,
        requires_approval: true
      });
      continue;
    }

    const analysis = await analyzeResearchCandidate(record, options);
    const status = analysis.opportunity_score >= 45 ? 'qualified' : 'enriched';
    if (status === 'qualified') qualified += 1;

    candidates.push({
      status,
      record: analysis.record,
      opportunity_score: analysis.opportunity_score,
      grade: analysis.grade,
      reasons: analysis.reasons,
      missing_data: analysis.missing_data,
      recommended_services: analysis.recommended_services,
      next_best_action: analysis.next_best_action,
      vertical: analysis.vertical,
      playbook: analysis.playbook?.playbook || null,
      crm_payload: buildCrmLeadPayload(analysis, job),
      outreach_draft: buildResearchOutreachDraft(analysis, options),
      requires_approval: true,
      auto_send: false
    });
  }

  job.status = 'completed';
  job.discovered_count = candidates.length;
  job.qualified_count = qualified;
  job.duplicate_count = duplicates;
  job.completed_at = new Date().toISOString();

  return {
    job,
    candidates,
    summary: {
      discovered: candidates.length,
      qualified,
      duplicates,
      requires_approval: true,
      auto_outreach: false
    }
  };
}

export default {
  RESEARCH_JOB_STATUSES,
  CANDIDATE_STATUSES,
  normalizeBusinessRecord,
  findDuplicateMatch,
  mergeCandidateData,
  createResearchJobSpec,
  fixtureDiscover,
  manualDiscover,
  discoverBusinesses,
  analyzeResearchCandidate,
  buildCrmLeadPayload,
  buildResearchOutreachDraft,
  runResearchJob
};
