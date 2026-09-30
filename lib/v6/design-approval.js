/**
 * Telegram design approval callbacks: design_ok / design_rev / design_no
 * Wire into lib/telegram-command-center.js — no extra serverless endpoint.
 */
import { updateImageJob } from './image-jobs.js';

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
function supabaseUrl() { return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, ''); }
function serviceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function botToken() { return String(process.env.TELEGRAM_BOT_TOKEN || '').trim(); }

async function rest(path, options = {}) {
  const key = serviceKey();
  if (!key) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY required'), { status: 503 });
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.message || `Supabase ${response.status}`), { status: response.status });
  return data;
}

async function telegram(method, payload = {}) {
  const token = botToken();
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) return null;
  return data.result;
}

async function socialApprovalTarget() {
  const rows = await rest('integration_connections?provider=eq.telegram&select=metadata,status,enabled&limit=1').catch(() => []);
  const row = rows?.[0];
  const metadata = row?.metadata || {};
  const chatId = String(metadata.collaboration_chat_id || process.env.TELEGRAM_CHAT_ID || '').trim();
  const ownerId = String(metadata.collaboration_owner_user_id || metadata.paired_telegram_user_id || '').trim();
  return { configured: Boolean(chatId && ownerId), chat_id: chatId || null, owner_telegram_user_id: ownerId || null };
}

function parseDesignCallback(data) {
  const m = String(data || '').match(/^design_(ok|rev|no):([A-Za-z0-9_-]+)$/i);
  if (!m) return null;
  const map = { ok: 'approved', rev: 'needs_revision', no: 'rejected' };
  return { action: map[m[1].toLowerCase()], image_job_id: m[2] };
}

export async function handleDesignApprovalCallback(query) {
  const parsed = parseDesignCallback(query?.data);
  if (!parsed) return { handled: false };

  await telegram('answerCallbackQuery', {
    callback_query_id: query?.id,
    text: parsed.action === 'approved' ? '✅ تم الاعتماد' : parsed.action === 'needs_revision' ? '🔄 طلب تعديل' : '❌ تم الرفض',
    show_alert: false
  }).catch(() => {});

  const target = await socialApprovalTarget();
  const chatId = String(query?.message?.chat?.id || '');
  const actorId = String(query?.from?.id || '');
  const envAllowed = String(process.env.TELEGRAM_CHAT_ID || '').split(',').map((x) => x.trim()).filter(Boolean);
  const chatOk = chatId === target.chat_id || envAllowed.includes(chatId);
  const ownerOk = !target.owner_telegram_user_id || actorId === target.owner_telegram_user_id;

  if (!chatOk || !ownerOk) {
    await telegram('answerCallbackQuery', { callback_query_id: query?.id, text: 'هذا القرار متاح للمالك فقط.', show_alert: true }).catch(() => {});
    return { handled: true, ok: false, reason: 'owner_required' };
  }

  const patch = {
    approval_status: parsed.action,
    metadata: { decided_via: 'telegram', decided_by_telegram_user_id: actorId, decided_at: new Date().toISOString() }
  };
  if (parsed.action === 'needs_revision') {
    const existing = await rest(`image_jobs?image_job_id=eq.${encodeURIComponent(parsed.image_job_id)}&select=revision_count&limit=1`).catch(() => []);
    patch.revision_count = Number(existing?.[0]?.revision_count || 0) + 1;
  }
  await updateImageJob(parsed.image_job_id, patch);

  const label =
    parsed.action === 'approved'
      ? '✅ Approved — لن يُنشر تلقائياً حتى يُشغَّل مسار نشر مصرّح'
      : parsed.action === 'needs_revision'
        ? '🔄 Needs Revision — أعد الطلب مع ملاحظات التعديل'
        : '❌ Rejected';

  if (query?.message?.message_id && chatId) {
    const prevCaption = String(query?.message?.caption || query?.message?.text || '').slice(0, 800);
    await telegram('editMessageCaption', {
      chat_id: chatId, message_id: query.message.message_id,
      caption: `${prevCaption}\n\n${label}`, reply_markup: { inline_keyboard: [] }
    }).catch(async () => {
      await telegram('editMessageReplyMarkup', { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      await telegram('sendMessage', { chat_id: chatId, text: label, reply_parameters: { message_id: query.message.message_id } }).catch(() => {});
    });
  }

  return { handled: true, ok: true, action: parsed.action, image_job_id: parsed.image_job_id, auto_publish: false };
}

export default { handleDesignApprovalCallback };
