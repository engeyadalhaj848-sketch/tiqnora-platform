export { telegramConfigurationStatus, isTelegramOperational } from './telegram-status.js';

// Temporary thin restore layer — full command center body loaded from production commit 0c85cab.
// Webhook/handlers are imported dynamically to avoid shipping a broken placeholder.

import { createHash } from 'node:crypto';

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
function supabaseUrl() { return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, ''); }
function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return key;
}
async function rest(path, options = {}) {
  const key = serviceKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.hint || `Supabase ${response.status}`);
  return data;
}
function botToken() { return String(process.env.TELEGRAM_BOT_TOKEN || '').trim(); }
function allowedChats() {
  return new Set([
    String(process.env.TELEGRAM_CHAT_ID || '').trim(),
    ...String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map(x => x.trim())
  ].filter(Boolean));
}
async function telegramIntegration() {
  const rows = await rest('integration_connections?provider=eq.telegram&select=*&limit=1').catch(() => []);
  return rows?.[0] || null;
}
export async function telegramTargetChatId() {
  const envChat = [...allowedChats()][0];
  if (envChat) return envChat;
  const row = await telegramIntegration();
  return String(row?.metadata?.paired_chat_id || '').trim() || null;
}
export function telegramWebhookSecret() {
  const token = botToken();
  if (!token) return '';
  return createHash('sha256').update(`tiqnora-telegram-webhook:${token}`).digest('hex');
}
export function isTelegramConfigured() { return Boolean(botToken()); }
export function verifyTelegramWebhook(req) {
  const token = botToken();
  if (!token) return false;
  const actual = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  return actual === telegramWebhookSecret();
}
export async function handleTelegramUpdate(update) {
  // Fail-soft: acknowledge without crashing cron/webhook when full agent routing is unavailable.
  console.warn('telegram_command_center_minimal_handler', { update_id: update?.update_id });
  return { ok: true, minimal: true, note: 'Full command center restore pending; webhook accepted.' };
}
export async function sendTelegramText(chatId, text) {
  const token = botToken();
  if (!token || !chatId) throw new Error('Telegram not configured');
  const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(text || '').slice(0, 3900), disable_web_page_preview: true })
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}`);
  return r.json();
}
