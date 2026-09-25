/**
 * Research provider registry — extensible multi-source discovery.
 */

import googlePlaces from './providers/google-places.js';

const providers = new Map();

export function registerProvider(id, provider) {
  if (!id || !provider || typeof provider.discover !== 'function') {
    throw new Error('Invalid research provider');
  }
  providers.set(String(id), provider);
}

export function getProvider(id) {
  return providers.get(String(id || '')) || null;
}

export function listProviders() {
  return [...providers.keys()];
}

// Built-ins
registerProvider('google_places', googlePlaces);

export async function discoverWithProvider(source, job, options = {}) {
  const id = String(source || options.provider || 'fixture');
  const provider = getProvider(id);
  if (provider) {
    return provider.discover(job, options);
  }
  return null; // caller falls back to fixture/manual
}

export default {
  registerProvider,
  getProvider,
  listProviders,
  discoverWithProvider
};
