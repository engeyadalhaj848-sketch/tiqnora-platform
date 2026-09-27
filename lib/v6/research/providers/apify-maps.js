/**
 * Apify Google Maps provider for Lead Research registry.
 * Server-side only. Uses APIFY_TOKEN via lib/integrations/apify.js.
 */

import {
  isApifyConfigured,
  runGoogleMapsLeadCollection,
  clampMaxResults,
  DEFAULT_MAX_RESULTS
} from '../../../integrations/apify.js';

export function isApifyMapsConfigured() {
  return isApifyConfigured();
}

export async function discover(job = {}, options = {}) {
  if (!isApifyMapsConfigured() && !options.fetchImpl && !options.mockItems) {
    const err = new Error('APIFY_TOKEN is not configured');
    err.code = 'missing_api_key';
    err.status = 503;
    throw err;
  }
  if (Array.isArray(options.mockItems)) {
    return options.mockItems.slice(0, clampMaxResults(job.target_count || DEFAULT_MAX_RESULTS));
  }
  const maxResults = clampMaxResults(job.target_count || job.limit || DEFAULT_MAX_RESULTS);
  const result = await runGoogleMapsLeadCollection(
    {
      keyword: job.query || job.industry || 'business',
      city: job.city,
      maxResults,
      language: job.language || 'ar',
      countryCode: job.region_code || job.country_code || 'sa'
    },
    {
      actorId: options.actorId || job.filters?.actor_id,
      fetchImpl: options.fetchImpl,
      skipWait: options.skipWait === true,
      hardCap: 50
    }
  );
  if (!result.ok) {
    const err = new Error(result.message || `Apify Maps actor status: ${result.status}`);
    err.code = 'apify_run_failed';
    err.status = 502;
    err.run_id = result.run_id;
    throw err;
  }
  return result.items || [];
}

export default {
  id: 'apify_maps',
  isConfigured: isApifyMapsConfigured,
  discover
};
