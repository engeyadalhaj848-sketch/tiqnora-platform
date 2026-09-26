/**
 * Tiqnora — Apify REST integration (server-side only)
 * Secrets: APIFY_TOKEN from process.env only. Never log / return in API / client.
 * Official API: https://docs.apify.com/api/v2
 * MCP (future): https://mcp.apify.com — status: available_not_enabled
 */

const APIFY_BASE = 'https://api.apify.com/v2';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_MS = 2_500;
const MAX_POLL_ATTEMPTS = 48;
export const DEFAULT_MAX_RESULTS = 10;
export const HARD_CAP_RESULTS = 50;

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

export function isApifyConfigured() {
  return Boolean(env('APIFY_TOKEN'));
}

export function getApifyToken() {
  return env('APIFY_TOKEN');
}

export function clampMaxResults(n, { hardCap = HARD_CAP_RESULTS, defaultValue = DEFAULT_MAX_RESULTS } = {}) {
  const parsed = parseInt(n, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, hardCap);
}

export function classifyApifyError(err = {}, resStatus = null) {
  const status = resStatus ?? err.status ?? err.statusCode ?? null;
  const msg = String(err.message || err.error || '').toLowerCase();
  if (status === 401 || status === 403 || msg.includes('unauthorized') || msg.includes('token')) {
    return { code: 'auth_error', retryable: false, status: status || 401 };
  }
  if (status === 429 || msg.includes('rate') || msg.includes('quota')) {
    return { code: 'rate_limited', retryable: true, status: 429 };
  }
  if (status === 404 || msg.includes('not found')) {
    return { code: 'not_found', retryable: false, status: 404 };
  }
  if (err.name === 'AbortError' || msg.includes('timeout') || status === 504) {
    return { code: 'timeout', retryable: true, status: 504 };
  }
  if (status >= 500 || msg.includes('network') || msg.includes('fetch')) {
    return { code: 'upstream_error', retryable: true, status: status || 502 };
  }
  return { code: 'apify_error', retryable: false, status: status || 500 };
}

async function apifyFetch(path, { method = 'GET', body = null, query = {}, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const token = getApifyToken();
  if (!token) {
    const err = new Error('APIFY_TOKEN is not configured');
    err.code = 'not_configured';
    err.status = 503;
    throw err;
  }
  const qs = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  if (!qs.has('token')) qs.set('token', token);
  const url = `${APIFY_BASE}${path}${qs.toString() ? `?${qs}` : ''}`;
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    const err = new Error('fetch is not available');
    err.code = 'no_fetch';
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts = {
      method,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: controller.signal
    };
    if (body != null && method !== 'GET' && method !== 'HEAD') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetchFn(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const classified = classifyApifyError({ message: data?.error?.message || data?.message || res.statusText }, res.status);
      const err = new Error(data?.error?.message || data?.message || `Apify HTTP ${res.status}`);
      err.code = classified.code;
      err.status = classified.status;
      err.retryable = classified.retryable;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.code) throw e;
    const classified = classifyApifyError(e);
    const err = new Error(e.message || 'Apify request failed');
    err.code = classified.code;
    err.status = classified.status;
    err.retryable = classified.retryable;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(options = {}) {
  if (!isApifyConfigured()) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'apify',
      message: 'Missing env: APIFY_TOKEN',
      mcp_status: 'available_not_enabled',
      live_api: false
    };
  }
  try {
    const data = await apifyFetch('/users/me', {
      timeoutMs: options.timeoutMs || 12_000,
      fetchImpl: options.fetchImpl
    });
    const user = data?.data || data || {};
    return {
      ok: true,
      status: 'connected',
      provider: 'apify',
      message: 'Apify account reachable',
      username: user.username || user.id || null,
      mcp_status: 'available_not_enabled',
      live_api: true
    };
  } catch (e) {
    return {
      ok: false,
      status: e.code === 'not_configured' ? 'not_configured' : 'error',
      provider: 'apify',
      message: e.message || 'Apify connection failed',
      code: e.code || 'apify_error',
      mcp_status: 'available_not_enabled',
      live_api: true
    };
  }
}

export async function runActor(actorId, input = {}, options = {}) {
  const id = String(actorId || '').trim();
  if (!id) {
    const err = new Error('actorId is required');
    err.code = 'invalid_actor';
    err.status = 400;
    throw err;
  }
  const safeInput = { ...input };
  for (const key of ['maxCrawledPlaces', 'maxResults', 'maxItems', 'maxCrawledPlacesPerSearch']) {
    if (safeInput[key] != null) {
      safeInput[key] = clampMaxResults(safeInput[key], {
        hardCap: options.hardCap || HARD_CAP_RESULTS,
        defaultValue: options.defaultMax || DEFAULT_MAX_RESULTS
      });
    }
  }
  const encoded = encodeURIComponent(id.replace('/', '~'));
  const data = await apifyFetch(`/acts/${encoded}/runs`, {
    method: 'POST',
    body: safeInput,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    fetchImpl: options.fetchImpl
  });
  const run = data?.data || data || {};
  return {
    ok: true,
    run_id: run.id || null,
    actor_id: id,
    status: run.status || 'READY',
    default_dataset_id: run.defaultDatasetId || null,
    started_at: run.startedAt || new Date().toISOString(),
    usage: run.usage || null
  };
}

export async function getRun(runId, options = {}) {
  const id = String(runId || '').trim();
  if (!id) {
    const err = new Error('runId is required');
    err.code = 'invalid_run';
    err.status = 400;
    throw err;
  }
  const data = await apifyFetch(`/actor-runs/${encodeURIComponent(id)}`, {
    timeoutMs: options.timeoutMs || 15_000,
    fetchImpl: options.fetchImpl
  });
  const run = data?.data || data || {};
  return {
    ok: true,
    run_id: run.id || id,
    status: run.status || 'UNKNOWN',
    default_dataset_id: run.defaultDatasetId || null,
    started_at: run.startedAt || null,
    finished_at: run.finishedAt || null,
    usage: run.usage || null,
    stats: run.stats || null,
    meta: { actor_id: run.actId || run.actorId || null }
  };
}

export async function waitForRun(runId, options = {}) {
  const maxAttempts = options.maxAttempts || MAX_POLL_ATTEMPTS;
  const pollMs = options.pollMs || DEFAULT_POLL_MS;
  let last = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    last = await getRun(runId, options);
    const st = String(last.status || '').toUpperCase();
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(st)) return last;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  const err = new Error('Apify run poll timeout');
  err.code = 'timeout';
  err.status = 504;
  err.last = last;
  throw err;
}

export async function getDatasetItems(datasetId, options = {}) {
  const id = String(datasetId || '').trim();
  if (!id) {
    const err = new Error('datasetId is required');
    err.code = 'invalid_dataset';
    err.status = 400;
    throw err;
  }
  const limit = clampMaxResults(options.limit ?? options.maxItems ?? DEFAULT_MAX_RESULTS, {
    hardCap: options.hardCap || HARD_CAP_RESULTS,
    defaultValue: DEFAULT_MAX_RESULTS
  });
  const offset = Math.max(0, parseInt(options.offset || 0, 10) || 0);
  const data = await apifyFetch(`/datasets/${encodeURIComponent(id)}/items`, {
    query: { format: 'json', clean: options.clean === false ? undefined : 1, limit, offset },
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    fetchImpl: options.fetchImpl
  });
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.items)
        ? data.items
        : [];
  return { ok: true, dataset_id: id, items: items.slice(0, limit), count: Math.min(items.length, limit), limit, offset };
}

export function normalizeApifyPlaceItem(item = {}, meta = {}) {
  if (!item || typeof item !== 'object') return null;
  const title = item.title || item.name || item.businessName || item.displayName || item.placeName || null;
  const phone = item.phone || item.phoneUnformatted || item.phoneNumber || item.telephone || item.nationalPhoneNumber || null;
  const website = item.website || item.websiteUrl || item.url || item.site || null;
  const address =
    item.address ||
    item.formattedAddress ||
    item.street ||
    [item.street, item.city, item.state, item.postalCode].filter(Boolean).join(', ') ||
    null;
  const placeId = item.placeId || item.place_id || item.googlePlaceId || item.cid || item.id || null;
  const mapsUrl =
    item.url ||
    item.googleMapsUrl ||
    item.mapsUrl ||
    item.googleMapsUri ||
    (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null);
  const category =
    item.categoryName ||
    item.category ||
    (Array.isArray(item.categories) ? item.categories[0] : null) ||
    item.type ||
    null;
  const city = item.city || meta.city || null;
  const rating = item.totalScore != null ? Number(item.totalScore) : item.rating != null ? Number(item.rating) : null;
  const reviews =
    item.reviewsCount != null
      ? Number(item.reviewsCount)
      : item.user_ratings_total != null
        ? Number(item.user_ratings_total)
        : item.reviews_count != null
          ? Number(item.reviews_count)
          : null;
  const social = {};
  if (item.instagrams || item.instagram) social.instagram = item.instagrams?.[0] || item.instagram;
  if (item.facebooks || item.facebook) social.facebook = item.facebooks?.[0] || item.facebook;
  if (item.twitters || item.twitter) social.twitter = item.twitters?.[0] || item.twitter;
  return {
    business_name: title,
    name: title,
    category,
    industry: category,
    city,
    country: item.countryCode || item.country || meta.country || 'SA',
    address,
    website,
    phone,
    email: item.email || item.emails?.[0] || null,
    social_links: social,
    source: 'apify',
    source_url: mapsUrl,
    google_maps_url: mapsUrl,
    place_id: placeId ? String(placeId) : null,
    external_id: placeId ? String(placeId) : null,
    rating: Number.isFinite(rating) ? rating : null,
    reviews_count: Number.isFinite(reviews) ? reviews : null,
    description: item.description || item.about || null,
    provider: 'apify_maps',
    source_actor: meta.actor_id || null,
    source_run_id: meta.run_id || null,
    collected_at: meta.collected_at || new Date().toISOString(),
    fetched_at: meta.collected_at || new Date().toISOString(),
    raw_ref: { place_id: placeId, apify_run_id: meta.run_id || null }
  };
}

export function buildGoogleMapsInput({ keyword, city, maxResults, language = 'ar', countryCode = 'sa' } = {}) {
  const max = clampMaxResults(maxResults, { defaultValue: DEFAULT_MAX_RESULTS, hardCap: HARD_CAP_RESULTS });
  const searchStringsArray = [];
  const q = String(keyword || '').trim();
  const c = String(city || '').trim();
  if (q && c) searchStringsArray.push(`${q} ${c}`);
  else if (q) searchStringsArray.push(q);
  else if (c) searchStringsArray.push(c);
  else searchStringsArray.push('business');
  return {
    searchStringsArray,
    maxCrawledPlacesPerSearch: max,
    language,
    maxImages: 0,
    maxReviews: 0,
    maximumLeadsEnrichmentRecords: 0,
    countryCode: countryCode || 'sa',
    skipClosedPlaces: true
  };
}

export async function runGoogleMapsLeadCollection(params = {}, options = {}) {
  const actorId = options.actorId || process.env.APIFY_GOOGLE_MAPS_ACTOR || 'compass/crawler-google-places';
  const maxResults = clampMaxResults(params.maxResults ?? params.limit ?? DEFAULT_MAX_RESULTS);
  const input =
    options.input ||
    buildGoogleMapsInput({
      keyword: params.keyword || params.query,
      city: params.city,
      maxResults,
      language: params.language || 'ar',
      countryCode: params.countryCode || 'sa'
    });
  const started = await runActor(actorId, input, {
    ...options,
    hardCap: HARD_CAP_RESULTS,
    defaultMax: DEFAULT_MAX_RESULTS
  });
  const finished = options.skipWait ? started : await waitForRun(started.run_id, options);
  const st = String(finished.status || '').toUpperCase();
  if (st !== 'SUCCEEDED' && !options.acceptPartial) {
    return {
      ok: false,
      status: finished.status,
      run_id: finished.run_id || started.run_id,
      actor_id: actorId,
      items: [],
      message: `Actor finished with status ${finished.status}`,
      usage: finished.usage || null
    };
  }
  const datasetId = finished.default_dataset_id || started.default_dataset_id;
  if (!datasetId) {
    return {
      ok: false,
      status: finished.status || 'UNKNOWN',
      run_id: finished.run_id || started.run_id,
      actor_id: actorId,
      items: [],
      message: 'No default dataset on run',
      usage: finished.usage || null
    };
  }
  const ds = await getDatasetItems(datasetId, {
    limit: maxResults,
    hardCap: HARD_CAP_RESULTS,
    fetchImpl: options.fetchImpl
  });
  const meta = {
    actor_id: actorId,
    run_id: finished.run_id || started.run_id,
    city: params.city,
    country: 'SA',
    collected_at: new Date().toISOString()
  };
  const normalized = (ds.items || []).map((row) => normalizeApifyPlaceItem(row, meta)).filter(Boolean).slice(0, maxResults);
  return {
    ok: true,
    status: finished.status || 'SUCCEEDED',
    run_id: meta.run_id,
    actor_id: actorId,
    dataset_id: datasetId,
    items: normalized,
    items_count: normalized.length,
    raw_count: ds.count,
    usage: finished.usage || null,
    started_at: started.started_at,
    completed_at: finished.finished_at || new Date().toISOString(),
    max_results: maxResults
  };
}

export default {
  isApifyConfigured,
  testConnection,
  runActor,
  getRun,
  waitForRun,
  getDatasetItems,
  normalizeApifyPlaceItem,
  buildGoogleMapsInput,
  runGoogleMapsLeadCollection,
  clampMaxResults,
  classifyApifyError,
  DEFAULT_MAX_RESULTS,
  HARD_CAP_RESULTS
};
