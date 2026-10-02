/**
 * Gemini Veo video provider for Tiqnora.
 * Produces one real MP4 draft and never claims success without downloaded bytes.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function apiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
}

export function videoProviderStatus() {
  return {
    provider: 'gemini',
    configured: Boolean(apiKey()),
    model: String(process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview'),
    max_single_clip_seconds: 8,
    supported_aspect_ratios: ['9:16', '16:9'],
    supported_resolutions: ['720p', '1080p']
  };
}

function providerError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

async function jsonOrText(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function generateVideo({
  prompt,
  aspectRatio = '9:16',
  durationSeconds = 8,
  resolution = '720p',
  timeoutMs = 240000,
  pollMs = 8000,
  model = process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview'
} = {}) {
  const key = apiKey();
  if (!key) throw providerError('VIDEO_PROVIDER_NOT_CONFIGURED', 'GEMINI_API_KEY or GOOGLE_AI_API_KEY is required.');
  const safePrompt = String(prompt || '').trim();
  if (!safePrompt) throw providerError('VIDEO_PROMPT_REQUIRED', 'Video prompt is required.');

  const duration = [4, 6, 8].includes(Number(durationSeconds)) ? Number(durationSeconds) : 8;
  const ratio = ['9:16', '16:9'].includes(String(aspectRatio)) ? String(aspectRatio) : '9:16';
  const res = ['720p', '1080p'].includes(String(resolution)) ? String(resolution) : '720p';
  const effectiveDuration = res === '1080p' ? 8 : duration;

  const start = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:predictLongRunning`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      instances: [{ prompt: safePrompt }],
      parameters: {
        aspectRatio: ratio,
        durationSeconds: String(effectiveDuration),
        resolution: res,
        numberOfVideos: 1
      }
    })
  });

  const startData = await jsonOrText(start);
  if (!start.ok || !startData?.name) {
    throw providerError(
      'VIDEO_GENERATION_START_FAILED',
      String(startData?.error?.message || startData?.message || startData?.raw || `Gemini video start failed (${start.status})`).slice(0, 700),
      { status: start.status }
    );
  }

  const operationName = String(startData.name);
  const startedAt = Date.now();
  let operation = startData;

  while (Date.now() - startedAt < timeoutMs) {
    if (operation?.done === true) break;
    await new Promise(resolve => setTimeout(resolve, pollMs));
    const poll = await fetch(`${BASE_URL}/${operationName}`, {
      headers: { 'x-goog-api-key': key, 'Cache-Control': 'no-cache' }
    });
    operation = await jsonOrText(poll);
    if (!poll.ok) {
      throw providerError(
        'VIDEO_GENERATION_POLL_FAILED',
        String(operation?.error?.message || operation?.message || operation?.raw || `Gemini video poll failed (${poll.status})`).slice(0, 700),
        { status: poll.status, operation_name: operationName }
      );
    }
  }

  if (operation?.done !== true) {
    throw providerError(
      'VIDEO_GENERATION_TIMEOUT',
      'Video generation is still processing after the synchronous wait window.',
      { operation_name: operationName }
    );
  }

  if (operation?.error) {
    throw providerError(
      'VIDEO_GENERATION_FAILED',
      String(operation.error.message || JSON.stringify(operation.error)).slice(0, 700),
      { operation_name: operationName }
    );
  }

  const sample = operation?.response?.generateVideoResponse?.generatedSamples?.[0];
  const video = sample?.video || operation?.response?.generatedVideos?.[0]?.video || null;
  const uri = String(video?.uri || video?.url || '').trim();
  if (!uri) {
    throw providerError('VIDEO_URI_MISSING', 'Gemini completed without a downloadable video URI.', { operation_name: operationName });
  }

  const download = await fetch(uri, {
    headers: { 'x-goog-api-key': key },
    redirect: 'follow'
  });
  if (!download.ok) {
    throw providerError(
      'VIDEO_DOWNLOAD_FAILED',
      `Video download failed (${download.status}).`,
      { status: download.status, operation_name: operationName }
    );
  }

  const bytes = Buffer.from(await download.arrayBuffer());
  if (!bytes.length) {
    throw providerError('VIDEO_EMPTY_OUTPUT', 'Gemini returned an empty video file.', { operation_name: operationName });
  }

  return {
    provider: 'gemini',
    model,
    operation_name: operationName,
    bytes,
    mime: String(download.headers.get('content-type') || video?.mimeType || 'video/mp4').split(';')[0],
    aspect_ratio: ratio,
    resolution: res,
    duration_seconds: effectiveDuration,
    source_uri: uri
  };
}

export default { generateVideo, videoProviderStatus };
