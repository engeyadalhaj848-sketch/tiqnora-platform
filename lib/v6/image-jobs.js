/**
 * image_jobs persistence — service-role only. Never store secrets or base64 blobs.
 */

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

async function rest(path, options = {}) {
  const key = serviceKey();
  if (!key) return null;
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.headers?.Prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.message || data?.hint || `image_jobs ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

export async function insertImageJob(row = {}) {
  if (!serviceKey()) return null;
  const payload = {
    image_job_id: row.image_job_id,
    organization_id: row.organization_id || null,
    agent_id: row.agent_id || 'image-designer',
    campaign_name: row.campaign_name || null,
    platform: row.platform || null,
    format_key: row.format_key || null,
    width: row.width || null,
    height: row.height || null,
    provider: row.provider || null,
    model: row.model || null,
    prompt_version: row.prompt_version || null,
    generation_status: row.generation_status || 'pending',
    output_url: row.output_url || null,
    output_storage_path: row.output_storage_path || null,
    telegram_message_id: row.telegram_message_id || null,
    telegram_chat_id: row.telegram_chat_id || null,
    approval_status: row.approval_status || 'pending_approval',
    revision_count: row.revision_count || 0,
    quality_gate: row.quality_gate || {},
    art_direction: row.art_direction
      ? {
          prompt_version: row.art_direction.prompt_version,
          vertical: row.art_direction.vertical,
          format: row.art_direction.format,
          overlay: row.art_direction.overlay
        }
      : {},
    error_message: row.error_message || null,
    error_code: row.error_code || null,
    metadata: row.metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  try {
    const rows = await rest('image_jobs', { method: 'POST', body: JSON.stringify(payload) });
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function updateImageJob(imageJobId, patch = {}) {
  if (!serviceKey() || !imageJobId) return null;
  const body = { ...patch, updated_at: new Date().toISOString() };
  delete body.api_key;
  delete body.token;
  delete body.output_b64;
  try {
    const rows = await rest(`image_jobs?image_job_id=eq.${encodeURIComponent(imageJobId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body)
    });
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function uploadDesignAsset({ imageJobId, bytes, mime = 'image/png' }) {
  const key = serviceKey();
  if (!key || !bytes) return { ok: false, reason: 'not_configured' };
  const path = `designs/${imageJobId}.${mime.includes('jpeg') ? 'jpg' : 'png'}`;
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/designs/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': mime,
      'x-upsert': 'true'
    },
    body: bytes
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    return { ok: false, reason: 'upload_failed', status: response.status, detail: String(errText).slice(0, 200) };
  }
  const publicUrl = `${supabaseUrl()}/storage/v1/object/public/designs/${path}`;
  return { ok: true, output_storage_path: path, output_url: publicUrl };
}

export default { insertImageJob, updateImageJob, uploadDesignAsset };
