/**
 * Video Designer chat hook — runs the real Veo pipeline and delivers the MP4 to Telegram.
 */

import { isVideoDesignRequest, runVideoGeneration, videoProviderStatus } from './video-designer.js';

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

async function sendVideoToTelegram({ chatId, result, caption }) {
  if (!chatId || !result?.output_b64) return { ok: false, reason: 'no_sendable_video' };
  const token = botToken();
  if (!token) return { ok: false, reason: 'telegram_not_configured' };

  const bytes = Buffer.from(result.output_b64, 'base64');
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('supports_streaming', 'true');
  form.append('caption', String(caption || '').slice(0, 1024));
  form.append('video', new Blob([bytes], { type: result.mime || 'video/mp4' }), `${result.video_job_id || 'tiqnora'}.mp4`);

  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendVideo`, {
    method: 'POST',
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    return { ok: false, reason: 'telegram_send_failed', error: String(data?.description || response.status).slice(0, 300) };
  }
  return { ok: true, telegram_message_id: data?.result?.message_id || null, chat_id: String(chatId) };
}

export async function tryHandleVideoDesignerChat({ agent, message, chatId = null }) {
  const slug = String(agent?.slug || agent?.key || '').toLowerCase();
  if (slug !== 'video-designer' && slug !== 'video') return null;
  if (!isVideoDesignRequest(message)) return null;

  const provider = videoProviderStatus();
  if (!provider.configured) {
    return {
      text: [
        '⚠️ مصمم الفيديو جاهز منطقيًا لكن مزود الفيديو غير مهيأ.',
        'المطلوب: GEMINI_API_KEY أو GOOGLE_AI_API_KEY في Vercel.',
        `النموذج الافتراضي: ${provider.model}`,
        'لن يتم الادعاء بإنتاج فيديو قبل وجود ملف MP4 فعلي.'
      ].join('\n'),
      provider: 'video-pipeline',
      model: provider.model,
      meta: { video_pipeline: true, configured: false }
    };
  }

  try {
    const result = await runVideoGeneration({
      message,
      organizationId: agent?.organization_id || null,
      aspectRatio: '9:16',
      durationSeconds: 8,
      resolution: '720p'
    });

    const delivery = await sendVideoToTelegram({
      chatId,
      result,
      caption: [
        '🎬 Tiqnora Video Designer — Draft فعلي',
        `${result.duration_seconds}s · ${result.resolution} · ${result.aspect_ratio}`,
        `${result.provider}/${result.model}`,
        'بانتظار اعتماد المالك — لا نشر تلقائي.'
      ].join('\n')
    });

    return {
      text: [
        '🎬 مصمم الفيديو — إنتاج فعلي',
        `الحالة: ${result.generation_status}`,
        `المدة: ${result.duration_seconds} ثوانٍ`,
        `المقاس: ${result.aspect_ratio} / ${result.resolution}`,
        `المزود: ${result.provider} / ${result.model}`,
        `التخزين: ${result.output_storage_path ? 'تم حفظ نسخة خاصة' : 'تعذر حفظ النسخة الخاصة'}`,
        delivery.ok ? '✅ تم إرسال معاينة MP4 الفعلية إلى مجموعة Telegram.' : `⚠️ الفيديو تولد لكن تعذر إرساله إلى Telegram: ${delivery.reason || 'unknown'}`,
        'الحالة: Draft / pending_approval — لا نشر تلقائي.'
      ].join('\n'),
      provider: result.provider,
      model: result.model,
      meta: {
        video_pipeline: true,
        configured: true,
        video_job_id: result.video_job_id,
        generation_status: result.generation_status,
        duration_seconds: result.duration_seconds,
        resolution: result.resolution,
        aspect_ratio: result.aspect_ratio,
        output_storage_path: result.output_storage_path,
        telegram: delivery
      }
    };
  } catch (error) {
    const processing = error?.code === 'VIDEO_GENERATION_TIMEOUT';
    return {
      text: processing
        ? [
            '⏳ بدأ توليد الفيديو فعليًا لكن Veo ما زال يعالجه بعد نافذة الانتظار الحالية.',
            `Video Job: ${error.video_job_id || '—'}`,
            `Operation: ${error.operation_name || '—'}`,
            'لم يتم اعتبار الفيديو مسلّمًا بعد.'
          ].join('\n')
        : [
            '⚠️ فشل توليد الفيديو الفعلي.',
            `السبب: ${String(error?.message || error).slice(0, 500)}`,
            'لم يتم إنشاء ملف فيديو، ولن يتم الادعاء بعكس ذلك.'
          ].join('\n'),
      provider: 'video-pipeline',
      model: provider.model,
      meta: {
        video_pipeline: true,
        configured: true,
        video_job_id: error?.video_job_id || null,
        operation_name: error?.operation_name || null,
        generation_status: processing ? 'processing' : 'failed',
        error_code: error?.code || 'VIDEO_GENERATION_FAILED'
      }
    };
  }
}

export default { tryHandleVideoDesignerChat };
