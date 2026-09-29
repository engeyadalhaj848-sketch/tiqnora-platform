const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY is required.'), { status: 503 });
  return key;
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
  if (!response.ok) {
    throw Object.assign(new Error((data && (data.message || data.hint)) || ('Supabase ' + response.status)), {
      status: response.status
    });
  }
  return data;
}

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

async function telegram(method, payload = {}) {
  const token = botToken();
  if (!token) throw Object.assign(new Error('TELEGRAM_BOT_TOKEN is not configured.'), { status: 503 });
  const response = await fetch('https://api.telegram.org/bot' + encodeURIComponent(token) + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw Object.assign(new Error(data?.description || ('Telegram ' + method + ' failed')), { status: response.status });
  }
  return data?.result;
}

async function telegramIntegration() {
  const rows = await rest('integration_connections?provider=eq.telegram&select=metadata,status,enabled&limit=1').catch(() => []);
  return rows?.[0] || null;
}

export async function socialApprovalTarget() {
  const row = await telegramIntegration();
  const metadata = row?.metadata || {};
  const chatId = String(metadata.collaboration_chat_id || '').trim();
  const ownerTelegramUserId = String(metadata.collaboration_owner_user_id || metadata.paired_telegram_user_id || '').trim();
  if (!row?.enabled || row?.status !== 'connected' || !chatId || !ownerTelegramUserId) {
    return { configured: false, chat_id: null, owner_telegram_user_id: null };
  }
  return {
    configured: true,
    chat_id: chatId,
    owner_telegram_user_id: ownerTelegramUserId,
    title: metadata.collaboration_chat_title || null
  };
}

function cleanText(value, max = 1800) {
  const text = String(value || '').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function platformLabel(platform) {
  const map = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp'
  };
  return map[String(platform || '').toLowerCase()] || String(platform || '—');
}

async function loadApprovalBundle(organizationId, contentId) {
  const [items, variants, jobs] = await Promise.all([
    rest('content_items?id=eq.' + encodeURIComponent(contentId) + '&organization_id=eq.' + encodeURIComponent(organizationId) + '&select=*&limit=1'),
    rest('content_variants?content_id=eq.' + encodeURIComponent(contentId) + '&organization_id=eq.' + encodeURIComponent(organizationId) + '&select=*&order=platform.asc').catch(() => []),
    rest('publishing_queue?content_id=eq.' + encodeURIComponent(contentId) + '&organization_id=eq.' + encodeURIComponent(organizationId) + '&requires_approval=eq.true&select=*&order=created_at.asc').catch(() => [])
  ]);
  const item = items?.[0] || null;
  if (!item) throw Object.assign(new Error('content_not_found'), { status: 404 });
  return { item, variants: variants || [], jobs: jobs || [] };
}

function approvalKeyboard(contentId) {
  return {
    inline_keyboard: [[
      { text: '✅ اعتماد ونشر', callback_data: 'social_ok:' + contentId },
      { text: '❌ رفض', callback_data: 'social_no:' + contentId }
    ]]
  };
}

function previewText(bundle) {
  const { item, variants, jobs } = bundle;
  const platforms = [...new Set([
    ...jobs.map(x => x.platform),
    ...variants.map(x => x.platform),
    item.platform
  ].filter(Boolean))];

  const body = variants.find(v => v.platform === 'instagram')?.body ||
    variants.find(v => v.platform === 'facebook')?.body ||
    item.body ||
    '';
  const cta = variants.find(v => v.platform === 'instagram')?.cta || item.cta || '';
  const tags = variants.find(v => v.platform === 'instagram')?.hashtags || item.hashtags || [];

  return [
    '📣 منشور جديد بانتظار اعتمادك',
    '',
    'العنوان: ' + cleanText(item.title || 'بدون عنوان', 220),
    'المنصات: ' + (platforms.length ? platforms.map(platformLabel).join('، ') : '—'),
    '',
    cleanText(body, 1350),
    cta ? '\nCTA: ' + cleanText(cta, 220) : '',
    Array.isArray(tags) && tags.length ? '\n' + tags.slice(0, 5).join(' ') : '',
    '',
    'لن يتم نشر أي شيء حتى تضغط «اعتماد ونشر».'
  ].filter(Boolean).join('\n');
}

function approvalImage(bundle) {
  const { item, variants, jobs } = bundle;
  return String(
    jobs.find(x => x.metadata?.image_url)?.metadata?.image_url ||
    variants.find(x => x.metadata?.image_url)?.metadata?.image_url ||
    item.metadata?.image_url ||
    item.creative_brief?.image_url ||
    item.recommended_asset ||
    ''
  ).trim() || null;
}

async function markApprovalNotification(bundle, messageId, chatId) {
  const now = new Date().toISOString();
  await Promise.all((bundle.jobs || []).map(job =>
    rest('publishing_queue?id=eq.' + encodeURIComponent(job.id), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        metadata: {
          ...(job.metadata || {}),
          owner_approval_required: true,
          approval_channel: 'telegram_group',
          approval_chat_id: String(chatId),
          approval_message_id: Number(messageId) || null,
          approval_requested_at: now
        },
        updated_at: now
      })
    }).catch(() => null)
  ));
}

export async function notifySocialApproval({ organizationId, contentId }) {
  const target = await socialApprovalTarget();
  if (!target.configured) {
    return { ok: false, reason: 'telegram_group_not_configured' };
  }

  const bundle = await loadApprovalBundle(organizationId, contentId);
  const previousNotification = (bundle.jobs || []).find(job => job?.metadata?.approval_message_id);
  if (previousNotification) {
    return {
      ok: true,
      already_notified: true,
      chat_id: String(previousNotification.metadata?.approval_chat_id || target.chat_id),
      message_id: previousNotification.metadata?.approval_message_id || null,
      content_id: contentId,
      platforms: [...new Set((bundle.jobs || []).map(x => x.platform).filter(Boolean))]
    };
  }

  const text = previewText(bundle);
  const imageUrl = approvalImage(bundle);
  const replyMarkup = approvalKeyboard(contentId);
  let result;

  if (imageUrl) {
    result = await telegram('sendPhoto', {
      chat_id: target.chat_id,
      photo: imageUrl,
      caption: cleanText(text, 1000),
      reply_markup: replyMarkup
    }).catch(async () => telegram('sendMessage', {
      chat_id: target.chat_id,
      text: text + '\n\nالصورة: ' + imageUrl,
      disable_web_page_preview: false,
      reply_markup: replyMarkup
    }));
  } else {
    result = await telegram('sendMessage', {
      chat_id: target.chat_id,
      text,
      disable_web_page_preview: false,
      reply_markup: replyMarkup
    });
  }

  await markApprovalNotification(bundle, result?.message_id, target.chat_id);
  return {
    ok: true,
    chat_id: target.chat_id,
    message_id: result?.message_id || null,
    content_id: contentId,
    platforms: [...new Set((bundle.jobs || []).map(x => x.platform).filter(Boolean))]
  };
}

function callbackAction(data) {
  const match = String(data || '').match(/^social_(ok|no):([0-9a-f-]{36})$/i);
  if (!match) return null;
  return { action: match[1].toLowerCase() === 'ok' ? 'approve' : 'reject', content_id: match[2] };
}

async function answerCallback(id, text) {
  if (!id) return;
  await telegram('answerCallbackQuery', {
    callback_query_id: id,
    text,
    show_alert: false
  }).catch(() => {});
}

async function clearButtons(query) {
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  if (!chatId || !messageId) return;
  await telegram('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] }
  }).catch(() => {});
}

async function sendDecisionMessage(chatId, text, replyTo) {
  await telegram('sendMessage', {
    chat_id: chatId,
    text,
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {})
  }).catch(() => {});
}

export async function handleSocialApprovalCallback(query) {
  const parsed = callbackAction(query?.data);
  if (!parsed) return { handled: false };

  const target = await socialApprovalTarget();
  const chatId = String(query?.message?.chat?.id || '');
  const actorId = String(query?.from?.id || '');
  if (!target.configured || chatId !== target.chat_id || actorId !== target.owner_telegram_user_id) {
    await answerCallback(query?.id, 'هذا القرار متاح لمالك Tiqnora فقط.');
    return { handled: true, ok: false, reason: 'owner_required' };
  }

  const jobs = await rest(
    'publishing_queue?content_id=eq.' + encodeURIComponent(parsed.content_id) +
    '&organization_id=not.is.null&requires_approval=eq.true&select=*'
  ).catch(() => []);

  if (!jobs.length) {
    await answerCallback(query?.id, 'تم التعامل مع هذا المنشور مسبقاً.');
    await clearButtons(query);
    return { handled: true, ok: false, reason: 'already_decided' };
  }

  const organizationId = String(jobs[0].organization_id);
  const bundle = await loadApprovalBundle(organizationId, parsed.content_id);
  const now = new Date().toISOString();

  if (parsed.action === 'approve') {
    await rest('content_items?id=eq.' + encodeURIComponent(parsed.content_id) + '&organization_id=eq.' + encodeURIComponent(organizationId), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'approved',
        approved_at: now,
        metadata: {
          ...(bundle.item.metadata || {}),
          owner_approved_via: 'telegram_group',
          owner_approved_at: now,
          owner_telegram_user_id: actorId
        },
        updated_at: now
      })
    });

    await rest('content_variants?content_id=eq.' + encodeURIComponent(parsed.content_id) + '&organization_id=eq.' + encodeURIComponent(organizationId), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'approved', updated_at: now })
    }).catch(() => null);

    const approvedJobs = [];
    for (const job of jobs) {
      const rows = await rest('publishing_queue?id=eq.' + encodeURIComponent(job.id), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'queued',
          requires_approval: false,
          scheduled_at: now,
          error_code: null,
          error_message: null,
          metadata: {
            ...(job.metadata || {}),
            owner_approved_via: 'telegram_group',
            owner_approved_at: now,
            owner_telegram_user_id: actorId
          },
          updated_at: now
        })
      });
      if (rows?.[0]) approvedJobs.push(rows[0]);
    }

    await answerCallback(query?.id, '✅ تم الاعتماد. سيبدأ النشر الآن.');
    await clearButtons(query);
    await sendDecisionMessage(chatId, '✅ تم اعتماد المنشور من المالك. جاري إرساله للمنصات المحددة.', query?.message?.message_id);
    return { handled: true, ok: true, action: 'approve', content_id: parsed.content_id, jobs: approvedJobs };
  }

  await rest('content_items?id=eq.' + encodeURIComponent(parsed.content_id) + '&organization_id=eq.' + encodeURIComponent(organizationId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'changes_requested',
      approved_at: null,
      metadata: {
        ...(bundle.item.metadata || {}),
        owner_rejected_via: 'telegram_group',
        owner_rejected_at: now,
        owner_telegram_user_id: actorId
      },
      updated_at: now
    })
  });

  await rest('content_variants?content_id=eq.' + encodeURIComponent(parsed.content_id) + '&organization_id=eq.' + encodeURIComponent(organizationId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'changes_requested', updated_at: now })
  }).catch(() => null);

  for (const job of jobs) {
    await rest('publishing_queue?id=eq.' + encodeURIComponent(job.id), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'canceled',
        requires_approval: true,
        metadata: {
          ...(job.metadata || {}),
          owner_rejected_via: 'telegram_group',
          owner_rejected_at: now,
          owner_telegram_user_id: actorId
        },
        updated_at: now
      })
    }).catch(() => null);
  }

  await answerCallback(query?.id, '❌ تم رفض المنشور.');
  await clearButtons(query);
  await sendDecisionMessage(chatId, '❌ تم رفض المنشور. لن يتم نشره.', query?.message?.message_id);
  return { handled: true, ok: true, action: 'reject', content_id: parsed.content_id, jobs: [] };
}

export default {
  socialApprovalTarget,
  notifySocialApproval,
  handleSocialApprovalCallback
};
