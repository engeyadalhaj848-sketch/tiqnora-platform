// Delegated staff can reply only to a visible incoming event. They cannot choose
// an account, recipient, template, proposal, or another organization's event.
export function validWorkspaceReply(body) {
  return body && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).every(key => ['event_id', 'message', 'text'].includes(key))
    && typeof body.event_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.event_id)
    && typeof (body.message ?? body.text) === 'string'
    && (body.message ?? body.text).trim().length > 0
    && (body.message ?? body.text).length <= 4096;
}

export async function workspaceReplyContext({ base, apikey, token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${base}/rest/v1/rpc/rose_social_context`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_permission: 'conversations.write' })
  });
  if (!response.ok) return null;
  const context = await response.json();
  return context?.owner && context?.organizationId ? context : null;
}

export async function visibleWorkspaceReplyEvent({ base, apikey, token, eventId, organizationId, fetchImpl = fetch }) {
  const response = await fetchImpl(`${base}/rest/v1/social_events?id=eq.${encodeURIComponent(eventId)}&organization_id=eq.${encodeURIComponent(organizationId)}&event_type=in.(message.received,comment.created)&select=id&limit=1`, {
    headers: { Authorization: `Bearer ${token}`, apikey }
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 && rows[0].id === eventId;
}

