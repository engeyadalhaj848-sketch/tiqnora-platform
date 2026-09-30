/**
 * Telegram delivery for Image Designer previews (photos, not prompts).
 */
import { buildDesignReviewCaption, designReviewKeyboard } from './image-designer.js';
import { updateImageJob } from './image-jobs.js';

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

async function telegram(method, payload = {}, isForm = false) {
  const token = botToken();
  if (!token) {
    const err = new Error('TELEGRAM_BOT_TOKEN is not configured');
    err.status = 503;
    throw err;
  }
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`;
  const response = isForm
    ? await fetch(url, { method: 'POST', body: payload })
    : await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw Object.assign(new Error(data?.description || `Telegram ${method} failed`), {
      status: response.status
    });
  }
  return data.result;
}

export async function resolveDesignReviewChatId() {
  const fallback = String(process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_DESIGN_CHAT_ID || '').trim();
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    if (key && base) {
      const res = await fetch(
        `${base}/rest/v1/integration_connections?provider=eq.telegram&select=metadata,status,enabled&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json().catch(() => []);
      const meta = rows?.[0]?.metadata || {};
      const chatId = String(meta.collaboration_chat_id || '').trim();
      if (rows?.[0]?.enabled && rows?.[0]?.status === 'connected' && chatId) return chatId;
    }
  } catch { /* fall through */ }
  return fallback || null;
}

export async function sendDesignPreviewToTelegram({ chatId, asset, caption, replyMarkup }) {
  if (!chatId) return { ok: false, reason: 'no_chat_id' };
  if (!asset?.output_b64 && !asset?.output_url) return { ok: false, reason: 'no_image' };
  const finalCaption = (caption || '').slice(0, 1024);

  if (asset.output_url && !asset.output_url.includes('localhost')) {
    try {
      const result = await telegram('sendPhoto', {
        chat_id: chatId,
        photo: asset.output_url,
        caption: finalCaption,
        reply_markup: replyMarkup
      });
      return { ok: true, telegram_message_id: result?.message_id || null, chat_id: chatId };
    } catch {
      /* fall back to bytes */
    }
  }

  if (asset.output_b64) {
    const bytes = Buffer.from(asset.output_b64, 'base64');
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', finalCaption);
    form.append(
      'photo',
      new Blob([bytes], { type: asset.mime || 'image/png' }),
      `design_${asset.image_job_id || 'x'}.png`
    );
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
    const result = await telegram('sendPhoto', form, true);
    return { ok: true, telegram_message_id: result?.message_id || null, chat_id: chatId };
  }

  return { ok: false, reason: 'no_sendable_image' };
}

export async function deliverCampaignDesignReview(campaignResult) {
  const chatId = await resolveDesignReviewChatId();
  if (!chatId) {
    return {
      ok: false,
      reason: 'telegram_not_configured',
      message: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (or pair collaboration group).'
    };
  }

  const deliveries = [];
  for (const asset of campaignResult.assets || []) {
    if (asset.generation_status !== 'succeeded') {
      deliveries.push({
        image_job_id: asset.image_job_id,
        ok: false,
        reason: asset.generation_status,
        error: asset.error
      });
      continue;
    }
    const caption = buildDesignReviewCaption({
      campaign: campaignResult.campaign,
      format: asset.format,
      version: (asset.revision_count || 0) + 1,
      notes: `provider=${asset.provider} model=${asset.model} logo=${asset.logo_applied}`
    });
    try {
      // eslint-disable-next-line no-await-in-loop
      const sent = await sendDesignPreviewToTelegram({
        chatId,
        asset,
        caption,
        replyMarkup: designReviewKeyboard(asset.image_job_id)
      });
      deliveries.push({ image_job_id: asset.image_job_id, ...sent, format: asset.format?.key });
      asset.telegram_message_id = sent.telegram_message_id;
      // eslint-disable-next-line no-await-in-loop
      await updateImageJob(asset.image_job_id, {
        telegram_message_id: sent.telegram_message_id,
        telegram_chat_id: String(chatId),
        approval_status: 'pending_approval'
      });
    } catch (err) {
      deliveries.push({
        image_job_id: asset.image_job_id,
        ok: false,
        reason: 'telegram_send_failed',
        error: String(err.message || '').slice(0, 300)
      });
    }
  }

  return {
    ok: deliveries.some((d) => d.ok),
    chat_id: chatId,
    deliveries,
    approval_status: 'pending_approval'
  };
}

export default { resolveDesignReviewChatId, sendDesignPreviewToTelegram, deliverCampaignDesignReview };
