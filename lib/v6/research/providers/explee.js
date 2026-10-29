/**
 * Explee B2B company search adapter for Tiqnora's existing Lead Research engine.
 * Search only. NEVER start Explee AutoGTM campaigns or send outreach here.
 * Explicit opt-in prevents unplanned provider charges.
 * API contract: https://api.explee.com/public/api/openapi.json
 */
const ENDPOINT = 'https://api.explee.com/public/api/v1/search/companies';
const MAX_RESULTS = 10; // Conservative preview limit; Explee billing conditions may change.
const TIMEOUT_MS = 18000;

export function isExpleeConfigured() {
  return Boolean(process.env.EXPLEE_API_KEY) &&
    process.env.EXPLEE_LEAD_RESEARCH_ENABLED === 'true';
}

export function buildExpleePayload(job = {}) {
  const definition = String(job.query || job.industry || '').trim();
  if (!definition) {
    const error = new Error('Explee research requires a query or industry.');
    error.code = 'invalid_query';
    error.status = 400;
    throw error;
  }
  const requested = Number.parseInt(job.target_count || job.limit || 10, 10);
  const page_size = Math.min(MAX_RESULTS, Math.max(1, Number.isFinite(requested) ? requested : 10));
  const country = String(job.country_code || job.country || 'SA').trim().toUpperCase();
  const filters = { definition, geo_include: [country] };
  if (job.city && String(job.city).trim()) filters.geo_city = [String(job.city).trim()];
  return { filters, page: 1, page_size };
}

function firstString(value) {
  if (Array.isArray(value)) return value.find((x) => typeof x === 'string' && x.trim()) || null;
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Preserve provider provenance, never invent phone/email/WhatsApp consent. */
export function mapExpleeCompany(company = {}) {
  const domain = firstString(company.domain);
  const website = firstString(company.url) || (domain ? 'https://' + domain : null);
  return {
    business_name: firstString(company.name),
    industry: firstString(company.industry),
    city: firstString(company.geo_city),
    country: firstString(company.geo) || 'SA',
    website,
    domain,
    phone: firstString(company.phones),
    email: firstString(company.emails),
    description: firstString(company.description) || firstString(company.description_website),
    linkedin: company.linkedin_id ? 'https://www.linkedin.com/company/' + encodeURIComponent(String(company.linkedin_id)) : null,
    source_url: website,
    source: 'explee',
    provider: 'explee',
    external_id: company.linkedin_id ? 'explee-linkedin-' + String(company.linkedin_id) : null,
    fetched_at: new Date().toISOString(),
    raw_ref: { provider: 'explee', linkedin_id: company.linkedin_id || null }
  };
}

export async function discover(job = {}, options = {}) {
  if (Array.isArray(options.mockCompanies)) {
    return options.mockCompanies.slice(0, buildExpleePayload(job).page_size).map(mapExpleeCompany);
  }
  if (!isExpleeConfigured()) {
    const error = new Error('Explee lead research is disabled or EXPLEE_API_KEY is missing.');
    error.code = 'missing_api_key';
    error.status = 503;
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(Number(options.timeoutMs) || TIMEOUT_MS, 1000), 30000));
  try {
    const response = await (options.fetchImpl || globalThis.fetch)(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.EXPLEE_API_KEY
      },
      body: JSON.stringify(buildExpleePayload(job)),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Do not surface upstream error body: it may contain sensitive metadata.
      const error = new Error('Explee company search failed (HTTP ' + response.status + ').');
      error.status = response.status;
      error.code = response.status === 402 ? 'provider_credits_required' :
        response.status === 429 ? 'provider_rate_limited' : 'provider_error';
      throw error;
    }
    if (!Array.isArray(data.companies)) {
      const error = new Error('Unexpected Explee company response.');
      error.code = 'provider_invalid_response';
      error.status = 502;
      throw error;
    }
    return data.companies.slice(0, buildExpleePayload(job).page_size).map(mapExpleeCompany);
  } catch (err) {
    if (err?.name === 'AbortError') {
      const error = new Error('Explee company search timed out.');
      error.code = 'provider_timeout';
      error.status = 504;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export default { id: 'explee', isConfigured: isExpleeConfigured, discover };
