/** Tiqnora Image Designer Agent — production visual pipeline */
import { generateImage, imageProviderStatus } from '../ai/image-provider.js';
import { buildBrandProfile, getDefaultBrandProfile, getApprovedCTA } from './brand-brain.js';

export const DESIGN_FORMATS = Object.freeze([
  { key: 'square', width: 1080, height: 1080, label: '1:1', platform_hint: 'instagram_feed' },
  { key: 'portrait', width: 1080, height: 1350, label: '4:5', platform_hint: 'instagram_portrait' },
  { key: 'story', width: 1080, height: 1920, label: '9:16', platform_hint: 'story_reel_tiktok' }
]);

export const VISUAL_GUIDELINES = Object.freeze({
  web_design: { mood: 'cyber luxury UI mockups, floating browser frames, clean SaaS dashboards', subjects: ['website hero mockup', 'responsive frames', 'conversion CTA card'], avoid: ['generic wordpress theme screenshots'] },
  ai_agents: { mood: 'abstract neural networks, soft cyan glow, professional AI workforce', subjects: ['agent nodes', 'workflow graph'], avoid: ['humanoid robots with faces'] },
  social_automation: { mood: 'content calendar energy, multi-platform abstract', subjects: ['post grid abstract', 'automation arrows'], avoid: ['fake engagement counters'] },
  crm: { mood: 'organized pipeline, clean CRM cards', subjects: ['pipeline stages abstract', 'contact cards'], avoid: ['excel screenshots'] },
  whatsapp_automation: { mood: 'conversation bubbles, cyan accents on navy', subjects: ['chat UI abstract', 'auto-reply flow'], avoid: ['official WhatsApp logo misuse'] },
  ecommerce: { mood: 'premium product stage, soft studio light', subjects: ['product pedestal', 'storefront mock'], avoid: ['cheap dropship collage'] },
  it_networking: { mood: 'infrastructure clarity, network nodes', subjects: ['server racks soft', 'network topology abstract'], avoid: ['stock IT guy pointing'] },
  cyber_technology: { mood: 'midnight navy, electric blue beams, cyber luxury', subjects: ['shield motifs abstract', 'data streams'], avoid: ['hooded hacker stock'] },
  saudi_b2b: { mood: 'premium Saudi business context, professional Arabic market', subjects: ['executive meeting abstract', 'growth arrow'], avoid: ['orientalist clichés'] }
});

const BRAND_COLORS = { electric_blue: '#0A5CFF', cyber_cyan: '#00D2FF', midnight_navy: '#060B1E', pure_white: '#FFFFFF' };

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
  if (/متجر|تجارة|e-?commerce|shop/.test(t)) return 'ecommerce';
  if (/شبكة|networking|cctv|pos|طابعة/.test(t)) return 'it_networking';
  if (/cyber|أمن|حماية/.test(t)) return 'cyber_technology';
  if (/سعود|b2b|منشآت|عيادة|عقار/.test(t)) return 'saudi_b2b';
  return 'web_design';
}

function extractArabicHeadline(message = '') {
  const m = String(message).match(/[\u0600-\u06FF][\u0600-\u06FF\sـ،]{6,80}/);
  return m ? m[0].trim() : null;
}

function escapeXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildArtDirection({ campaign, message, vertical, brand, format }) {
  const guide = VISUAL_GUIDELINES[vertical] || VISUAL_GUIDELINES.web_design;
  const colors = brand?.visual_identity?.colors || BRAND_COLORS;
  const headline = campaign?.headline || message?.slice(0, 80) || 'Tiqnora AI growth';
  const basePrompt = [
    `Premium commercial marketing visual for Tiqnora AI, Saudi B2B tech brand.`,
    `Campaign theme: ${headline}.`,
    `Vertical: ${vertical.replace(/_/g, ' ')}.`,
    `Mood: ${guide.mood}.`,
    `Subjects: ${guide.subjects.join(', ')}.`,
    `Color palette strictly: midnight navy ${colors.midnight_navy || BRAND_COLORS.midnight_navy}, electric blue ${colors.electric_blue || BRAND_COLORS.electric_blue}, cyber cyan ${colors.cyber_cyan || BRAND_COLORS.cyber_cyan}, pure white accents.`,
    `Style: cyber luxury, clean hierarchy, generous negative space, soft studio lighting with cyan rim light, high-end SaaS advertising quality.`,
    `Composition for ${format.label} (${format.width}x${format.height}): leave clean lower third and safe margins for later text overlay; do not render any text, letters, Arabic calligraphy, logos, watermarks, or UI labels inside the image.`,
    `No stock-photo people faces, no distorted hands, no cheap collage, no cluttered icons dump.`,
    `Photoreal-meets-3D product/UI aesthetic, premium commercial quality.`
  ].join(' ');
  return {
    prompt: basePrompt,
    negative_prompt: 'text, typography, letters, Arabic text, logo, watermark, blurry, low resolution, distorted hands, extra fingers, deformed face, stock photo watermark, cluttered collage',
    vertical,
    format,
    prompt_version: 'tiqnora-art-v2',
    overlay: {
      headline_ar: campaign?.headline_ar || extractArabicHeadline(message) || 'تصميم المواقع والمتاجر الإلكترونية',
      sub_ar: campaign?.sub_ar || 'مع Tiqnora AI — هوية رقمية فاخرة لعلامتك',
      cta_ar: campaign?.cta_ar || getApprovedCTA(brand, 'ar') || 'ناقش مشروعك',
      brand_name: brand?.brand_name || 'Tiqnora AI'
    }
  };
}

export function runQualityGate(artifact = {}, artDirection = {}) {
  const failures = [];
  const warnings = [];
  if (!artifact.b64 && !artifact.url) failures.push('missing_image_bytes');
  if (artifact.provider === 'mock') warnings.push('mock_provider');
  if (artifact.width && artifact.width < 512) failures.push('resolution_too_low');
  if (!artDirection?.prompt?.includes('midnight navy')) warnings.push('brand_palette_missing_from_prompt');
  return { ok: failures.length === 0, failures, warnings, premium: failures.length === 0 && warnings.filter((w) => w !== 'mock_provider').length === 0 };
}

export async function composeBrandOverlay({ b64, format, overlay, logoUrl }) {
  let sharp;
  try { sharp = (await import('sharp')).default; } catch { return { b64, composed: false, reason: 'sharp_unavailable' }; }
  const input = Buffer.from(b64, 'base64');
  const width = format.width;
  const height = format.height;
  const base = await sharp(input).resize(width, height, { fit: 'cover', position: 'centre' }).png().toBuffer();
  const scrimH = Math.round(height * 0.38);
  const headline = escapeXml(overlay.headline_ar || '');
  const sub = escapeXml(overlay.sub_ar || '');
  const cta = escapeXml(overlay.cta_ar || '');
  const brand = escapeXml(overlay.brand_name || 'Tiqnora AI');
  const fontSizeTitle = format.key === 'story' ? 56 : format.key === 'portrait' ? 48 : 44;
  const fontSizeSub = Math.round(fontSizeTitle * 0.55);
  const fontSizeCta = Math.round(fontSizeTitle * 0.5);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">\n  <defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#060B1E" stop-opacity="0"/><stop offset="45%" stop-color="#060B1E" stop-opacity="0.55"/><stop offset="100%" stop-color="#060B1E" stop-opacity="0.92"/></linearGradient></defs>\n  <rect x="0" y="${height - scrimH}" width="${width}" height="${scrimH}" fill="url(#scrim)"/>\n  <rect x="48" y="48" rx="16" ry="16" width="220" height="48" fill="#0A5CFF" fill-opacity="0.92"/>\n  <text x="158" y="80" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF">${brand}</text>\n  <text x="${width - 56}" y="${height - scrimH + 70}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeTitle}" font-weight="800" fill="#FFFFFF">${headline}</text>\n  <text x="${width - 56}" y="${height - scrimH + 70 + fontSizeTitle}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeSub}" font-weight="500" fill="#00D2FF">${sub}</text>\n  <rect x="${width - 56 - 280}" y="${height - 120}" rx="28" ry="28" width="280" height="56" fill="#0A5CFF"/>\n  <text x="${width - 56 - 140}" y="${height - 82}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeCta}" font-weight="700" fill="#FFFFFF">${cta}</text>\n  <rect x="48" y="${height - 28}" width="${Math.round(width * 0.25)}" height="4" rx="2" fill="#00D2FF"/>\n</svg>`;
  const out = await sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  return { b64: out.toString('base64'), composed: true, mime: 'image/png' };
}

export async function generateDesignAsset({ message, campaign = {}, format, brand, maxRetries = 2, logoUrl = process.env.TIQNORA_LOGO_URL || 'https://tiqnora.com/assets/logo.png' }) {
  const vertical = campaign.vertical || detectVertical(message || campaign.headline || '');
  const art = buildArtDirection({ campaign, message, vertical, brand, format });
  const jobId = uuidLike();
  const attempts = [];
  let lastGate = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = attempt === 0 ? art.prompt : `${art.prompt} Variation ${attempt + 1}: stronger negative space in lower third, even cleaner composition, no text.`;
    try {
      const artifact = await generateImage({ prompt: `${prompt}\n\nNegative: ${art.negative_prompt}`, width: format.width, height: format.height, quality: 'high', prompt_version: art.prompt_version });
      const gate = runQualityGate(artifact, art);
      lastGate = gate;
      attempts.push({ attempt, provider: artifact.provider, model: artifact.model, gate });
      if (!gate.ok) continue;
      let composed = { b64: artifact.b64, composed: false };
      if (artifact.b64) composed = await composeBrandOverlay({ b64: artifact.b64, format, overlay: art.overlay, logoUrl });
      return {
        image_job_id: jobId, agent_id: 'image-designer', provider: artifact.provider, model: artifact.model,
        prompt_version: art.prompt_version, generation_status: 'succeeded', format, vertical, art_direction: art,
        quality_gate: gate, revision_count: attempt, output_b64: composed.b64 || artifact.b64, output_url: artifact.url || null,
        composed: composed.composed, mime: composed.mime || 'image/png', approval_status: 'pending_approval', attempts,
        created_at: new Date().toISOString()
      };
    } catch (err) {
      attempts.push({ attempt, error: err.code || 'ERROR', message: String(err.message || '').slice(0, 300), provider_attempts: err.attempts || [] });
      if (attempt === maxRetries) {
        return {
          image_job_id: jobId, agent_id: 'image-designer', generation_status: 'failed', format, vertical, art_direction: art,
          quality_gate: lastGate, revision_count: attempt, error: String(err.message || 'generation_failed').slice(0, 500),
          error_code: err.code || 'IMAGE_GENERATION_FAILED', approval_status: 'failed', attempts, created_at: new Date().toISOString()
        };
      }
    }
  }
  return { image_job_id: jobId, agent_id: 'image-designer', generation_status: 'failed_quality', format, quality_gate: lastGate, revision_count: maxRetries, approval_status: 'failed', attempts, created_at: new Date().toISOString() };
}

export async function runSocialDesignCampaign({ message, campaign = {}, brandProfile, formats = DESIGN_FORMATS, logoUrl }) {
  const brand = buildBrandProfile(brandProfile || getDefaultBrandProfile());
  const vertical = campaign.vertical || detectVertical(message);
  const campaignMeta = {
    name: campaign.name || extractArabicHeadline(message) || 'حملة تصميم',
    headline_ar: campaign.headline_ar || extractArabicHeadline(message) || 'تصميم المواقع الإلكترونية والمتاجر الإلكترونية',
    sub_ar: campaign.sub_ar || 'مع Tiqnora AI — حضور رقمي فاخر',
    cta_ar: campaign.cta_ar || getApprovedCTA(brand, 'ar') || 'ناقش مشروعك',
    vertical, platform: campaign.platform || 'instagram'
  };
  const assets = [];
  for (const format of formats) {
    const asset = await generateDesignAsset({ message, campaign: campaignMeta, format, brand, logoUrl });
    assets.push(asset);
  }
  const succeeded = assets.filter((a) => a.generation_status === 'succeeded');
  return {
    campaign: campaignMeta, assets, succeeded_count: succeeded.length, failed_count: assets.length - succeeded.length,
    approval_status: succeeded.length ? 'pending_approval' : 'failed', requires_approval: true, auto_publish: false,
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
    notes ? `Designer notes: ${notes}` : 'Designer notes: clean artwork + programmatic Arabic overlay',
    '',
    'الحالة: pending_approval — لن يُنشر تلقائياً',
    '',
    '✅ اعتماد   |   🔄 تعديل   |   ❌ رفض'
  ].join('\n');
}

export function designReviewKeyboard(jobId) {
  return { inline_keyboard: [[
    { text: '✅ اعتماد', callback_data: `design_ok:${jobId}` },
    { text: '🔄 تعديل', callback_data: `design_rev:${jobId}` },
    { text: '❌ رفض', callback_data: `design_no:${jobId}` }
  ]] };
}

export function isImageDesignRequest(message = '') {
  const t = String(message);
  return /تصميم|منشور|بوستر|صورة|هوية بصرية|graphic|poster|banner|carousel|social.?design|design.*(post|image)|generate.*(image|visual)/i.test(t);
}

export function imageProviderReady() {
  const s = imageProviderStatus();
  return s.openai.configured || s.gemini.configured;
}

export { imageProviderStatus };

export default {
  DESIGN_FORMATS, VISUAL_GUIDELINES, buildArtDirection, runQualityGate, composeBrandOverlay,
  generateDesignAsset, runSocialDesignCampaign, buildDesignReviewCaption, designReviewKeyboard,
  isImageDesignRequest, imageProviderReady, imageProviderStatus
};
