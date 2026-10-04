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
  web_design: { mood: 'premium final social advertising campaign for professional web design and e-commerce, cinematic editorial art direction', subjects: ['real business transformation through a premium website', 'refined responsive web experience', 'e-commerce journey as a supporting visual', 'conversion-focused brand presence'], avoid: ['mockup-dominant composition', 'giant device showcase', 'generic wireframes', 'empty browser mockups', 'empty cards', 'placeholder labels', 'unfinished UI', 'prototype look', 'Headline text', 'Lorem ipsum', 'blue pill-only UI', 'cheap template look'] },
  ai_agents: { mood: 'premium violet AI orchestration, deep plum and magenta light, enterprise software workforce', subjects: ['agent nodes', 'workflow graph'], avoid: ['humanoid robots with faces', 'dominant blue palette'] },
  social_automation: { mood: 'editorial coral and pink social operations campaign, light premium composition', subjects: ['post grid abstract', 'automation arrows'], avoid: ['fake engagement counters', 'dominant blue palette'] },
  voice_agent: { mood: 'charcoal black and warm orange/copper voice automation campaign', subjects: ['voice waveform', 'call-routing workflow', 'phone conversation flow'], avoid: ['generic blue AI wallpaper'] },
  integrated_solutions: { mood: 'warm premium neutral business ecosystem with restrained multi-color accents', subjects: ['website', 'messaging', 'social', 'AI workflow ecosystem'], avoid: ['dominant blue palette', 'generic robot collage'] },
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

function inferCampaignHeadline(message = '', vertical = '') {
  const value = String(message || '');
  if (
    vertical === 'web_design' ||
    /تصميم\s*(?:ال)?مواقع|المتاجر\s*الإلكترونية|web\s*design|e-?commerce/i.test(value)
  ) {
    return 'تصميم المواقع والمتاجر الإلكترونية';
  }
  if (vertical === 'ai_agents') return 'وكلاء ذكاء اصطناعي يعملون لأجلك';
  if (vertical === 'social_automation') return 'أتمتة السوشيال ميديا بذكاء';
  if (vertical === 'crm') return 'إدارة العملاء والمتابعة بذكاء';
  const extracted = extractArabicHeadline(value);
  return extracted
    ? extracted.replace(/^صم[ّم]?\s+لي\s+(?:\d+\s+)?(?:صور?\s+)?(?:لحملة\s+)?/i, '').trim()
    : 'حلول Tiqnora AI الرقمية';
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
  const headlineAr =
    campaign?.headline_ar ||
    inferCampaignHeadline(message, vertical);
  const campaignTheme =
    campaign?.headline ||
    campaign?.name ||
    headlineAr ||
    'Tiqnora AI digital services';

  const formatDirection =
    format.key === 'story'
      ? 'Vertical cinematic composition with the visual hero concentrated in the upper 60%, leaving a generous lower safe zone for Arabic copy.'
      : format.key === 'portrait'
        ? 'Editorial portrait composition with one strong central advertising idea, cinematic depth and balanced negative space; do not center the composition around devices or browser frames.'
        : 'Bold square campaign composition with one dominant hero scene and a clear focal point.';

  const serviceScene =
    vertical === 'web_design'
      ? [
          'Create a FINAL SOCIAL MEDIA ADVERTISEMENT for a premium web-design and e-commerce service, not a UI concept, not a product mockup presentation and not a device showcase.',
          'The composition must read instantly as a finished agency campaign: one strong visual idea, cinematic business context, clear focal hierarchy and generous copy-safe space.',
          'Communicate professional websites through a believable branded digital experience integrated naturally into the scene. If a screen or device appears, it is only a supporting element and must contain rich, complete visual content rather than empty cards or wireframe blocks.',
          'Prefer real-looking photography, product imagery, editorial website sections and sophisticated commerce cues over abstract rectangles, dashboard panels or browser chrome.',
          'The final artwork must feel complete, persuasive and ready to publish on Instagram/Facebook/TikTok before any text overlay is added.',
          'Absolutely reject mockup-dominant layouts, giant floating screens, unfinished UI, empty cards, placeholder sections, generic dashboards, simplistic blue pills, stock templates or prototype aesthetics.'
        ].join(' ')
      : vertical === 'ai_agents'
        ? [
            'Create a premium business AI orchestration scene that unmistakably communicates a coordinated workforce of software agents handling real business workflows.',
            'Use one luminous orchestration core connected to distinct specialist workflow modules representing customer support, CRM follow-up, content operations, analytics and approvals through visual symbols and abstract interface structures only.',
            'Show clear task routing, handoffs, checkpoints and completed workflow progression with elegant dimensional cards, nodes and directional motion.',
            'The scene must feel operational and enterprise-grade, not like a generic neural-network wallpaper.',
            'No humanoid robots, robot faces, brains, random sci-fi circuitry, generic AI globes, or decorative node clutter.'
          ].join(' ')
        : vertical === 'whatsapp_automation'
          ? [
              'Create a premium conversational automation scene that clearly communicates business messaging workflows, lead follow-up and CRM progression.',
              'Feature a refined smartphone conversation interface made only of abstract message shapes, connected to branching automation steps, follow-up timeline cards, lead-status progression and a compact CRM workflow panel.',
              'Show the transformation from incoming conversations into organized routing, reminders and next actions through clean directional flow and visual hierarchy.',
              'Make it feel like a sophisticated customer-journey automation product, not a generic chat-app mockup.',
              'Do not use the official WhatsApp logo, fake message text, contact names, notification counts or engagement metrics.'
            ].join(' ')
          : `Create a premium commercial scene for ${vertical.replace(/_/g, ' ')}. Mood: ${guide.mood}. Subjects: ${guide.subjects.join(', ')}.`;

  const prompt = [
    'Award-quality commercial advertising artwork for Tiqnora AI, a premium Saudi technology and digital transformation brand.',
    `Campaign theme: ${campaignTheme}.`,
    serviceScene,
    `Scene palette: ${
      vertical === 'web_design'
        ? 'warm charcoal black, ivory and sophisticated gold/amber accents; midnight navy may appear only as a tiny secondary neutral and must not dominate'
        : vertical === 'whatsapp_automation'
          ? 'clean emerald green, white and dark graphite accents'
          : vertical === 'social_automation'
            ? 'coral, blush pink, magenta and warm off-white editorial accents'
            : vertical === 'voice_agent'
              ? 'charcoal black, warm orange, copper and soft cream highlights'
              : vertical === 'ai_agents'
                ? 'deep violet, purple, magenta and subtle black gradients'
                : vertical === 'integrated_solutions'
                  ? 'warm black, ivory, gold with restrained green, coral, violet and cyan accents'
                  : `midnight navy ${colors.midnight_navy || BRAND_COLORS.midnight_navy}, electric blue ${colors.electric_blue || BRAND_COLORS.electric_blue}, cyber cyan ${colors.cyber_cyan || BRAND_COLORS.cyber_cyan}`
    }. The official Tiqnora logo keeps its original blue/cyan/white brand colors; do not recolor the logo. Do not let blue dominate the surrounding campaign artwork.`,
    'Visual language: luxury technology editorial, cinematic studio lighting, premium commercial art direction, realistic depth, crisp materials, sophisticated composition, polished global-agency advertising quality.',
    'FINAL SOCIAL AD RULE: this must look like a finished paid-social creative at first glance. It must not look like a Figma frame, UI prototype, website mockup deck, device showcase, wireframe, template preview or unfinished concept.',
    formatDirection,
    `Final delivery target: ${format.label} (${format.width}x${format.height}).`,
    'ABSOLUTE TEXT RULE: render zero readable text, zero letters, zero words, zero numbers, zero logos, zero watermarks and zero placeholder labels anywhere in the generated artwork. In UI areas use only abstract bars, thumbnails, geometric blocks and image shapes.',
    'Specifically forbidden: Headline, Lorem ipsum, Menu, Shop, Buy, CTA labels, random characters, fake statistics, dollar signs.',
    'Do not generate the Tiqnora logo; it will be composited later from the official brand asset.',
    'No people, no hands, no clutter, no cheap collage, no generic WordPress/template screenshot.'
  ].join(' ');

  return {
    prompt,
    negative_prompt:
      'Headline, Lorem ipsum, readable text, typography, letters, words, numbers, Arabic text, English text, UI labels, logos, watermark, generic wireframe, empty cards, empty sections, generic dashboard, dominant device mockup, giant floating browser, Figma frame, UI prototype, unfinished interface, template preview, blue pill buttons, cheap template, blurry, cluttered collage, stock-photo look',
    vertical,
    format,
    prompt_version: 'tiqnora-art-v5-final-social-ad',
    overlay: {
      render_copy: campaign?.render_copy !== false,
      headline_ar: headlineAr,
      sub_ar:
        campaign?.sub_ar ||
        (vertical === 'web_design'
          ? 'تجربة رقمية احترافية • متجاوبة • مصممة بعناية'
          : 'حلول ذكية بهوية Tiqnora'),
      cta_ar: campaign?.cta_ar || getApprovedCTA(brand, 'ar') || 'ناقش مشروعك',
      brand_name: brand?.brand_name || 'Tiqnora AI',
      accent_color: vertical === 'web_design' ? '#F4D58D' : '#00D2FF',
      cta_color: vertical === 'web_design' ? '#D9A441' : '#0A5CFF'
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

/** Strict visual QA. Prefer Gemini vision, then OpenAI vision. Never silently
 * approve a commercial creative when the visual inspector failed to run. */
export async function runVisionQualityGate({ b64, campaign, format, expectedOverlay = {} }) {
  if (!b64) return { ok: false, skipped: true, reason: 'missing_image_for_vision' };

  const renderCopy = expectedOverlay.render_copy !== false;
  const extraText = Array.isArray(expectedOverlay.extra_text)
    ? expectedOverlay.extra_text.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const allowedText = renderCopy
    ? [
        expectedOverlay.headline_ar,
        expectedOverlay.sub_ar,
        expectedOverlay.cta_ar,
        expectedOverlay.brand_name,
        ...extraText
      ].filter(Boolean)
    : [expectedOverlay.brand_name, ...extraText].filter(Boolean);

  const vertical = String(campaign?.vertical || '').toLowerCase();
  const minimumScore = vertical === 'web_design' ? 92 : 88;
  const serviceRequirement =
    vertical === 'web_design'
      ? 'For website/e-commerce, the FINAL image must read as a finished social advertisement, not a mockup deck or UI prototype. The service should be obvious through a rich, complete and believable web/e-commerce experience, but devices/browser chrome must remain supporting elements. Reject dominant screen mockups, empty cards, placeholder sections, unfinished interfaces, fake browser layouts, template previews, weak visual storytelling or any composition that feels like a design presentation instead of an ad.'
      : vertical === 'ai_agents'
        ? 'For AI agents, the viewer must clearly perceive coordinated business-agent orchestration: specialist workflows, routing, handoffs, approvals and task progression. Reject generic neural-network wallpaper, robot imagery or decorative AI abstraction.'
        : vertical === 'whatsapp_automation'
          ? 'For messaging automation, the viewer must clearly perceive a conversation-to-workflow journey: messaging interface, routing, follow-up, timeline or CRM progression. Reject generic chat bubbles with no automation story.'
          : 'The visual must clearly communicate the requested service rather than generic technology.';

  const copyRule = renderCopy
    ? `Approved overlay text, if visible: ${JSON.stringify(allowedText)}. Reject clipped, malformed or poorly rendered approved copy.`
    : `This creative intentionally contains NO campaign headline, subtitle or CTA inside the artwork. Do not penalize missing campaign copy. The official Tiqnora logo may appear. Approved functional UI labels/messages, if visible: ${JSON.stringify(allowedText)}. Reject any other readable generated text, random characters, fake labels, numbers, gibberish or empty text/CTA placeholders.`;

  const prompt = [
    'You are the strict senior art director QA gate for Tiqnora AI.',
    'Inspect the FINAL composed marketing creative.',
    `Campaign: ${campaign?.name || campaign?.headline_ar || ''}.`,
    `Format: ${format?.width}x${format?.height}.`,
    copyRule,
    'Return JSON only: {"ok":boolean,"score":0-100,"failures":[string],"notes":string}.',
    `Reject if score is below ${minimumScore}.`,
    'Reject any unapproved/generated text or placeholder such as Headline, Lorem ipsum, Menu, Shop, random letters, gibberish, fake labels or fake statistics.',
    'Reject if the visual is merely a generic wireframe, empty UI mockup, simplistic dashboard, generic blue-pill layout, low-detail template, cheap stock look, or does not clearly communicate the requested service.',
    'Reject if more than roughly one third of the composition is dominated by browser/device chrome, empty cards, translucent UI boxes, blank panels or prototype-style interface framing.',
    'Reject any web-design creative that looks like a mockup showcase, portfolio presentation slide or unfinished website concept instead of a complete marketing post.',
    'Reject wrong or distorted Tiqnora logo, weak hierarchy, clutter, severe empty space, visual artifacts, off-brand colors, poor mobile readability or amateur composition.',
    serviceRequirement,
    'Only approve work that looks ready for a premium global digital agency campaign.'
  ].join(' ');

  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;

  if (geminiKey) {
    const models = [...new Set([
      process.env.GEMINI_VISION_MODEL,
      process.env.GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-2.5-flash'
    ].filter(Boolean))];

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
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
              generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
            })
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) continue;
        const text = (payload?.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || '')
          .join('');
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) continue;
        const json = JSON.parse(match[0]);
        return {
          ok: Boolean(json.ok) && Number(json.score || 0) >= minimumScore,
          score: Number(json.score || 0),
          failures: Array.isArray(json.failures) ? json.failures : [],
          notes: json.notes || '',
          provider: 'gemini',
          model,
          skipped: false
        };
      } catch {
        // Try next vision model / provider.
      }
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_VISION_MODEL || 'gpt-5.6-luna';
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: [{
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              {
                type: 'input_image',
                image_url: `data:image/png;base64,${b64}`,
                detail: 'high'
              }
            ]
          }],
          max_output_tokens: 500
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const text =
          payload.output_text ||
          (payload.output || [])
            .flatMap((item) => item.content || [])
            .map((part) => part.text || '')
            .join('');
        const match = String(text || '').match(/\{[\s\S]*\}/);
        if (match) {
          const json = JSON.parse(match[0]);
          return {
            ok: Boolean(json.ok) && Number(json.score || 0) >= minimumScore,
            score: Number(json.score || 0),
            failures: Array.isArray(json.failures) ? json.failures : [],
            notes: json.notes || '',
            provider: 'openai',
            model,
            skipped: false
          };
        }
      }
    } catch {
      // Fall through to fail-closed result.
    }
  }

  return {
    ok: false,
    skipped: true,
    reason: 'vision_qa_unavailable_or_failed',
    failures: ['visual_qa_not_completed']
  };
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

  if (overlay?.render_copy === false) {
    const composites = [];
    const logoBuf = await loadOfficialLogoBuffer();
    if (logoBuf) {
      const logoResized = await sharp(logoBuf).resize(132, 132, { fit: 'inside' }).png().toBuffer();
      composites.push({ input: logoResized, top: 42, left: 42 });
    }
    const out = composites.length
      ? await sharp(base).composite(composites).png().toBuffer()
      : base;
    return {
      b64: out.toString('base64'),
      composed: true,
      mime: 'image/png',
      logo_applied: Boolean(logoBuf),
      copy_rendered: false
    };
  }

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
      return `<text x="${Math.round(width / 2)}" y="${y}" text-anchor="middle" direction="rtl" xml:lang="ar" font-family="Noto Naskh Arabic, DejaVu Sans, sans-serif" font-size="${fontTitle}" font-weight="800" fill="#FFFFFF">${escapeXml(line)}</text>`;
    })
    .join('\n');
  titleY += titleLines.length * (fontTitle + 8) + 8;
  const subSvg = subLines
    .map((line, i) => {
      const y = titleY + i * (fontSub + 6);
      return `<text x="${Math.round(width / 2)}" y="${y}" text-anchor="middle" direction="rtl" xml:lang="ar" font-family="Noto Naskh Arabic, DejaVu Sans, sans-serif" font-size="${fontSub}" font-weight="600" fill="${overlay?.accent_color || '#F4D58D'}">${escapeXml(line)}</text>`;
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
  <rect x="${Math.round((width - 280) / 2)}" y="${height - 118}" rx="28" ry="28" width="280" height="54" fill="${overlay?.cta_color || '#D9A441'}"/>
  <text x="${Math.round(width / 2)}" y="${height - 82}" text-anchor="middle" direction="rtl" xml:lang="ar" font-family="Noto Naskh Arabic, DejaVu Sans, sans-serif" font-size="${fontCta}" font-weight="700" fill="#FFFFFF">${cta}</text>
  <rect x="${Math.round(width * 0.39)}" y="${height - 28}" width="${Math.round(width * 0.22)}" height="4" rx="2" fill="${overlay?.accent_color || '#F4D58D'}"/>
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
        : `${art.prompt} Variation ${attempt + 1}: create a materially different premium composition; remove every readable character or placeholder; stronger service-specific visual storytelling; richer depth; cleaner safe area; no generic wireframe; no mockup-dominant composition; make it unmistakably a finished social advertisement.`;
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
        format,
        expectedOverlay: art.overlay
      });
      lastGate = { ...structural, vision };
      attempts.push({ attempt, provider: artifact.provider, model: artifact.model, gate: lastGate });

      if (vision.ok !== true) {
        attempts.push({
          attempt,
          stage: 'vision_rejected',
          reason: vision.reason || 'quality_below_threshold',
          failures: vision.failures || []
        });
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
      inferCampaignHeadline(message, vertical) ||
      'تصميم المواقع والمتاجر الإلكترونية',
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
