/**
 * Explee + Tiqnora native Google Places/Apify company discovery.
 * The existing Lead Research engine handles deduplication, scoring and CRM drafts.
 * No provider is allowed to send mail or WhatsApp from this module.
 */
import explee from './explee.js';
import googlePlaces from './google-places.js';
import apifyMaps from './apify-maps.js';

export function availableHybridSources(options = {}) {
  const sources = [];
  if (Array.isArray(options.mockCompanies) || explee.isConfigured()) sources.push('explee');
  if (Array.isArray(options.mockNativeRows)) sources.push('native');
  else if (googlePlaces.isConfigured()) sources.push('google_places');
  else if (apifyMaps.isConfigured()) sources.push('apify_maps');
  return sources;
}

export async function discover(job = {}, options = {}) {
  const sources = availableHybridSources(options);
  if (!sources.length) {
    const error = new Error('No hybrid lead source configured (Explee or native Google Places/Apify).');
    error.code = 'missing_api_key';
    error.status = 503;
    throw error;
  }
  const rows = [];
  const errors = [];
  const selected = new Set(Array.isArray(options.sources) ? options.sources : sources);
  // Each source is optional and individually toggled by its credentials.
  for (const source of sources) {
    if (!selected.has(source) && !(source === 'native' && selected.has('google_places'))) continue;
    try {
      const result = source === 'explee'
        ? await explee.discover(job, options)
        : source === 'native'
          ? options.mockNativeRows
          : source === 'google_places'
            ? await googlePlaces.discover(job, options)
            : await apifyMaps.discover(job, options);
      if (Array.isArray(result)) rows.push(...result);
    } catch (error) {
      errors.push({ source, code: error?.code || 'provider_error', status: error?.status || 502 });
      // Other sources should still work if one API is unavailable.
    }
  }
  if (!rows.length && errors.length) {
    const error = new Error('All configured hybrid lead sources failed.');
    error.code = 'hybrid_sources_failed';
    error.status = 502;
    error.sources = errors;
    throw error;
  }
  // Provenance on each row is preserved. Existing research runner deduplicates.
  return rows;
}

export default { id: 'hybrid', isConfigured: () => availableHybridSources().length > 0, discover };
