/**
 * Video Designer persistence and private MP4 storage.
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
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.hint || `video_jobs ${response.status}`), { status: response.status });
  return data;
}

export async function insertVideoJob(row = {}) {
  if (!serviceKey()) return null;
  const payload = {
    video_job_id: row.video_job_id,
    organization_id: row.organization_id || null,
    agent_id: row.agent_id || 'video-designer',
    campaign_name: row.campaign_name || null,
    provider: row.provider || null,
    model: row.model || null,
    operation_name: row.operation_name || null,
    generation_status: row.generation_status || 'pending',
    aspect_ratio: row.aspect_ratio || '9:16',
    resolution: row.resolution || '720p',
    duration_seconds: Number(row.duration_seconds || 8),
    output_url: row.output_url || null,
    output_storage_path: row.output_storage_path || null,
    telegram_message_id: row.telegram_message_id || null,
    telegram_chat_id: row.telegram_chat_id || null,
    approval_status: row.approval_status || 'pending_approval',
    error_message: row.error_message || null,
    error_code: row.error_code || null,
    metadata: row.metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  try {
    const rows = await rest('video_jobs', { method: 'POST', body: JSON.stringify(payload) });
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function updateVideoJob(videoJobId, patch = {}) {
  if (!serviceKey() || !videoJobId) return null;
  const body = { ...patch, updated_at: new Date().toISOString() };
  delete body.api_key;
  delete body.token;
  delete body.output_b64;
  delete body.bytes;
  try {
    const rows = await rest(`video_jobs?video_job_id=eq.${encodeURIComponent(videoJobId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body)
    });
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function uploadVideoAsset({ videoJobId, bytes, mime = 'video/mp4' }) {
  const key = serviceKey();
  if (!key || !bytes) return { ok: false, reason: 'not_configured' };
  const ext = mime.includes('webm') ? 'webm' : 'mp4';
  const path = `${videoJobId}.${ext}`;
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/videos/${encodeURIComponent(path)}`, {
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
    const detail = await response.text().catch(() => '');
    return { ok: false, reason: 'upload_failed', status: response.status, detail: String(detail).slice(0, 220) };
  }
  return { ok: true, output_storage_path: path, output_url: null, visibility: 'private' };
}

export default { insertVideoJob, updateVideoJob, uploadVideoAsset };
