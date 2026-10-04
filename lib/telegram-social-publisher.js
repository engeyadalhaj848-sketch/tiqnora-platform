import { processPublishingJob } from './v6/social-runtime.js';

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SOCIAL_BUCKET = 'social-creatives';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PLATFORMS = ['facebook', 'instagram', 'tiktok'];

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function serviceKey() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return key;
}

function botToken() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  return token;
}

async function rest(path, options = {}) {
  const key = serviceKey();
  const response = await fetch(supabaseUrl() + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.hint || ('Supabase ' + response.status));
  return data;
}

function publishCaption(message) {
  return String(message?.caption || '').trim();
}

function publishCommandRegex() {
  return /^(?:\/(?:publish|post)(?:@\w+)?|انشر(?:\s+المنشور)?)(?:\s|$)/i;
}

export function isTelegramSocialPublishRequest(message = {}) {
  const caption = publishCaption(message);
  const hasPhoto = Array.isArray(message?.photo) && message.photo.length > 0;
  const documentMime = String(message?.document?.mime_type || '').toLowerCase();
  const hasImageDocument = Boolean(message?.document?.file_id) && ['image/png', 'image/jpeg', 'image/webp'].includes(documentMime);
  return Boolean((hasPhoto || hasImageDocument) && publishCommandRegex().test(caption));
}

function cleanPostText(caption) {
  return String(caption || '').replace(publishCommandRegex(), '').trim();
}

function extractHashtags(text) {
  const tags = [];
  for (const match of String(text || '').matchAll(/#[\p{L}\p{N}_]+/gu)) {
    if (!tags.includes(match[0])) tags.push(match[0]);
    if (tags.length >= 8) break;
  }
  return tags;
}

function stripHashtags(text, hashtags) {
  let body = String(text || '');
  for (const tag of hashtags || []) body = body.replaceAll(tag, ' ');
  return body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

async function telegramIntegration() {
  const rows = await rest('integration_connections?provider=eq.telegram&select=metadata&limit=1').catch(() => []);
  return rows?.[0]?.metadata || {};
}

async function assertOwner(message) {
  const metadata = await telegramIntegration();
  const owner = String(metadata.collaboration_owner_user_id || metadata.paired_telegram_user_id || '');
  const actor = String(message?.from?.id || '');
  if (!owner || actor !== owner) throw new Error('Only the paired Tiqnora owner can publish social posts from Telegram.');
}

function imageDescriptor(message) {
  if (Array.isArray(message?.photo) && message.photo.length) {
    const best = [...message.photo].sort((a, b) => Number(b.file_size || 0) - Number(a.file_size || 0))[0];
    return {
      fileId: best.file_id,
      size: Number(best.file_size || 0),
      mime: 'image/jpeg',
      ext: 'jpg'
    };
  }
  const doc = message?.document;
  const mime = String(doc?.mime_type || '').toLowerCase();
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return {
    fileId: doc?.file_id || '',
    size: Number(doc?.file_size || 0),
    mime: mime || 'image/jpeg',
    ext
  };
}

async function telegramApi(method, payload = {}) {
  const token = botToken();
  const response = await fetch('https://api.telegram.org/bot' + encodeURIComponent(token) + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.description || ('Telegram ' + method + ' failed'));
  return data?.result;
}

async function downloadTelegramImage(message) {
  const image = imageDescriptor(message);
  if (!image.fileId) throw new Error('Telegram image file_id is missing.');
  if (image.size && image.size > MAX_IMAGE_BYTES) throw new Error('Image is larger than the 10 MB social publishing limit.');

  const file = await telegramApi('getFile', { file_id: image.fileId });
  const filePath = String(file?.file_path || '').trim();
  if (!filePath) throw new Error('Telegram did not return a downloadable image path.');

  const token = botToken();
  const response = await fetch('https://api.telegram.org/file/bot' + encodeURIComponent(token) + '/' + filePath);
  if (!response.ok) throw new Error('Telegram image download failed (' + response.status + ').');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image is larger than the 10 MB social publishing limit.');
  return { ...image, bytes };
}

function safeStorageSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'unknown';
}

async function uploadImage(message) {
  const image = await downloadTelegramImage(message);
  const date = new Date().toISOString().slice(0, 10);
  const path = [
    'telegram',
    date,
    safeStorageSegment(message?.chat?.id),
    safeStorageSegment(message?.message_id) + '.' + image.ext
  ].join('/');

  const key = serviceKey();
  const response = await fetch(supabaseUrl() + '/storage/v1/object/' + SOCIAL_BUCKET + '/' + path, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': image.mime,
      'x-upsert': 'true',
      'Cache-Control': 'public, max-age=31536000, immutable'
    },
    body: image.bytes
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Social image upload failed (' + response.status + '): ' + detail.slice(0, 160));
  }
  return {
    path,
    url: supabaseUrl() + '/storage/v1/object/public/' + SOCIAL_BUCKET + '/' + path
  };
}

async function tiqnoraOrganizationId() {
  const rows = await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
  const id = String(rows?.[0]?.id || '');
  if (!id) throw new Error('Tiqnora organization is missing.');
  return id;
}

async function createContent({ organizationId, body, hashtags, imageUrl, message }) {
  const now = new Date().toISOString();
  const rows = await rest('content_items', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      status: 'approved',
      content_type: 'social_post',
      title: 'Telegram owner post ' + String(message?.message_id || ''),
      body,
      hashtags,
      language: 'ar',
      recommended_asset: imageUrl,
      creative_brief: { image_url: imageUrl, source: 'telegram_owner_publish' },
      brand_validation: { ok: true, source: 'owner_direct_publish' },
      approved_at: now,
      metadata: {
        source: 'telegram_owner_publish',
        image_url: imageUrl,
        owner_approved_via: 'telegram_group',
        owner_approved_at: now,
        owner_telegram_user_id: String(message?.from?.id || ''),
        telegram_chat_id: String(message?.chat?.id || ''),
        telegram_message_id: String(message?.message_id || '')
      }
    })
  });
  const item = rows?.[0];
  if (!item?.id) throw new Error('Could not create the social content item.');
  return item;
}

async function createVariant({ organizationId, contentId, platform, body, hashtags, imageUrl, message }) {
  const rows = await rest('content_variants', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      content_id: contentId,
      platform,
      body,
      hashtags,
      status: 'approved',
      metadata: {
        source: 'telegram_owner_publish',
        image_url: imageUrl,
        owner_approved_via: 'telegram_group',
        owner_telegram_user_id: String(message?.from?.id || '')
      }
    })
  });
  const variant = rows?.[0];
  if (!variant?.id) throw new Error('Could not create the ' + platform + ' content variant.');
  return variant;
}

async function createQueueJob({ organizationId, contentId, variantId, platform, imageUrl, message }) {
  const now = new Date().toISOString();
  const rows = await rest('publishing_queue', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      content_id: contentId,
      variant_id: variantId,
      platform,
      status: 'queued',
      requires_approval: false,
      metadata: {
        source: 'telegram_owner_publish',
        image_url: imageUrl,
        owner_approval_required: true,
        approval_channel: 'telegram_group',
        owner_approved_via: 'telegram_group',
        owner_approved_at: now,
        owner_telegram_user_id: String(message?.from?.id || '')
      }
    })
  });
  const job = rows?.[0];
  if (!job?.id) throw new Error('Could not queue ' + platform + ' publishing.');
  return job;
}

export async function publishTelegramSocialPost(message) {
  if (!isTelegramSocialPublishRequest(message)) {
    throw new Error('Send an image with a caption that starts with /publish or انشر.');
  }

  await assertOwner(message);

  const raw = cleanPostText(publishCaption(message));
  if (!raw) throw new Error('Add the post caption after /publish.');

  const hashtags = extractHashtags(raw);
  const body = stripHashtags(raw, hashtags) || raw;
  const organizationId = await tiqnoraOrganizationId();
  const uploaded = await uploadImage(message);
  const content = await createContent({
    organizationId,
    body,
    hashtags,
    imageUrl: uploaded.url,
    message
  });

  const jobs = [];
  for (const platform of PLATFORMS) {
    const variant = await createVariant({
      organizationId,
      contentId: content.id,
      platform,
      body,
      hashtags,
      imageUrl: uploaded.url,
      message
    });
    jobs.push(await createQueueJob({
      organizationId,
      contentId: content.id,
      variantId: variant.id,
      platform,
      imageUrl: uploaded.url,
      message
    }));
  }

  const delivery = await Promise.all(jobs.map(job => processPublishingJob(job)));
  const allPublished = delivery.every(result => result.status === 'published');
  if (allPublished) {
    await rest('content_items?id=eq.' + encodeURIComponent(content.id), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'published',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    }).catch(() => null);
  }

  return {
    ok: allPublished,
    action: 'telegram_owner_social_publish',
    content_id: content.id,
    image_url: uploaded.url,
    delivery
  };
}
