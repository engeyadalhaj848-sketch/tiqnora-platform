/**
 * Shared Telegram health/status helpers.
 * Source of truth: bot token + chat id from env OR integration_connections pair.
 */

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function allowedChats() {
  return new Set([
    String(process.env.TELEGRAM_CHAT_ID || '').trim(),
    ...String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map(x => x.trim())
  ].filter(Boolean));
}

async function telegramIntegration() {
  const key = serviceKey();
  if (!key) return null;
  try {
    const response = await fetch(
      `${supabaseUrl()}/rest/v1/integration_connections?provider=eq.telegram&select=*&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const rows = await response.json().catch(() => []);
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function telegramConfigurationStatus() {
  const tokenOk = Boolean(botToken());
  const envChat = [...allowedChats()][0] || null;
  let dbChat = null;
  try {
    const row = await telegramIntegration();
    dbChat = String(row?.metadata?.paired_chat_id || '').trim() || null;
  } catch {
    dbChat = null;
  }
  const chatId = envChat || dbChat;
  const paired = Boolean(chatId);
  return {
    configured: Boolean(tokenOk && paired),
    bot_token_configured: tokenOk,
    chat_id_configured: paired,
    chat_id_source: envChat ? 'env' : (dbChat ? 'database' : null),
    paired_in_database: Boolean(dbChat),
    paired,
    reachable: null,
    last_success: null,
    last_error: null
  };
}

export async function isTelegramOperational() {
  try {
    const status = await telegramConfigurationStatus();
    return Boolean(status.configured);
  } catch {
    return Boolean(botToken() && ([...allowedChats()][0]));
  }
}
