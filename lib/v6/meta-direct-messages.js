const WINDOW_MS = 24 * 60 * 60 * 1000;
const HUMAN_MS = 2 * 60 * 60 * 1000;

export function metaDirectMessageDecision(event, connection, history = [], now = Date.now()) {
  if (!['facebook', 'instagram'].includes(event?.platform) || event.event_type !== 'message.received') return {reason:'unsupported_event'};
  const sender = String(event.author_external_id || '');
  const account = String(connection?.external_account_id || '');
  const at = Date.parse(event.occurred_at || '');
  if (!sender || !account || connection?.status !== 'active' || connection.platform !== event.platform || (event.account_external_id && event.account_external_id !== account)) return {reason:'invalid_connection'};
  if (sender === account || event.raw_payload?.messaging?.message_type === 'message.echo') return {reason:'self_message'};
  if (!Number.isFinite(at) || now - at >= WINDOW_MS || at > now + 300000) return {reason:'outside_session_window'};
  const content = String(event.content || '').trim();
  if (!content || /^\[[^\]]+\]$/.test(content)) return {reason:'unsupported_content'};
  if (history.length >= 100) return {reason:'history_truncated'};
  const rows = [...history, {...event, received_at:event.received_at || event.occurred_at}].sort((a,b)=>String(b.received_at || '').localeCompare(String(a.received_at || '')));
  const control = rows.find(r=>r.event_type === 'message.received' && /(?:stop|unsubscribe|resume automation|لا اريد رد|لا أريد رد|وقف الرد|إيقاف الرد|ايقاف الرد|استئناف الرد|موظف|خدمة عملاء|human agent)/i.test(String(r.content || '')));
  if (control && !/(?:resume automation|استئناف الرد)/i.test(control.content || '')) return {reason:'human_requested'};
  if (history.some(r=>r.event_type === 'message.sent' && r.raw_payload?.mode !== 'auto_reply' && Date.parse(r.occurred_at || r.received_at || '') > now - HUMAN_MS)) return {reason:'human_takeover'};
  return {path: `${account}/messages`, payload: {recipient:{id:sender}, message:{text:''}, ...(event.platform === 'facebook' ? {messaging_type:'RESPONSE'} : {})}};
}
