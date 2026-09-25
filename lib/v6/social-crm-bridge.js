/**
 * Tiqnora V6 — Social Inbox -> CRM persistence bridge.
 * Server-side only. Reuses Inbox CRM + Lead Enrichment and performs idempotent writes.
 */
import { analyzeInboxEvent, normalizePhone, normalizeEmail } from './inbox-crm.js';
import { enrichLead } from './lead-enrichment.js';
import { buildSalesPlaybookResult } from './sales-playbooks.js';

const ACTIONABLE_TYPES = new Set(['message.received', 'comment.created']);
const DELIVERY_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

export function isDeliveryStatusEvent(event = {}) {
  const match = String(event.event_type || '').match(/^message\.status\.(sent|delivered|read|failed)$/);
  return Boolean(match && DELIVERY_STATUSES.has(match[1]));
}

function deliveryStatus(event = {}) {
  const match = String(event.event_type || '').match(/^message\.status\.(sent|delivered|read|failed)$/);
  return match?.[1] || null;
}

function uniqueById(rows = []) {
  const map = new Map();
  for (const row of rows || []) if (row?.id) map.set(row.id, row);
  return [...map.values()];
}

function mergeJson(a, b) {
  return { ...(a || {}), ...(b || {}) };
}

function withoutNulls(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}

function safeName(event, contact) {
  return contact?.name || contact?.phone || contact?.username || `${event.platform || 'social'} contact`;
}

export function isCrmActionableEvent(event = {}) {
  if (!ACTIONABLE_TYPES.has(String(event.event_type || ''))) return false;
  if (!String(event.content || '').trim()) return false;
  if (event.raw_payload?.kind === 'app_echo') return false;
  if (
    event.author_external_id &&
    event.account_external_id &&
    String(event.author_external_id) === String(event.account_external_id)
  ) return false;
  return true;
}

export function buildExternalThreadId(event = {}) {
  const platform = String(event.platform || 'unknown').toLowerCase();
  const author = String(event.author_external_id || '').trim();
  const parent = String(event.external_parent_id || '').trim();
  const eid = String(event.external_event_id || '').trim();

  if (String(event.event_type || '').startsWith('comment.')) {
    return `comment:${parent || 'root'}:${author || eid || 'unknown'}`;
  }
  if (String(event.event_type || '').startsWith('message.')) {
    return `dm:${author || parent || eid || 'unknown'}`;
  }
  return `${platform}:${author || parent || eid || 'unknown'}`;
}

function rawValue(event, ...paths) {
  for (const path of paths) {
    let cur = event?.raw_payload;
    for (const part of path) cur = cur?.[part];
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return null;
}

export function socialEventToInboxEvent(event = {}) {
  const platform = String(event.platform || 'unknown').toLowerCase();
  const externalId = event.author_external_id ? String(event.author_external_id) : null;
  const generic = event.raw_payload?.value || {};
  const phone =
    platform === 'whatsapp'
      ? normalizePhone(externalId)
      : normalizePhone(
          generic.phone ||
          generic.whatsapp ||
          rawValue(event, ['value', 'contact', 'phone']) ||
          rawValue(event, ['value', 'message', 'phone'])
        );
  const email = normalizeEmail(
    generic.email ||
    rawValue(event, ['value', 'contact', 'email'])
  );
  const username =
    generic.username ||
    generic.author?.username ||
    rawValue(event, ['value', 'contact', 'profile', 'username']) ||
    null;

  return {
    platform,
    external_user_id: externalId,
    external_thread_id: buildExternalThreadId(event),
    external_message_id: `${platform}:${String(event.external_event_id || '')}`,
    author_name: event.author_name || null,
    phone,
    email,
    username,
    content: event.content || null,
    received_at: event.occurred_at || new Date().toISOString(),
    metadata: {
      social_event_id: event.id || null,
      external_parent_id: event.external_parent_id || null,
      permalink: event.permalink || null,
      account_external_id: event.account_external_id || null,
      adapter: event.raw_payload?.adapter || null
    }
  };
}

async function tryRest(rest, path, fallback = []) {
  try {
    const out = await rest(path);
    return Array.isArray(out) ? out : fallback;
  } catch {
    return fallback;
  }
}

async function loadLeadCandidates(rest, organizationId, inboxEvent) {
  const rows = [];
  const orgGuard = `or=(organization_id.eq.${organizationId},organization_id.is.null)`;

  if (inboxEvent.phone) {
    rows.push(...await tryRest(rest,
      `leads?${orgGuard}&phone=eq.${encodeURIComponent(inboxEvent.phone)}&select=*&limit=20`));
    rows.push(...await tryRest(rest,
      `leads?${orgGuard}&whatsapp=eq.${encodeURIComponent(inboxEvent.phone)}&select=*&limit=20`));
  }
  if (inboxEvent.email) {
    rows.push(...await tryRest(rest,
      `leads?${orgGuard}&email=eq.${encodeURIComponent(inboxEvent.email)}&select=*&limit=20`));
  }
  if (inboxEvent.external_user_id) {
    rows.push(...await tryRest(rest,
      `leads?${orgGuard}&custom_fields->>external_user_id=eq.${encodeURIComponent(inboxEvent.external_user_id)}&custom_fields->>platform=eq.${encodeURIComponent(inboxEvent.platform)}&select=*&limit=20`));
  }
  return uniqueById(rows);
}

async function findContact(rest, organizationId, contact) {
  const org = encodeURIComponent(organizationId);
  const checks = [];
  if (contact.phone) {
    checks.push(`crm_contacts?organization_id=eq.${org}&phone=eq.${encodeURIComponent(contact.phone)}&select=*&limit=1`);
    checks.push(`crm_contacts?organization_id=eq.${org}&whatsapp=eq.${encodeURIComponent(contact.phone)}&select=*&limit=1`);
  }
  if (contact.email) {
    checks.push(`crm_contacts?organization_id=eq.${org}&email=eq.${encodeURIComponent(contact.email)}&select=*&limit=1`);
  }
  if (contact.external_user_id) {
    checks.push(
      `crm_contacts?organization_id=eq.${org}&metadata->>external_user_id=eq.${encodeURIComponent(contact.external_user_id)}&metadata->>platform=eq.${encodeURIComponent(contact.platform)}&select=*&limit=1`
    );
  }
  for (const path of checks) {
    const rows = await tryRest(rest, path);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function upsertContact(rest, organizationId, event, analysis) {
  if (analysis.intent === 'spam') return null;
  const contact = analysis.contact || {};
  let row = await findContact(rest, organizationId, contact);
  const channel = {
    external_user_id: contact.external_user_id || null,
    username: contact.username || null
  };

  if (row) {
    const metadata = mergeJson(row.metadata, {
      platform: contact.platform || row.metadata?.platform || null,
      external_user_id: contact.external_user_id || row.metadata?.external_user_id || null,
      username: contact.username || row.metadata?.username || null,
      channels: {
        ...(row.metadata?.channels || {}),
        [contact.platform || 'unknown']: channel
      }
    });
    const patch = withoutNulls({
      full_name: contact.name || row.full_name,
      phone: contact.phone || row.phone,
      whatsapp: contact.platform === 'whatsapp' ? (contact.phone || row.whatsapp) : row.whatsapp,
      email: contact.email || row.email,
      metadata,
      updated_at: new Date().toISOString()
    });
    const updated = await rest(`crm_contacts?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    return updated?.[0] || { ...row, ...patch };
  }

  const created = await rest('crm_contacts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      full_name: safeName(event, contact),
      phone: contact.phone || null,
      whatsapp: contact.platform === 'whatsapp' ? contact.phone || null : null,
      email: contact.email || null,
      metadata: {
        platform: contact.platform || null,
        external_user_id: contact.external_user_id || null,
        username: contact.username || null,
        channels: { [contact.platform || 'unknown']: channel }
      }
    })
  });
  return created?.[0] || null;
}

function mergedLeadCustomFields(existing, analysis, enrichment, playbook) {
  const base = mergeJson(existing?.custom_fields, analysis.lead_payload?.custom_fields);
  return {
    ...base,
    external_user_id: analysis.contact?.external_user_id || base.external_user_id || null,
    username: analysis.contact?.username || base.username || null,
    platform: analysis.contact?.platform || base.platform || null,
    detected_intent: analysis.intent,
    service_interest: analysis.service_interest || [],
    qualification: analysis.qualification || {},
    vertical_pack: enrichment.pack,
    recommended_services: enrichment.services,
    missing_qualification: enrichment.missing,
    next_best_action: enrichment.next_best_action,
    sales_playbook: playbook || base.sales_playbook || null,
    should_create_opportunity: Boolean(analysis.crm?.should_create_opportunity)
  };
}

async function createOrUpdateLead(rest, organizationId, event, analysis, enrichment, playbook, contactId) {
  const matched = analysis.existing_match?.matched && analysis.existing_match?.auto_merge
    ? analysis.existing_match.candidate
    : null;
  const now = event.occurred_at || new Date().toISOString();

  if (matched) {
    const salesLike = ['sales', 'quote_request', 'booking'].includes(analysis.intent);
    const patch = withoutNulls({
      organization_id: organizationId,
      contact_id: contactId || matched.contact_id || null,
      contact_name: analysis.contact?.name || matched.contact_name || matched.name,
      phone: analysis.contact?.phone || matched.phone,
      whatsapp: analysis.contact?.platform === 'whatsapp'
        ? (analysis.contact?.phone || matched.whatsapp)
        : matched.whatsapp,
      email: analysis.contact?.email || matched.email,
      last_contact_at: now,
      updated_at: new Date().toISOString(),
      ...(salesLike ? {
        industry: enrichment.vertical?.id !== 'general' ? enrichment.vertical?.id : (matched.industry || null),
        pipeline_stage: matched.pipeline_stage || analysis.crm?.suggested_stage || 'contacted',
        opportunity_score: Math.max(Number(matched.opportunity_score || 0), Number(enrichment.quality?.score || 0)),
        score_breakdown: {
          grade: enrichment.quality?.grade || null,
          reasons: enrichment.quality?.reasons || [],
          missing_data: enrichment.quality?.missing_data || []
        },
        interest: (analysis.service_interest || []).join(', ') || matched.interest,
        custom_fields: mergedLeadCustomFields(matched, analysis, enrichment, playbook)
      } : {})
    });

    const rows = await rest(`leads?id=eq.${encodeURIComponent(matched.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    return rows?.[0] || { ...matched, ...patch };
  }

  if (!analysis.crm?.should_create_lead || !analysis.lead_payload) return null;
  const base = analysis.lead_payload;
  const payload = {
    organization_id: organizationId,
    name: safeName(event, analysis.contact),
    contact_name: analysis.contact?.name || null,
    company_name: base.company_name || null,
    email: analysis.contact?.email || null,
    phone: analysis.contact?.phone || null,
    whatsapp: analysis.contact?.platform === 'whatsapp' ? analysis.contact?.phone || null : null,
    message: event.content || '',
    source: base.source || `social:${event.platform}`,
    status: 'new',
    interest: (analysis.service_interest || []).join(', ') || null,
    city: base.city || null,
    country: base.country || 'SA',
    industry: enrichment.vertical?.id !== 'general' ? enrichment.vertical?.id : (base.industry || null),
    pipeline_stage: analysis.crm?.suggested_stage || 'contacted',
    opportunity_score: enrichment.quality?.score ?? analysis.opportunity_score?.score ?? 0,
    score_breakdown: {
      grade: enrichment.quality?.grade || null,
      reasons: enrichment.quality?.reasons || [],
      missing_data: enrichment.quality?.missing_data || []
    },
    contact_id: contactId || null,
    last_contact_at: now,
    custom_fields: mergedLeadCustomFields(null, analysis, enrichment, playbook)
  };
  const rows = await rest('leads', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });
  return rows?.[0] || null;
}

async function upsertConversation(rest, organizationId, event, inboxEvent, analysis, enrichment, playbook, contactId, leadId) {
  const platform = inboxEvent.platform;
  const threadId = inboxEvent.external_thread_id;
  const org = encodeURIComponent(organizationId);
  const rows = await tryRest(rest,
    `conversations?organization_id=eq.${org}&platform=eq.${encodeURIComponent(platform)}&external_thread_id=eq.${encodeURIComponent(threadId)}&select=*&limit=1`);
  const existing = rows?.[0];
  const metadataPatch = {
    external_user_id: analysis.contact?.external_user_id || null,
    username: analysis.contact?.username || null,
    vertical: enrichment.vertical,
    quality: enrichment.quality,
    services: enrichment.services,
    next_best_action: enrichment.next_best_action,
    sales_playbook: playbook
  };
  const priority = analysis.intent === 'quote_request' || analysis.intent === 'booking'
    ? 'high'
    : analysis.intent === 'complaint' ? 'urgent' : 'normal';
  const status = analysis.intent === 'spam' ? 'spam' : 'open';

  if (existing) {
    const patch = {
      contact_id: contactId || existing.contact_id || null,
      lead_id: leadId || existing.lead_id || null,
      intent: analysis.intent || existing.intent || null,
      priority,
      status,
      last_message_at: event.occurred_at || new Date().toISOString(),
      unread_count: Math.max(0, Number(existing.unread_count || 0)) + 1,
      metadata: mergeJson(existing.metadata, metadataPatch),
      updated_at: new Date().toISOString()
    };
    const updated = await rest(`conversations?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    return updated?.[0] || { ...existing, ...patch };
  }

  const created = await rest('conversations', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      platform,
      external_thread_id: threadId,
      contact_id: contactId || null,
      lead_id: leadId || null,
      intent: analysis.intent || null,
      priority,
      status,
      last_message_at: event.occurred_at || new Date().toISOString(),
      unread_count: 1,
      metadata: metadataPatch
    })
  });
  return created?.[0] || null;
}

async function insertMessage(rest, organizationId, storedEvent, event, inboxEvent, analysis, enrichment, playbook, conversationId) {
  if (!conversationId) return null;
  const rows = await rest('messages?on_conflict=organization_id,external_message_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: 'inbound',
      body: event.content || null,
      external_message_id: inboxEvent.external_message_id,
      sender_name: event.author_name || null,
      social_event_id: storedEvent.id,
      created_at: event.occurred_at || new Date().toISOString(),
      ai_meta: {
        intent: analysis.intent,
        confidence: analysis.confidence,
        lead_temperature: analysis.lead_temperature,
        opportunity_score: analysis.opportunity_score,
        vertical: enrichment.vertical,
        quality: enrichment.quality,
        services: enrichment.services,
        next_best_action: enrichment.next_best_action,
        sales_playbook: playbook
      }
    })
  });
  return rows?.[0] || null;
}


export async function persistDeliveryStatusEvent({
  event,
  storedEvent,
  organizationId,
  rest
}) {
  if (typeof rest !== 'function') throw new Error('rest function is required');
  if (!storedEvent?.id || !organizationId) throw new Error('storedEvent.id and organizationId are required');
  if (!isDeliveryStatusEvent(event)) return { skipped: true, reason: 'not_delivery_status' };

  const status = deliveryStatus(event);
  const platform = String(event.platform || '').toLowerCase();
  const providerMessageId = String(
    event.external_parent_id
      || event.raw_payload?.message?.id
      || event.raw_payload?.message?.wamid
      || event.raw_payload?.status?.id
      || ''
  ).trim();

  if (!providerMessageId) return { skipped: true, reason: 'provider_message_id_missing' };

  const externalMessageId = `${platform}:${providerMessageId}`;
  let rows = await tryRest(
    rest,
    `messages?organization_id=eq.${encodeURIComponent(organizationId)}&external_message_id=eq.${encodeURIComponent(externalMessageId)}&select=*&limit=1`
  );
  if (!rows?.length) {
    rows = await tryRest(
      rest,
      `messages?organization_id=eq.${encodeURIComponent(organizationId)}&ai_meta->>provider_message_id=eq.${encodeURIComponent(providerMessageId)}&select=*&limit=1`
    );
  }

  const message = rows?.[0] || null;
  const at = event.occurred_at || new Date().toISOString();
  let conversation = null;
  if (message?.conversation_id) {
    const convRows = await tryRest(
      rest,
      `conversations?id=eq.${encodeURIComponent(message.conversation_id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,lead_id,contact_id&limit=1`
    );
    conversation = convRows?.[0] || null;
  }

  if (message) {
    const timing = {};
    if (status === 'sent') timing.sent_at = at;
    if (status === 'delivered') timing.delivered_at = at;
    if (status === 'read') timing.read_at = at;
    if (status === 'failed') timing.failed_at = at;

    await rest(`messages?id=eq.${encodeURIComponent(message.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        ai_meta: {
          ...(message.ai_meta || {}),
          delivery_status: status,
          delivery_status_at: at,
          provider_message_id: providerMessageId,
          status_event_id: storedEvent.id,
          ...timing
        }
      })
    });
  }

  const actionId = message?.ai_meta?.action_id || null;
  if (actionId) {
    const actionRows = await tryRest(
      rest,
      `actions?id=eq.${encodeURIComponent(actionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,result,status&limit=1`
    );
    const action = actionRows?.[0] || null;
    if (action) {
      await rest(`actions?id=eq.${encodeURIComponent(action.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          result: {
            ...(action.result || {}),
            delivery_status: status,
            delivery_status_at: at,
            provider_message_id: providerMessageId
          },
          updated_at: new Date().toISOString()
        })
      });
    }
  }

  const outboundRows = await tryRest(
    rest,
    `social_events?organization_id=eq.${encodeURIComponent(organizationId)}&platform=eq.${encodeURIComponent(platform)}&external_event_id=eq.${encodeURIComponent(providerMessageId)}&select=id,raw_payload,conversation_id,lead_id,contact_id&limit=1`
  );
  const outbound = outboundRows?.[0] || null;
  if (outbound) {
    await rest(`social_events?id=eq.${encodeURIComponent(outbound.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        raw_payload: {
          ...(outbound.raw_payload || {}),
          delivery_status: status,
          delivery_status_at: at
        }
      })
    });
  }

  const conversationId = message?.conversation_id || outbound?.conversation_id || null;
  const leadId = conversation?.lead_id || outbound?.lead_id || null;
  const contactId = conversation?.contact_id || outbound?.contact_id || null;

  await rest(`social_events?id=eq.${encodeURIComponent(storedEvent.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      processing_status: 'processed',
      conversation_id: conversationId,
      lead_id: leadId,
      contact_id: contactId
    })
  });

  return {
    skipped: false,
    status,
    provider_message_id: providerMessageId,
    message_id: message?.id || null,
    conversation_id: conversationId,
    lead_id: leadId,
    contact_id: contactId
  };
}

export async function planSocialCrmEvent(event = {}, options = {}) {
  if (!isCrmActionableEvent(event)) return { skipped: true, reason: 'not_actionable' };
  const inboxEvent = socialEventToInboxEvent(event);
  const analysis = await analyzeInboxEvent(inboxEvent, {
    existingCandidates: options.existingCandidates || [],
    useAI: Boolean(options.useAI)
  });
  const enrichment = await enrichLead({
    inbox_analysis: analysis,
    lead: analysis.existing_match?.candidate || null,
    engagement_count: Number(options.engagementCount || 0)
  }, { useAI: false });
  const playbook = buildSalesPlaybookResult({
    inbox_analysis: analysis,
    enrichment,
    lead: analysis.existing_match?.candidate || analysis.lead_payload || null,
    conversation: {
      unanswered_inbound: options.unansweredInbound ?? true,
      message_count: Number(options.messageCount || 1),
      last_message_at: event.occurred_at || null
    }
  });
  return { skipped: false, inboxEvent, analysis, enrichment, playbook };
}

export async function persistSocialCrmEvent({
  event,
  storedEvent,
  organizationId,
  rest,
  useAI = false
}) {
  if (typeof rest !== 'function') throw new Error('rest function is required');
  if (!storedEvent?.id || !organizationId) throw new Error('storedEvent.id and organizationId are required');
  if (!isCrmActionableEvent(event)) return { skipped: true, reason: 'not_actionable' };

  const inboxEvent = socialEventToInboxEvent(event);
  const candidates = await loadLeadCandidates(rest, organizationId, inboxEvent);
  const analysis = await analyzeInboxEvent(inboxEvent, {
    existingCandidates: candidates,
    useAI
  });

  const enrichment = await enrichLead({
    inbox_analysis: analysis,
    lead: analysis.existing_match?.candidate || null
  }, { useAI: false });

  const playbook = buildSalesPlaybookResult({
    inbox_analysis: analysis,
    enrichment,
    lead: analysis.existing_match?.candidate || analysis.lead_payload || null,
    conversation: {
      unanswered_inbound: true,
      message_count: 1,
      last_message_at: event.occurred_at || null
    }
  });

  const contact = await upsertContact(rest, organizationId, event, analysis);
  const lead = await createOrUpdateLead(
    rest,
    organizationId,
    event,
    analysis,
    enrichment,
    playbook,
    contact?.id || null
  );

  const linkedLeadId = lead?.id
    || (analysis.existing_match?.matched && analysis.existing_match?.auto_merge
      ? analysis.existing_match?.candidate?.id
      : null);

  const conversation = await upsertConversation(
    rest,
    organizationId,
    event,
    inboxEvent,
    analysis,
    enrichment,
    playbook,
    contact?.id || null,
    linkedLeadId
  );

  const message = await insertMessage(
    rest,
    organizationId,
    storedEvent,
    event,
    inboxEvent,
    analysis,
    enrichment,
    playbook,
    conversation?.id || null
  );

  const patch = {
    lead_id: linkedLeadId || null,
    contact_id: contact?.id || null,
    conversation_id: conversation?.id || null,
    intent: analysis.intent || null,
    intent_confidence: analysis.confidence ?? null
  };
  await rest(`social_events?id=eq.${encodeURIComponent(storedEvent.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });

  return {
    skipped: false,
    lead_id: linkedLeadId || null,
    contact_id: contact?.id || null,
    conversation_id: conversation?.id || null,
    message_id: message?.id || null,
    analysis,
    enrichment,
    playbook
  };
}

export default {
  isCrmActionableEvent,
  isDeliveryStatusEvent,
  persistDeliveryStatusEvent,
  buildExternalThreadId,
  socialEventToInboxEvent,
  planSocialCrmEvent,
  persistSocialCrmEvent
};
