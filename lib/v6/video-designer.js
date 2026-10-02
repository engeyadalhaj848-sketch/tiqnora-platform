/**
 * Tiqnora Video Designer — real Veo draft generation.
 */

import { randomUUID } from 'node:crypto';
import { generateVideo, videoProviderStatus } from '../ai/video-provider.js';
import { buildBrandProfile, getDefaultBrandProfile } from './brand-brain.js';
import { insertVideoJob, updateVideoJob, uploadVideoAsset } from './video-jobs.js';

export function isVideoDesignRequest(message = '') {
  return /(فيديو|ريلز|ريل|تيكتوك|motion|video|reel|ugc|موشن|انيميشن|تحريك)/i.test(String(message || ''));
}

function buildVideoPrompt(message, brandProfile) {
  const brand = buildBrandProfile(brandProfile || getDefaultBrandProfile());
  const colors = brand.visual_identity?.colors || {};
  return [
    'Create a premium vertical technology campaign video draft for Tiqnora AI.',
    'Format: 9:16 portrait, polished UI motion, cyber-luxury visual language, clean and professional.',
    `Brand colors: midnight navy ${colors.midnight_navy || '#060B1E'}, electric blue ${colors.electric_blue || '#0A5CFF'}, cyber cyan ${colors.cyber_cyan || '#00D2FF'}, white ${colors.pure_white || '#FFFFFF'}.`,
    'Subject: responsive website and e-commerce UI, mobile-first browsing, smooth checkout and contact flow, WhatsApp/CRM/automation connections visualized as elegant abstract UI nodes.',
    'Avoid stock footage, fake testimonials, fake metrics, fake customer logos, prices, financial claims, and unreadable interface clutter.',
    'Do not depend on generated typography for the core message; prioritize strong motion visuals and safe empty areas for captions added in post.',
    'Camera/motion: cinematic macro UI transitions, device mockup movement, subtle depth, fast but premium pacing.',
    'Audio: modern restrained technology sound design; no copyrighted music.',
    `Owner brief: ${String(message || '').slice(0, 1800)}`
  ].join('\n');
}

export async function runVideoGeneration({
  message,
  organizationId = null,
  brandProfile = null,
  aspectRatio = '9:16',
  durationSeconds = 8,
  resolution = '720p',
  campaignName = 'Tiqnora Website Growth'
} = {}) {
  const status = videoProviderStatus();
  const videoJobId = `vid_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await insertVideoJob({
    video_job_id: videoJobId,
    organization_id: organizationId,
    campaign_name: campaignName,
    provider: status.provider,
    model: status.model,
    generation_status: 'running',
    aspect_ratio: aspectRatio,
    resolution,
    duration_seconds: durationSeconds,
    approval_status: 'pending_approval',
    metadata: { source: 'video_designer_runtime', owner_approval_required: true }
  });

  try {
    const generated = await generateVideo({
      prompt: buildVideoPrompt(message, brandProfile),
      aspectRatio,
      durationSeconds,
      resolution
    });

    const storage = await uploadVideoAsset({
      videoJobId,
      bytes: generated.bytes,
      mime: generated.mime || 'video/mp4'
    });

    const result = {
      video_job_id: videoJobId,
      agent_id: 'video-designer',
      provider: generated.provider,
      model: generated.model,
      operation_name: generated.operation_name,
      generation_status: 'succeeded',
      aspect_ratio: generated.aspect_ratio,
      resolution: generated.resolution,
      duration_seconds: generated.duration_seconds,
      mime: generated.mime,
      output_b64: generated.bytes.toString('base64'),
      output_storage_path: storage.output_storage_path || null,
      output_url: storage.output_url || null,
      approval_status: 'pending_approval',
      created_at: new Date().toISOString()
    };

    await updateVideoJob(videoJobId, {
      provider: result.provider,
      model: result.model,
      operation_name: result.operation_name,
      generation_status: 'succeeded',
      output_storage_path: result.output_storage_path,
      output_url: result.output_url,
      approval_status: 'pending_approval',
      metadata: {
        source: 'video_designer_runtime',
        owner_approval_required: true,
        storage_ok: Boolean(storage.ok)
      }
    });

    return result;
  } catch (error) {
    await updateVideoJob(videoJobId, {
      generation_status: error?.code === 'VIDEO_GENERATION_TIMEOUT' ? 'processing' : 'failed',
      operation_name: error?.operation_name || null,
      error_code: error?.code || 'VIDEO_GENERATION_FAILED',
      error_message: String(error?.message || error).slice(0, 700),
      approval_status: error?.code === 'VIDEO_GENERATION_TIMEOUT' ? 'pending_approval' : 'failed'
    });
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { video_job_id: videoJobId });
  }
}

export { videoProviderStatus };

export default { isVideoDesignRequest, runVideoGeneration, videoProviderStatus };
