/**
 * Image Designer chat hook — lives under lib/ (NOT api/) to keep Vercel Hobby function count at 11.
 */

import {
  isImageDesignRequest,
  imageProviderReady,
  runSocialDesignCampaign,
  imageProviderStatus
} from './image-designer.js';
import { deliverCampaignDesignReview } from './design-telegram.js';

export async function tryHandleImageDesignerChat({ agent, message, user, token }) {
  const slug = String(agent?.slug || agent?.key || '').toLowerCase();
  if (slug !== 'image-designer' && slug !== 'design_agent' && slug !== 'design') {
    return null;
  }
  if (!isImageDesignRequest(message)) {
    return null;
  }

  if (!imageProviderReady()) {
    const status = imageProviderStatus();
    return {
      text: [
        '⚠️ مزود توليد الصور غير مهيأ حالياً.',
        '',
        'المطلوب في Vercel Environment Variables (واحد على الأقل):',
        `- OPENAI_API_KEY ${status.openai.configured ? '✅' : '❌'}`,
        `- GEMINI_API_KEY ${status.gemini.configured ? '✅' : '❌'}`,
        '',
        'بعد إضافة المفتاح أعد نشر Production ثم أعد طلب التصميم.',
        'لن أكتفي بإرجاع Prompt فقط عندما يكون المزود مهيأ.'
      ].join('\n'),
      provider: 'image-pipeline',
      model: 'none',
      meta: { image_pipeline: true, configured: false }
    };
  }

  const campaignResult = await runSocialDesignCampaign({
    message,
    campaign: { name: message.slice(0, 80), platform: 'instagram' },
    organizationId: agent?.organization_id || null
  });

  let telegram = null;
  try {
    telegram = await deliverCampaignDesignReview(campaignResult);
  } catch (err) {
    telegram = { ok: false, reason: 'telegram_error', error: String(err.message || '').slice(0, 300) };
  }

  const lines = [
    '🎨 **وكيل مصمم الصور — إنتاج فعلي**',
    '',
    `الحملة: ${campaignResult.campaign?.name || '—'}`,
    `النجاح: ${campaignResult.succeeded_count}/${campaignResult.assets?.length || 0}`,
    `الحالة: ${campaignResult.approval_status} (لا نشر تلقائي)`,
    ''
  ];

  for (const asset of campaignResult.assets || []) {
    lines.push(
      `• ${asset.format?.key || '?'} ${asset.format?.width}×${asset.format?.height}: ${asset.generation_status}` +
        (asset.provider ? ` [${asset.provider}/${asset.model}]` : '') +
        (asset.error ? ` — ${asset.error}` : '')
    );
  }

  lines.push('');
  if (telegram?.ok) {
    lines.push(`✅ تم إرسال معاينات الصور إلى مجموعة Telegram (chat ${telegram.chat_id}).`);
    lines.push('استخدم أزرار: اعتماد / تعديل / رفض على كل صورة.');
  } else {
    lines.push(`⚠️ لم يتم الإرسال إلى Telegram: ${telegram?.reason || telegram?.error || 'غير مهيأ'}`);
    lines.push('الصور وُلدت داخلياً وبانتظار الاعتماد (pending_approval).');
  }

  if (campaignResult.succeeded_count === 0) {
    lines.push('');
    lines.push('فشل التوليد من جميع المزودات. راجع سجلات image_jobs ورسائل الخطأ أعلاه.');
  }

  return {
    text: lines.join('\n'),
    provider: 'image-pipeline',
    model: campaignResult.assets?.[0]?.model || 'multi',
    meta: {
      image_pipeline: true,
      campaign: campaignResult.campaign,
      assets: (campaignResult.assets || []).map((a) => ({
        image_job_id: a.image_job_id,
        format: a.format,
        generation_status: a.generation_status,
        provider: a.provider,
        model: a.model,
        approval_status: a.approval_status,
        telegram_message_id: a.telegram_message_id || null,
        output_url: a.output_url || null,
        has_image: Boolean(a.output_b64 || a.output_url)
      })),
      telegram
    }
  };
}

export default { tryHandleImageDesignerChat };
