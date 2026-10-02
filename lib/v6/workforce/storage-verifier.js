/**
 * Storage/provider artifact verification adapters.
 * Never trust caller-provided storage_exists flags alone for production.
 */

import { createHash } from 'node:crypto';

export function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** In-memory fake storage for offline tests */
export function createMemoryStorageAdapter(seed = {}) {
  const objects = { ...seed }; // key: `${bucket}/${path}` -> { body: Buffer|string, size }
  return {
    async head(bucket, path) {
      const o = objects[`${bucket}/${path}`];
      if (!o) return null;
      const body = typeof o.body === 'string' ? Buffer.from(o.body) : o.body;
      return { size: o.size ?? body.length, exists: true };
    },
    async get(bucket, path) {
      const o = objects[`${bucket}/${path}`];
      if (!o) return null;
      const body = typeof o.body === 'string' ? Buffer.from(o.body) : o.body;
      return { body, size: body.length };
    },
    put(bucket, path, body) {
      const buf = typeof body === 'string' ? Buffer.from(body) : body;
      objects[`${bucket}/${path}`] = { body: buf, size: buf.length };
    }
  };
}

/**
 * Verify stored file artifact against adapter.
 */
export async function verifyStoredArtifact({
  storage,
  bucket,
  path,
  expected_sha256 = null
}) {
  if (!storage) return { ok: false, failure_reason: 'storage_adapter_missing' };
  if (!bucket || !path) return { ok: false, failure_reason: 'bucket_path_required' };
  const head = await storage.head(bucket, path);
  if (!head || !head.exists) return { ok: false, failure_reason: 'missing_object' };
  if (!(head.size > 0)) return { ok: false, failure_reason: 'zero_bytes' };
  const obj = await storage.get(bucket, path);
  if (!obj || !obj.body) return { ok: false, failure_reason: 'missing_object' };
  if (!(obj.size > 0)) return { ok: false, failure_reason: 'zero_bytes' };
  const hash = sha256Buffer(obj.body);
  if (expected_sha256 && hash !== expected_sha256) {
    return { ok: false, failure_reason: 'hash_mismatch', actual_sha256: hash };
  }
  return { ok: true, size: obj.size, sha256: hash };
}

/**
 * Provider action verification via adapter contract.
 */
export async function verifyProviderAction({ provider, action, reference_id }) {
  if (!provider) return { ok: false, failure_reason: 'provider_adapter_missing' };
  if (!reference_id) return { ok: false, failure_reason: 'provider_reference_missing' };
  if (typeof provider.verify !== 'function') {
    return { ok: false, failure_reason: 'provider_verify_not_implemented' };
  }
  const result = await provider.verify({ action, reference_id });
  if (!result?.ok) {
    return { ok: false, failure_reason: result?.failure_reason || 'provider_verify_failed' };
  }
  return { ok: true, provider_response: result };
}

export default {
  createMemoryStorageAdapter,
  verifyStoredArtifact,
  verifyProviderAction,
  sha256Buffer
};
