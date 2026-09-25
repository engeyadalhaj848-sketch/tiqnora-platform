/**
 * Official Google Business Profile (My Business) API v4 provider.
 * Reviews: accounts.locations.reviews.list / updateReply
 * OAuth scope: https://www.googleapis.com/auth/business.manage
 * Server-side only. No scraping. No Places API for owned reviews.
 */

const GBP_BASE = 'https://mybusiness.googleapis.com/v4';
const ACCOUNT_MGMT = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/business.manage';
const TIMEOUT_MS = 15000;
const MAX_PAGES = 5;

const STAR_MAP = Object.freeze({
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  STAR_RATING_UNSPECIFIED: null
});

export function isGbpConfigured() {
  return Boolean(
    process.env.GOOGLE_BUSINESS_CLIENT_ID &&
      process.env.GOOGLE_BUSINESS_CLIENT_SECRET &&
      process.env.GOOGLE_BUSINESS_REDIRECT_URI
  );
}

export function getGbpOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_BUSINESS_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_BUSINESS_REDIRECT_URI || '',
    scope: SCOPE,
    authUrl: OAUTH_AUTH,
    tokenUrl: OAUTH_TOKEN
  };
}

export function buildGbpAuthUrl(state) {
  const cfg = getGbpOAuthConfig();
  if (!cfg.clientId || !cfg.redirectUri) {
    const err = new Error('GOOGLE_BUSINESS_* OAuth env not configured');
    err.code = 'not_configured';
    throw err;
  }
  const u = new URL(OAUTH_AUTH);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state || '');
  return u.toString();
}

export async function exchangeGbpCode(code, options = {}) {
  const cfg = getGbpOAuthConfig();
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code'
  });
  const res = await fetchFn(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const err = new Error(data.error_description || data.error || 'GBP token exchange failed');
    err.code = data.error || 'token_exchange_failed';
    err.status = res.status;
    throw err;
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_in: data.expires_in ? Number(data.expires_in) : null,
    scope: data.scope || SCOPE,
    token_type: data.token_type || 'Bearer'
  };
}

export async function refreshGbpToken(refreshToken, options = {}) {
  const cfg = getGbpOAuthConfig();
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const res = await fetchFn(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const err = new Error(data.error_description || data.error || 'GBP token refresh failed');
    err.code = data.error || 'reauthorize_required';
    err.status = res.status || 401;
    throw err;
  }
  return {
    access_token: data.access_token,
    expires_in: data.expires_in ? Number(data.expires_in) : null,
    scope: data.scope || SCOPE
  };
}

async function gbpFetch(url, accessToken, options = {}) {
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.error_description || `GBP HTTP ${res.status}`);
      err.code = data?.error?.status || data?.error || 'gbp_api_error';
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('Google Business Profile request timed out');
      err.code = 'timeout';
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** List accounts the user can manage */
export async function listAccounts(accessToken, options = {}) {
  const data = await gbpFetch(`${ACCOUNT_MGMT}/accounts`, accessToken, options);
  return Array.isArray(data.accounts) ? data.accounts : [];
}

/** List locations under an account (Business Information API) */
export async function listLocations(accessToken, accountName, options = {}) {
  // accountName: accounts/{accountId}
  const parent = String(accountName || '').startsWith('accounts/')
    ? accountName
    : `accounts/${accountName}`;
  const readMask = options.readMask || 'name,title,storefrontAddress,phoneNumbers,websiteUri,metadata';
  const url = `${BUSINESS_INFO}/${parent}/locations?readMask=${encodeURIComponent(readMask)}&pageSize=100`;
  const data = await gbpFetch(url, accessToken, options);
  return Array.isArray(data.locations) ? data.locations : [];
}

export function mapLocationToRecord(loc = {}, accountId = null) {
  const name = loc.name || ''; // locations/{locationId} or accounts/.../locations/...
  const parts = String(name).split('/');
  const external_location_id = parts[parts.length - 1] || name;
  const addr = loc.storefrontAddress || loc.address || {};
  const addressLines = [
    ...(addr.addressLines || []),
    addr.locality,
    addr.administrativeArea,
    addr.postalCode,
    addr.regionCode
  ]
    .filter(Boolean)
    .join(', ');

  return {
    provider: 'google_business_profile',
    external_account_id: accountId,
    external_location_id,
    name,
    title: loc.title || loc.locationName || null,
    address: addressLines || null,
    phone: loc.phoneNumbers?.primaryPhone || loc.primaryPhone || null,
    website: loc.websiteUri || null,
    status: loc.openInfo?.status || loc.metadata?.mapsUri ? 'active' : 'active',
    metadata: {
      resource_name: name,
      place_id: loc.metadata?.placeId || null,
      maps_uri: loc.metadata?.mapsUri || null
    }
  };
}

export function starRatingToNumber(starRating) {
  if (typeof starRating === 'number' && starRating >= 1 && starRating <= 5) return starRating;
  if (starRating == null) return null;
  return STAR_MAP[String(starRating).toUpperCase()] ?? null;
}

export function mapReviewToRecord(review = {}, locationRef = {}) {
  const reviewId = review.reviewId || String(review.name || '').split('/').pop() || null;
  const rating = starRatingToNumber(review.starRating);
  const reply = review.reviewReply || null;
  return {
    provider: 'google_business_profile',
    external_review_id: reviewId,
    location_external_id: locationRef.external_location_id || null,
    rating,
    comment: review.comment || null,
    reviewer_display_name: review.reviewer?.displayName || null,
    created_at_external: review.createTime || null,
    updated_at_external: review.updateTime || null,
    existing_reply: reply?.comment || null,
    existing_reply_updated_at: reply?.updateTime || null,
    reply_status: reply?.comment ? 'answered' : 'unanswered',
    payload_minimal: {
      name: review.name || null,
      starRating: review.starRating || null,
      reviewReplyUrl: review.reviewReplyUrl || null
    },
    resource_name: review.name || null
  };
}

/**
 * List reviews for a location with safe pagination.
 * parent: accounts/{accountId}/locations/{locationId}
 */
export async function listReviews(accessToken, parent, options = {}) {
  const max = Math.min(Math.max(parseInt(options.maxResults || 50, 10) || 50, 1), 200);
  const collected = [];
  let pageToken = null;
  let pages = 0;
  let averageRating = null;
  let totalReviewCount = null;

  while (collected.length < max && pages < MAX_PAGES) {
    const pageSize = Math.min(50, max - collected.length);
    let url = `${GBP_BASE}/${parent}/reviews?pageSize=${pageSize}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const data = await gbpFetch(url, accessToken, options);
    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    if (data.averageRating != null) averageRating = data.averageRating;
    if (data.totalReviewCount != null) totalReviewCount = data.totalReviewCount;
    for (const r of reviews) {
      collected.push(r);
      if (collected.length >= max) break;
    }
    pageToken = data.nextPageToken || null;
    pages += 1;
    if (!pageToken) break;
  }

  return {
    reviews: collected,
    averageRating,
    totalReviewCount,
    pages
  };
}

/**
 * Publish reply — LIVE only when explicitly called with real token.
 * Tests must mock fetchImpl.
 */
export async function updateReviewReply(accessToken, reviewName, comment, options = {}) {
  if (!comment || !String(comment).trim()) {
    const err = new Error('Reply comment required');
    err.code = 'invalid_reply';
    throw err;
  }
  const name = String(reviewName).replace(/\/reply$/, '');
  const url = `${GBP_BASE}/${name}/reply`;
  return gbpFetch(url, accessToken, {
    method: 'PUT',
    body: { comment: String(comment).trim() },
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs
  });
}

export function connectionStatusFromToken(row) {
  if (!isGbpConfigured()) return 'not_configured';
  if (!row) return 'not_connected';
  if (row.status === 'error') return 'error';
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return row.refresh_ciphertext || row.refresh_token ? 'token_expired' : 'needs_reauthorization';
  }
  return 'connected';
}

export default {
  id: 'google_business_profile',
  isConfigured: isGbpConfigured,
  buildGbpAuthUrl,
  exchangeGbpCode,
  refreshGbpToken,
  listAccounts,
  listLocations,
  listReviews,
  updateReviewReply,
  mapLocationToRecord,
  mapReviewToRecord,
  starRatingToNumber,
  connectionStatusFromToken
};
