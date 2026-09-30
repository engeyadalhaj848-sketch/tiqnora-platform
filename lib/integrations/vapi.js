const VAPI_BASE = 'https://api.vapi.ai';

function env(name) {
  return String(process.env[name] || '').trim();
}

export function normalizeE164(value) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(raw)) {
    throw Object.assign(new Error('Phone number must be in E.164 format, e.g. +9665XXXXXXXX'), {
      status: 400,
      code: 'invalid_phone'
    });
  }
  return raw;
}

export function vapiStatus() {
  const apiKey = Boolean(env('VAPI_API_KEY'));
  const assistantId = Boolean(env('VAPI_ASSISTANT_ID'));
  const phoneNumberId = Boolean(env('VAPI_PHONE_NUMBER_ID'));
  const webhookSecret = Boolean(env('VAPI_WEBHOOK_SECRET'));
  return {
    configured: apiKey && assistantId && phoneNumberId,
    api_key: apiKey,
    assistant_id: assistantId,
    phone_number_id: phoneNumberId,
    webhook_secret: webhookSecret,
    provider: 'vapi',
    recording_default: false,
    transcript_storage_default: false
  };
}

async function vapiFetch(path, init = {}) {
  const apiKey = env('VAPI_API_KEY');
  if (!apiKey) {
    throw Object.assign(new Error('VAPI_API_KEY is not configured.'), {
      status: 503,
      code: 'vapi_not_configured'
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${VAPI_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.message || body?.error?.message || body?.error || `Vapi request failed (${response.status})`;
      throw Object.assign(new Error(String(message)), {
        status: response.status >= 500 ? 502 : response.status,
        code: 'vapi_request_failed',
        provider_status: response.status
      });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function placeVapiCall({
  customerNumber,
  customerName = '',
  metadata = {}
} = {}) {
  const status = vapiStatus();
  if (!status.configured) {
    throw Object.assign(new Error('Vapi telephony is not fully configured.'), {
      status: 503,
      code: 'vapi_not_configured'
    });
  }

  const number = normalizeE164(customerNumber);
  const assistantId = env('VAPI_ASSISTANT_ID');
  const phoneNumberId = env('VAPI_PHONE_NUMBER_ID');

  const payload = {
    assistantId,
    phoneNumberId,
    customer: {
      number,
      ...(customerName ? { name: String(customerName).slice(0, 120) } : {})
    },
    assistantOverrides: {
      artifactPlan: {
        recordingEnabled: false,
        loggingEnabled: false,
        pcapEnabled: false,
        transcriptPlan: { enabled: false }
      }
    },
    metadata: {
      source: 'tiqnora',
      recording_enabled: false,
      transcript_persistence: false,
      ...metadata
    }
  };

  const call = await vapiFetch('/call', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    id: call?.id || null,
    status: call?.status || 'queued',
    created_at: call?.createdAt || new Date().toISOString(),
    provider: 'vapi',
    raw: call
  };
}

export function verifyVapiWebhook(req) {
  const secret = env('VAPI_WEBHOOK_SECRET');
  if (!secret) return false;
  const xSecret = String(req.headers?.['x-vapi-secret'] || '');
  const auth = String(req.headers?.authorization || '');
  return xSecret === secret || auth === `Bearer ${secret}`;
}

export function mapVapiWebhook(body = {}) {
  const message = body?.message || body || {};
  const call = message?.call || body?.call || {};
  const type = String(message?.type || body?.type || '').trim();

  let status = String(call?.status || '').trim() || null;
  if (type === 'call-started') status = 'in_progress';
  if (type === 'call-ended' || type === 'end-of-call-report') status = 'completed';
  if (type === 'call-failed' || type === 'error') status = 'failed';

  const startedAt = call?.startedAt || call?.started_at || null;
  const endedAt = call?.endedAt || call?.ended_at || null;
  let durationSeconds = null;
  if (startedAt && endedAt) {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) durationSeconds = Math.round(ms / 1000);
  }

  return {
    event_type: type || 'unknown',
    external_call_id: call?.id || message?.callId || body?.callId || null,
    status,
    duration_seconds: durationSeconds,
    ended_reason: call?.endedReason || call?.ended_reason || message?.endedReason || null,
    customer_number: call?.customer?.number || message?.customer?.number || null,
    // Deliberately do not persist transcript or recording URLs by default.
    summary: message?.analysis?.summary || call?.analysis?.summary || null
  };
}

export default {
  normalizeE164,
  vapiStatus,
  placeVapiCall,
  verifyVapiWebhook,
  mapVapiWebhook
};
