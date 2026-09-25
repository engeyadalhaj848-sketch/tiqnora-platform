/**
 * Official Google Places API (New) provider for Lead Research.
 * Server-side only. Uses GOOGLE_PLACES_API_KEY.
 * No scraping.
 */

import { buildLocationBias, resolveCityLocation } from '../location-resolver.js';

const PLACES_BASE = 'https://places.googleapis.com/v1';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_PAGES = 3;
const MAX_TARGET = 40;
const PAGE_SIZE = 20;

const TEXT_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.businessStatus',
  'places.googleMapsUri',
  'nextPageToken'
].join(',');

const NEARBY_FIELD_MASK = TEXT_FIELD_MASK;

function getApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
}

export function isGooglePlacesConfigured() {
  return Boolean(getApiKey());
}

export function buildTextSearchQuery(job = {}) {
  const parts = [];
  if (job.query) parts.push(String(job.query).trim());
  else if (job.industry) parts.push(String(job.industry).trim());
  if (job.city) parts.push(`في ${String(job.city).trim()}`);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Map Places API (New) place object → raw research row for normalizeBusinessRecord.
 */
export function mapPlaceToRaw(place = {}, meta = {}) {
  const displayName =
    typeof place.displayName === 'object'
      ? place.displayName?.text
      : place.displayName;
  const phone =
    place.nationalPhoneNumber ||
    place.internationalPhoneNumber ||
    null;
  const id = place.id || place.name || null;
  // Places API New uses "places/ChIJ..." — strip prefix for external_id
  const placeId = id ? String(id).replace(/^places\//, '') : null;

  return {
    external_id: placeId,
    place_id: placeId,
    business_name: displayName || null,
    name: displayName || null,
    address: place.formattedAddress || null,
    formatted_address: place.formattedAddress || null,
    industry: place.primaryType || (Array.isArray(place.types) ? place.types[0] : null),
    category: place.primaryType || null,
    types: place.types || [],
    website: place.websiteUri || null,
    phone,
    international_phone: place.internationalPhoneNumber || null,
    rating: place.rating != null ? Number(place.rating) : null,
    reviews_count:
      place.userRatingCount != null ? Number(place.userRatingCount) : null,
    source: 'google_places',
    source_url: place.googleMapsUri || null,
    google_maps_uri: place.googleMapsUri || null,
    business_status: place.businessStatus || null,
    location: place.location || null,
    city: meta.city || null,
    country: meta.country || 'SA',
    provider: 'google_places',
    fetched_at: meta.fetched_at || new Date().toISOString(),
    raw_ref: { place_id: placeId }
  };
}

function applyClientFilters(rows, job = {}) {
  let out = Array.isArray(rows) ? [...rows] : [];
  const minRating = job.filters?.min_rating != null ? Number(job.filters.min_rating) : (job.min_rating != null ? Number(job.min_rating) : null);
  const minReviews = job.filters?.min_reviews != null ? Number(job.filters.min_reviews) : (job.min_reviews != null ? Number(job.min_reviews) : null);

  if (minRating != null && Number.isFinite(minRating)) {
    out = out.filter((r) => r.rating == null || Number(r.rating) >= minRating);
  }
  if (minReviews != null && Number.isFinite(minReviews)) {
    out = out.filter((r) => r.reviews_count == null || Number(r.reviews_count) >= minReviews);
  }
  // Prefer city mention in address when city known (soft filter)
  if (job.city) {
    const city = String(job.city).trim();
    const cityHits = out.filter((r) => r.address && String(r.address).includes(city));
    if (cityHits.length) out = cityHits.concat(out.filter((r) => !cityHits.includes(r)));
  }
  return out;
}

async function placesFetch(path, { method = 'POST', body, fieldMask, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const key = getApiKey();
  if (!key) {
    const err = new Error('GOOGLE_PLACES_API_KEY is not configured');
    err.code = 'missing_api_key';
    err.status = 503;
    throw err;
  }
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    const err = new Error('fetch is not available');
    err.code = 'no_fetch';
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${PLACES_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask || TEXT_FIELD_MASK
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Google Places HTTP ${res.status}`);
      err.code = data?.error?.status || 'google_places_error';
      err.status = res.status;
      // never attach api key
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('Google Places request timed out');
      err.code = 'timeout';
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Text Search (New) with safe pagination up to target_count.
 */
export async function textSearchPlaces(job = {}, options = {}) {
  const target = Math.min(Math.max(parseInt(job.target_count || 20, 10) || 20, 1), MAX_TARGET);
  const textQuery = buildTextSearchQuery(job);
  if (!textQuery) {
    const err = new Error('Search query is required');
    err.code = 'invalid_query';
    err.status = 400;
    throw err;
  }

  const locationBias = buildLocationBias(job.city, {
    latitude: job.latitude ?? job.filters?.latitude,
    longitude: job.longitude ?? job.filters?.longitude,
    radius_m: job.radius_m ?? job.filters?.radius_m
  });

  const collected = [];
  let pageToken = null;
  let pages = 0;
  const fetched_at = new Date().toISOString();

  while (collected.length < target && pages < MAX_PAGES) {
    const body = {
      textQuery,
      languageCode: job.language || 'ar',
      pageSize: Math.min(PAGE_SIZE, target - collected.length)
    };
    if (locationBias) body.locationBias = locationBias;
    if (pageToken) body.pageToken = pageToken;
    // regionCode soft preference for SA
    body.regionCode = job.region_code || 'SA';

    const data = await placesFetch('/places:searchText', {
      body,
      fieldMask: TEXT_FIELD_MASK,
      timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      fetchImpl: options.fetchImpl
    });

    const places = Array.isArray(data.places) ? data.places : [];
    if (!places.length) break;

    for (const place of places) {
      collected.push(mapPlaceToRaw(place, { city: job.city, country: 'SA', fetched_at }));
      if (collected.length >= target) break;
    }

    pageToken = data.nextPageToken || null;
    pages += 1;
    if (!pageToken) break;
  }

  return applyClientFilters(collected, job).slice(0, target);
}

/**
 * Nearby Search (New) when lat/lng provided.
 */
export async function nearbySearchPlaces(job = {}, options = {}) {
  const lat = job.latitude ?? job.filters?.latitude;
  const lng = job.longitude ?? job.filters?.longitude;
  if (lat == null || lng == null) {
    // fall back to text search with city bias
    return textSearchPlaces(job, options);
  }
  const target = Math.min(Math.max(parseInt(job.target_count || 20, 10) || 20, 1), MAX_TARGET);
  const radius = Number(job.radius_m ?? job.filters?.radius_m ?? 5000);
  const body = {
    maxResultCount: Math.min(target, 20),
    languageCode: job.language || 'ar',
    regionCode: job.region_code || 'SA',
    locationRestriction: {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: Math.min(Math.max(radius, 100), 50000)
      }
    }
  };
  if (job.included_type || job.type) {
    body.includedTypes = [String(job.included_type || job.type)];
  }

  const data = await placesFetch('/places:searchNearby', {
    body,
    fieldMask: NEARBY_FIELD_MASK,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    fetchImpl: options.fetchImpl
  });
  const places = Array.isArray(data.places) ? data.places : [];
  const fetched_at = new Date().toISOString();
  const rows = places.map((p) => mapPlaceToRaw(p, { city: job.city, country: 'SA', fetched_at }));
  return applyClientFilters(rows, job).slice(0, target);
}

/**
 * Optional Place Details — only when explicitly requested (cost control).
 */
export async function getPlaceDetails(placeId, options = {}) {
  const id = String(placeId || '').replace(/^places\//, '');
  if (!id) {
    const err = new Error('place_id required');
    err.code = 'invalid_place_id';
    throw err;
  }
  const fieldMask = options.fieldMask || [
    'id',
    'displayName',
    'formattedAddress',
    'location',
    'primaryType',
    'types',
    'rating',
    'userRatingCount',
    'websiteUri',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'businessStatus',
    'googleMapsUri'
  ].join(',');

  const data = await placesFetch(`/places/${encodeURIComponent(id)}`, {
    method: 'GET',
    fieldMask,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    fetchImpl: options.fetchImpl
  });
  return mapPlaceToRaw(data, { fetched_at: new Date().toISOString() });
}

/**
 * Provider entry used by registry / discoverBusinesses.
 */
export async function discover(job = {}, options = {}) {
  if (!isGooglePlacesConfigured() && !options.fetchImpl) {
    const err = new Error('GOOGLE_PLACES_API_KEY is not configured');
    err.code = 'missing_api_key';
    err.status = 503;
    throw err;
  }
  const hasCoords =
    (job.latitude != null && job.longitude != null) ||
    (job.filters?.latitude != null && job.filters?.longitude != null);

  if (hasCoords && (job.search_mode === 'nearby' || job.filters?.search_mode === 'nearby')) {
    return nearbySearchPlaces(job, options);
  }
  return textSearchPlaces(job, options);
}

export default {
  id: 'google_places',
  isConfigured: isGooglePlacesConfigured,
  discover,
  textSearchPlaces,
  nearbySearchPlaces,
  getPlaceDetails,
  mapPlaceToRaw,
  buildTextSearchQuery
};
