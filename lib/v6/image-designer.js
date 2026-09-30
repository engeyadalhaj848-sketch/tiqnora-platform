/**
 * Tiqnora Image Designer — production visual pipeline
 */
import { generateImage, imageProviderStatus } from '../ai/image-provider.js';
import { buildBrandProfile, getDefaultBrandProfile, getApprovedCTA } from './brand-brain.js';
import { insertImageJob, updateImageJob, uploadDesignAsset } from './image-jobs.js';

export const DESIGN_FORMATS = Object.freeze([
  { key: 'square', width: 1080, height: 1080, label: '1:1', platform_hint: 'instagram_feed' },
  { key: 'portrait', width: 1080, height: 1350, label: '4:5', platform_hint: 'instagram_portrait' },
  { key: 'story', width: 1080, height: 1920, label: '9:16', platform_hint: 'story_reel_tiktok' }
]);

export const VISUAL_GUIDELINES = Object.freeze({
  web_design: { mood: 'cyber luxury UI mockups, floating browser frames, clean SaaS dashboards', subjects: ['website hero mockup', 'responsive frames', 'conversion CTA card'], avoid: ['generic wordpress screenshots'] },
  ai_agents: { mood: 'abstract neural networks, soft cyan glow, professional AI workforce', subjects: ['agent nodes', 'workflow graph'], avoid: ['humanoid robots with faces'] },
  social_automation: { mood: 'content calendar energy, multi-platform abstract', subjects: ['post grid abstract', 'automation arrows'], avoid: ['fake engagement counters'] },
  crm: { mood: 'organized pipeline, clean CRM cards', subjects: ['pipeline stages abstract'], avoid: ['excel screenshots'] },
  whatsapp_automation: { mood: 'conversation bubbles, cyan accents on navy', subjects: ['chat UI abstract'], avoid: ['official WhatsApp logo misuse'] },
  ecommerce: { mood: 'premium product stage, soft studio light', subjects: ['product pedestal', 'storefront mock'], avoid: ['cheap dropship collage'] },
  it_networking: { mood: 'infrastructure clarity, network nodes', subjects: ['network topology abstract'], avoid: ['stock IT guy pointing'] },
  cyber_technology: { mood: 'midnight navy, electric blue beams, cyber luxury', subjects: ['shield motifs abstract'], avoid: ['hooded hacker stock'] },
  saudi_b2b: { mood: 'premium Saudi business context, professional Arabic market', subjects: ['growth arrow', 'trust signals'], avoid: ['orientalist clichés'] }
});

const BRAND_COLORS = { electric_blue: '#0A5CFF', cyber_cyan: '#00D2FF', midnight_navy: '#060B1E', pure_white: '#FFFFFF' };
const OFFICIAL_LOGO_URL = process.env.TIQNORA_LOGO_URL || 'https://tiqnora.com/assets/tiqnora-logo.png';
const LOCAL_LOGO_CANDIDATES = ['assets/tiqnora-logo.png', 'public/assets/tiqnora-logo.png'];

function uuidLike() {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function detectVertical(text = '') {
  const t = String(text).toLowerCase();
  if (/موقع|متجر|web.?design|e-?commerce|storefront|تصميم المواقع/.test(t)) return 'web_design';
  if (/وكيل|ai.?agent|وكلاء/.test(t)) return 'ai_agents';
  if (/سوشال|social.?auto|أتمتة.?اجتماعي/.test(t)) return 'social_automation';
  if (/\bcrm\b|إدارة.?عملاء/.test(t)) return 'crm';
  if (/واتساب|whatsapp/.test(t)) return 'whatsapp_automation';
  if (/شبكة|networking|cctv|pos/.test(t)) return 'it_networking';
  if (/cyber|أمن|حماية/.test(t)) return 'cyber_technology';
  if (/سعود|b2b|منشآت|عيادة|عقار/.test(t)) return 'saudi_b2b';
  return 'web_design';
}

function extractArabicHeadline(message = '') {
  const m = String(message).match(/[\u0600-\u06FF][\u0600-\u06FF\sـ،]{6,80}/);
  return m ? m[0].trim() : null;
}

function escapeXml(s) {
  return String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

/** Split Arabic/English text into wrapped lines by max chars (visual width approximation). */
export function wrapOverlayText(text, maxChars = 28, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  else if (cur && lines.length) lines[lines.length - 1] = (lines[lines.length - 1] + '…').slice(0, maxChars + 1);
  return lines.slice(0, maxLines);
}

export function buildArtDirection({ campaign, message, vertical, brand, format }) {
  const guide = VISUAL_GUIDELINES[vertical] || VISUAL_GUIDELINES.web_design;
  const colors = brand?.visual_identity?.colors || BRAND_COLORS;
  const headline = campaign?.headline || message?.slice(0, 80) || 'Tiqnora AI growth';
  const prompt = [
    `Premium commercial marketing visual for Tiqnora AI, Saudi B2B tech brand.`,
    `Campaign theme: ${headline}. Vertical: ${vertical.replace(/_/g, ' ')}.`,
    `Mood: ${guide.mood}. Subjects: ${guide.subjects.join(', ')}.`,
    `Color palette strictly: midnight navy ${colors.midnight_navy || BRAND_COLORS.midnight_navy}, electric blue ${colors.electric_blue || BRAND_COLORS.electric_blue}, cyber cyan ${colors.cyber_cyan || BRAND_COLORS.cyber_cyan}, pure white accents.`,
    `Style: cyber luxury, clean hierarchy, generous negative space, soft studio lighting with cyan rim light.`,
    `Composition for ${format.label} (${format.width}x${format.height}): leave clean lower third and safe margins for later text overlay; do not render any text, letters, Arabic calligraphy, logos, watermarks, or UI labels inside the image.`,
    `No stock-photo people faces, no distorted hands, no cheap collage.`
  ].join(' ');
  return {
    prompt,
    negative_prompt: 'text, typography, letters, Arabic text, logo, watermark, blurry, distorted hands, extra fingers, cluttered collage',
    vertical,
    format,
    prompt_version: 'tiqnora-art-v3',
    overlay: {
      headline_ar: campaign?.headline_ar || extractArabicHeadline(message) || 'تصميم المواقع والمتاجر الإلكترونية',
      sub_ar: campaign?.sub_ar || 'مع Tiqnora AI — حضور رقمي فاخر',
      cta_ar: campaign?.cta_ar || getApprovedCTA(brand, 'ar') || 'ناقش مشروعك',
      brand_name: brand?.brand_name || 'Tiqnora AI'
    }
  };
}

export function runQualityGate(artifact = {}, artDirection = {}) {
  const failures = [];
  const warnings = [];
  if (!artifact.b64 && !artifact.url) failures.push('missing_image_bytes');
  if (artifact.width && artifact.width < 512) failures.push('resolution_too_low');
  if (!artDirection?.prompt?.includes('midnight navy')) warnings.push('brand_palette_missing_from_prompt');
  return { ok: failures.length === 0, failures, warnings, structural: true };
}

/** Optional vision inspection when GEMINI is configured. */
export async function runVisionQualityGate({ b64, campaign, format }) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key || !b64) {
    return { ok: true, skipped: true, reason: 'vision_unavailable' };
  }
  const model = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const prompt = `You are a strict brand art director QA. Inspect this marketing image for Tiqnora AI (Saudi B2B tech, cyber luxury navy/cyan).
Campaign: ${campaign?.name || campaign?.headline_ar || ''}. Format: ${format?.width}x${format?.height}.
Return JSON only: {"ok":boolean,"score":0-100,"failures":[string],"notes":string}
Fail if: random/garbled text, wrong logos, deformed faces/hands, cheap stock look, severe clutter, unreadable hierarchy, off-brand palette, cropped critical elements.`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/png', data: b64 } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 400, responseMimeType: 'application/json' }
        })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: true, skipped: true, reason: 'vision_http_error' };
    const text = (payload?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    const json = JSON.parse(text.replace(/```json|```/g, '').trim());
    return {
      ok: Boolean(json.ok) && Number(json.score || 0) >= 70,
      score: json.score,
      failures: json.failures || [],
      notes: json.notes || '',
      structural: false
    };
  } catch {
    return { ok: true, skipped: true, reason: 'vision_parse_error' };
  }
}

async function loadOfficialLogoBuffer() {
  try {
    const res = await fetch(OFFICIAL_LOGO_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  } catch { /* continue */ }
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const rel of LOCAL_LOGO_CANDIDATES) {
      const p = join(process.cwd(), rel);
      if (existsSync(p)) return readFileSync(p);
    }
  } catch { /* ignore */ }
  return null;
}

export async function composeBrandOverlay({ b64, format, overlay }) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return { b64, composed: false, reason: 'sharp_unavailable' };
  }

  const width = format.width;
  const height = format.height;
  const base = await sharp(Buffer.from(b64, 'base64'))
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const scrimH = Math.round(height * 0.4);
  const maxChars = format.key === 'story' ? 22 : format.key === 'portrait' ? 26 : 28;
  const titleLines = wrapOverlayText(overlay.headline_ar || '', maxChars, 3);
  const subLines = wrapOverlayText(overlay.sub_ar || '', maxChars + 4, 2);
  const cta = escapeXml(overlay.cta_ar || 'ناقش مشروعك');
  const fontTitle = format.key === 'story' ? 48 : format.key === 'portrait' ? 42 : 40;
  const fontSub = Math.round(fontTitle * 0.55);
  const fontCta = Math.round(fontTitle * 0.5);

  let titleY = height - scrimH + 64;
  const titleSvg = titleLines
    .map((line, i) => {
      const y = titleY + i * (fontTitle + 8);
      return `<text x="${width - 56}" y="${y}" text-anchor="end" direction="rtl" xml:lang="ar" font-family="Segoe UI, Arial, sans-serif" font-size="${fontTitle}" font-weight="800" fill="#FFFFFF">${escapeXml(line)}</text>`;
    })
    .join('\n');
  titleY += titleLines.length * (fontTitle + 8) + 8;
  const subSvg = subLines
    .map((line, i) => {
      const y = titleY + i * (fontSub + 6);
      return `<text x="${width - 56}" y="${y}" text-anchor="end" direction="rtl" xml:lang="ar" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSub}" font-weight="500" fill="#00D2FF">${escapeXml(line)}</text>`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#060B1E" stop-opacity="0"/>
      <stop offset="40%" stop-color="#060B1E" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#060B1E" stop-opacity="0.93"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${height - scrimH}" width="${width}" height="${scrimH}" fill="url(#scrim)"/>
  ${titleSvg}
  ${subSvg}
  <rect x="${width - 56 - 280}" y="${height - 118}" rx="28" ry="28" width="280" height="54" fill="#0A5CFF"/>
  <text x="${width - 56 - 140}" y="${height - 82}" text-anchor="middle" direction="rtl" xml:lang="ar" font-family="Segoe UI, Arial, sans-serif" font-size="${fontCta}" font-weight="700" fill="#FFFFFF">${cta}</text>
  <rect x="48" y="${height - 28}" width="${Math.round(width * 0.22)}" height="4" rx="2" fill="#00D2FF"/>
</svg>`;

  const composites = [{ input: Buffer.from(svg), top: 0, left: 0 }];
  const logoBuf = await loadOfficialLogoBuffer();
  if (logoBuf) {
    const logoResized = await sharp(logoBuf).resize(120, 120, { fit: 'inside' }).png().toBuffer();
    composites.push({ input: logoResized, top: 40, left: 40 });
  }

  const out = await sharp(base).composite(composites).png().toBuffer();
  return { b64: out.toString('base64'), composed: true, mime: 'image/png', logo_applied: Boolean(logoBuf) };
}

export async function generateDesignAsset({
  message,
  campaign = {},
  format,
  brand,
  maxRetries = 2,
  organizationId = null
}) {
  const vertical = campaign.vertical || detectVertical(message || campaign.headline || '');
  const art = buildArtDirection({ campaign, message, vertical, brand, format });
  const jobId = uuidLike();
  const attempts = [];

  await insertImageJob({
    image_job_id: jobId,
    organization_id: organizationId,
    agent_id: 'image-designer',
    campaign_name: campaign.name || campaign.headline_ar || null,
    platform: campaign.platform || 'instagram',
    format_key: format.key,
    width: format.width,
    height: format.height,
    prompt_version: art.prompt_version,
    generation_status: 'running',
    approval_status: 'pending_approval',
    art_direction: art
  });

  let lastGate = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt =
      attempt === 0
        ? art.prompt
        : `${art.prompt} Variation ${attempt + 1}: cleaner lower third, no text, stronger brand palette.`;
    try {
      const artifact = await generateImage({
        prompt: `${prompt}\n\nNegative: ${art.negative_prompt}`,
        width: format.width,
        height: format.height,
        quality: 'high',
        prompt_version: art.prompt_version
      });
      const structural = runQualityGate(artifact, art);
      lastGate = structural;
      if (!structural.ok) {
        attempts.push({ attempt, gate: structural, stage: 'structural' });
        continue;
      }

      let composed = { b64: artifact.b64, composed: false };
      if (artifact.b64) {
        composed = await composeBrandOverlay({ b64: artifact.b64, format, overlay: art.overlay });
      }

      const vision = await runVisionQualityGate({
        b64: composed.b64 || artifact.b64,
        campaign,
        format
      });
      lastGate = { ...structural, vision };
      attempts.push({ attempt, provider: artifact.provider, model: artifact.model, gate: lastGate });

      if (vision.ok === false && !vision.skipped) {
        continue;
      }

      let storage = { ok: false };
      if (composed.b64) {
        storage = await uploadDesignAsset({
          imageJobId: jobId,
          bytes: Buffer.from(composed.b64, 'base64'),
          mime: 'image/png'
        });
      }

      const result = {
        image_job_id: jobId,
        agent_id: 'image-designer',
        provider: artifact.provider,
        model: artifact.model,
        prompt_version: art.prompt_version,
        generation_status: 'succeeded',
        format,
        vertical,
        art_direction: art,
        quality_gate: lastGate,
        revision_count: attempt,
        output_b64: composed.b64 || artifact.b64,
        output_url: storage.output_url || artifact.url || null,
        output_storage_path: storage.output_storage_path || null,
        composed: composed.composed,
        logo_applied: composed.logo_applied || false,
        mime: 'image/png',
        approval_status: 'pending_approval',
        attempts,
        created_at: new Date().toISOString()
      };

      await updateImageJob(jobId, {
        provider: result.provider,
        model: result.model,
        generation_status: 'succeeded',
        quality_gate: lastGate,
        revision_count: attempt,
        output_url: result.output_url,
        output_storage_path: result.output_storage_path,
        approval_status: 'pending_approval'
      });

      return result;
    } catch (err) {
      attempts.push({
        attempt,
        error: err.code || 'ERROR',
        message: String(err.message || '').slice(0, 300),
        provider_attempts: err.attempts || []
      });
      if (attempt === maxRetries) {
        await updateImageJob(jobId, {
          generation_status: 'failed',
          error_code: err.code || 'IMAGE_GENERATION_FAILED',
          error_message: String(err.message || '').slice(0, 500),
          approval_status: 'failed',
          revision_count: attempt
        });
        return {
          image_job_id: jobId,
          agent_id: 'image-designer',
          generation_status: 'failed',
          format,
          vertical,
          art_direction: art,
          quality_gate: lastGate,
          revision_count: attempt,
          error: String(err.message || 'generation_failed').slice(0, 500),
          error_code: err.code || 'IMAGE_GENERATION_FAILED',
          approval_status: 'failed',
          attempts,
          created_at: new Date().toISOString()
        };
      }
    }
  }

  await updateImageJob(jobId, {
    generation_status: 'failed_quality',
    approval_status: 'failed',
    quality_gate: lastGate,
    revision_count: maxRetries
  });
  return {
    image_job_id: jobId,
    agent_id: 'image-designer',
    generation_status: 'failed_quality',
    format,
    quality_gate: lastGate,
    revision_count: maxRetries,
    approval_status: 'failed',
    attempts,
    created_at: new Date().toISOString()
  };
}

export async function runSocialDesignCampaign({
  message,
  campaign = {},
  brandProfile,
  formats = DESIGN_FORMATS,
  organizationId = null
}) {
  const brand = buildBrandProfile(brandProfile || getDefaultBrandProfile());
  const vertical = campaign.vertical || detectVertical(message);
  const campaignMeta = {
    name: campaign.name || extractArabicHeadline(message) || 'حملة تصميم',
    headline_ar:
      campaign.headline_ar ||
      extractArabicHeadline(message) ||
      'تصميم المواقع الإلكترونية والمتاجر الإلكترونية',
    sub_ar: campaign.sub_ar || 'مع Tiqnora AI — حضور رقمي فاخر',
    cta_ar: campaign.cta_ar || getApprovedCTA(brand, 'ar') || 'ناقش مشروعك',
    vertical,
    platform: campaign.platform || 'instagram'
  };

  const assets = [];
  for (const format of formats) {
    // eslint-disable-next-line no-await-in-loop
    const asset = await generateDesignAsset({
      message,
      campaign: campaignMeta,
      format,
      brand,
      organizationId
    });
    assets.push(asset);
  }

  const succeeded = assets.filter((a) => a.generation_status === 'succeeded');
  return {
    campaign: campaignMeta,
    assets,
    succeeded_count: succeeded.length,
    failed_count: assets.length - succeeded.length,
    approval_status: succeeded.length ? 'pending_approval' : 'failed',
    requires_approval: true,
    auto_publish: false,
    created_at: new Date().toISOString()
  };
}

export function buildDesignReviewCaption({ campaign, format, version = 1, notes = '' }) {
  return [
    '🖼️ Design Review',
    `Campaign: ${campaign?.name || campaign?.headline_ar || '—'}`,
    `Platform: ${campaign?.platform || 'instagram'}`,
    `Format: ${format?.width || '?'}×${format?.height || '?'} (${format?.label || format?.key || ''})`,
    `Version: v${version}`,
    notes ? `Designer notes: ${notes}` : 'Designer notes: clean artwork + official logo + Arabic overlay',
    '',
    'الحالة: pending_approval — لن يُنشر تلقائياً',
    '',
    '✅ اعتماد   |   🔄 تعديل   |   ❌ رفض'
  ].join('\n');
}

export function designReviewKeyboard(jobId) {
  return {
    inline_keyboard: [[
      { text: '✅ اعتماد', callback_data: `design_ok:${jobId}` },
      { text: '🔄 تعديل', callback_data: `design_rev:${jobId}` },
      { text: '❌ رفض', callback_data: `design_no:${jobId}` }
    ]]
  };
}

export function isImageDesignRequest(message = '') {
  const value = String(message || '').trim();
  return /تصميم|صم[ّم]|صمم|تصمم|تصميمات|منشور|منشورات|بوستر|بوسترات|بانر|بنر|صورة|صور|الصورة|الصور|هوية بصرية|كرياتيف|creative|graphic|poster|banner|carousel|social.?design|design.*(post|image|visual)|generate.*(image|visual)/i.test(value);
}

export function imageProviderReady() {
  const s = imageProviderStatus();
  return s.openai.configured || s.gemini.configured;
}

export { imageProviderStatus };

export default {
  DESIGN_FORMATS,
  VISUAL_GUIDELINES,
  buildArtDirection,
  runQualityGate,
  runVisionQualityGate,
  composeBrandOverlay,
  generateDesignAsset,
  runSocialDesignCampaign,
  buildDesignReviewCaption,
  designReviewKeyboard,
  isImageDesignRequest,
  imageProviderReady,
  imageProviderStatus,
  wrapOverlayText
};
