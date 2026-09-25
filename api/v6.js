/**
 * Tiqnora V6 consolidated router.
 * Keeps Hobby deployments under the Serverless Function limit.
 */
import { generateText, generateSalesReply, classifyIntent, aiProviderHealth } from '../lib/ai/provider.js';
import {
  createAction,
  listActions,
  getAction,
  approveAction,
  rejectAction,
  executeAction
} from '../lib/actions/engine.js';
import { buildProposalDraft } from '../lib/v6/proposal-composer.js';
import {
  validateProposalDeliveryAction,
  formatProposalForDelivery,
  chooseProposalDeliveryEvent
} from '../lib/v6/proposal-delivery.js';
import {
  mapActionToLifecycle,
  buildProposalCard,
  createProposalVersion,
  applyProposalEdits,
  buildProposalTimeline,
  buildPublicProposalView,
  canSendProposal,
  generateShareToken,
  recommendProposalFollowUp,
  crmStageSuggestion,
  prepareDeliveryMessage
} from '../lib/v6/proposal-service.js';
import {
  createResearchJobSpec,
  runResearchJob,
  normalizeBusinessRecord,
  buildResearchOutreachDraft,
  analyzeResearchCandidate,
  buildCrmLeadPayload
} from '../lib/v6/lead-research.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function requireAdmin(req) {
  const token = bearer(req);
  if (!token) return null;

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) return null;

  const user = await userRes.json();
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active&limit=1`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }
  );
  const profiles = await profileRes.json().catch(() => []);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile || !profile.is_active || !['admin', 'super_admin'].includes(profile.role)) return null;
  return { user, profile, token };
}

function serverKey(token = '') {
  return SERVICE || token || ANON;
}

async function sbGet(path, token = '') {
  const key = serverKey(token);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE || ANON, Authorization: `Bearer ${key}` }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(body?.message || body?.hint || `Supabase ${response.status}`), { status: response.status });
  }
  return body;
}

async function sbWrite(path, { method = 'POST', body = null, prefer = 'return=representation' } = {}, token = '') {
  const key = serverKey(token);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE || ANON,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    ...(body == null ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || payload?.hint || `Supabase ${response.status}`), { status: response.status });
  }
  return payload;
}

async function tiqnoraOrgId(token = '') {
  const rows = await sbGet('organizations?slug=eq.tiqnora&select=id&limit=1', token);
  return rows?.[0]?.id || null;
}

async function handleSalesChat(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > 4000) return json(res, 400, { error: 'رسالة غير صالحة' });

  try {
    const agents = await sbGet('ai_agents?slug=eq.sales&is_enabled=eq.true&select=system_prompt_ar,system_prompt_en,model,temperature&limit=1');
    const agent = Array.isArray(agents) ? agents[0] : null;
    const system = agent?.system_prompt_ar || agent?.system_prompt_en ||
      'أنت مساعد مبيعات Tiqnora AI. اشرح الخدمات بالعربية بوضوح واقترح الخطوة التالية بدون اختراع أسعار.';
    const result = await generateText({
      system,
      prompt: message,
      model: agent?.model,
      temperature: Number(agent?.temperature ?? 0.5),
      maxTokens: 1200
    });
    if (!result.text) return json(res, 502, { error: 'رد فارغ' });
    return json(res, 200, { reply: result.text, model: result.model, provider: result.provider });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'خطأ', code: error.code });
  }
}

async function handleDraftReply(req, res, auth) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { lead_id, conversation_id, message, language = 'ar' } = req.body || {};
  let lead = null;
  let messages = [];
  let organizationId = null;

  if (lead_id) {
    const rows = await sbGet(`leads?id=eq.${encodeURIComponent(lead_id)}&select=*&limit=1`, auth.token);
    lead = Array.isArray(rows) ? rows[0] : null;
    if (lead?.organization_id) organizationId = lead.organization_id;
  }

  if (conversation_id) {
    const convRows = await sbGet(`conversations?id=eq.${encodeURIComponent(conversation_id)}&select=*&limit=1`, auth.token);
    const conversation = Array.isArray(convRows) ? convRows[0] : null;
    if (conversation) {
      organizationId = organizationId || conversation.organization_id;
      if (!lead && conversation.lead_id) {
        const leadRows = await sbGet(`leads?id=eq.${encodeURIComponent(conversation.lead_id)}&select=*&limit=1`, auth.token);
        lead = Array.isArray(leadRows) ? leadRows[0] : null;
      }
      const messageRows = await sbGet(
        `messages?conversation_id=eq.${encodeURIComponent(conversation_id)}&select=direction,body,created_at&order=created_at.asc&limit=20`,
        auth.token
      );
      messages = Array.isArray(messageRows) ? messageRows : [];
    }
  }

  if (message && String(message).trim()) {
    messages.push({ direction: 'inbound', body: String(message).trim() });
  }

  organizationId = organizationId || await tiqnoraOrgId(auth.token);
  if (!organizationId) return json(res, 500, { error: 'Organization missing' });

  let intentResult = null;
  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');
  if (lastInbound?.body) {
    try {
      intentResult = await classifyIntent({ text: lastInbound.body, language });
    } catch {
      intentResult = null;
    }
  }

  const sales = await generateSalesReply({ lead: lead || {}, messages, language });
  const platform = String(req.body?.platform || 'whatsapp').toLowerCase();
  const actionType =
    platform === 'instagram' ? 'send_instagram_dm' :
    platform === 'facebook' ? 'send_facebook_message' :
    'send_whatsapp';

  const action = await createAction({
    organizationId,
    actionType,
    payload: {
      reply_draft: sales.reply_draft,
      qualification: sales.qualification,
      next_best_action: sales.next_best_action,
      suggested_stage: sales.suggested_stage,
      internal_summary: sales.internal_summary,
      intent: intentResult,
      model: sales.model,
      provider: sales.provider
    },
    relatedEntityType: lead ? 'lead' : conversation_id ? 'conversation' : null,
    relatedEntityId: lead?.id || conversation_id || null,
    leadId: lead?.id || null,
    conversationId: conversation_id || null,
    createdBy: auth.profile.id,
    requiresApproval: true,
    accessToken: auth.token
  });

  return json(res, 200, {
    action,
    draft: sales.reply_draft,
    qualification: sales.qualification,
    next_best_action: sales.next_best_action,
    suggested_stage: sales.suggested_stage,
    internal_summary: sales.internal_summary,
    intent: intentResult,
    model: sales.model
  });
}


function normalizeConfirmedPricing(input) {
  if (!input || typeof input !== 'object') return null;
  const num = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error('قيمة سعر غير صالحة'), { status: 400 });
    return n;
  };

  const lineItems = Array.isArray(input.line_items)
    ? input.line_items.map(item => ({
        service: String(item?.service || '').trim(),
        price: num(item?.price)
      })).filter(item => item.service)
    : [];

  const pricing = {
    currency: String(input.currency || 'SAR').trim().toUpperCase() || 'SAR',
    subtotal: num(input.subtotal),
    vat: num(input.vat),
    total: num(input.total),
    line_items: lineItems
  };

  const hasAnyValue =
    pricing.subtotal !== null ||
    pricing.vat !== null ||
    pricing.total !== null ||
    pricing.line_items.some(item => item.price !== null);

  return hasAnyValue ? pricing : null;
}

async function handleProposal(req, res, auth) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = req.body || {};
  const leadId = String(body.lead_id || '').trim();
  if (!leadId) return json(res, 400, { error: 'lead_id required' });

  const leadRows = await sbGet(`leads?id=eq.${encodeURIComponent(leadId)}&select=*&limit=1`, auth.token);
  const lead = Array.isArray(leadRows) ? leadRows[0] : null;
  if (!lead) return json(res, 404, { error: 'Lead not found' });

  const organizationId = lead.organization_id || await tiqnoraOrgId(auth.token);
  if (!organizationId) return json(res, 500, { error: 'Organization missing' });

  let contact = null;
  if (lead.contact_id) {
    const contactRows = await sbGet(
      `crm_contacts?id=eq.${encodeURIComponent(lead.contact_id)}&select=*&limit=1`,
      auth.token
    );
    contact = Array.isArray(contactRows) ? contactRows[0] : null;
  }

  let company = null;
  if (lead.company_id) {
    const companyRows = await sbGet(
      `crm_companies?id=eq.${encodeURIComponent(lead.company_id)}&select=*&limit=1`,
      auth.token
    );
    company = Array.isArray(companyRows) ? companyRows[0] : null;
  }

  const custom = lead.custom_fields || {};
  const services = Array.isArray(custom.service_interest) ? custom.service_interest : [];
  const recommended = custom.recommended_services && typeof custom.recommended_services === 'object'
    ? custom.recommended_services
    : { primary: services, secondary: [] };
  const missing = custom.missing_qualification && typeof custom.missing_qualification === 'object'
    ? custom.missing_qualification
    : { missing: [], recommended_questions: [] };
  const scoreBreakdown = lead.score_breakdown || {};

  const inboxAnalysis = {
    intent: custom.detected_intent || 'sales',
    industry: lead.industry || null,
    service_interest: services,
    contact: {
      name: contact?.full_name || lead.contact_name || lead.name || null,
      phone: contact?.phone || contact?.whatsapp || lead.phone || lead.whatsapp || null,
      email: contact?.email || lead.email || null
    },
    location: { city: lead.city || null, country: lead.country || null },
    qualification: custom.qualification || {},
    opportunity_score: {
      score: Number(lead.opportunity_score || 0),
      reasons: Array.isArray(scoreBreakdown?.reasons) ? scoreBreakdown.reasons : []
    },
    lead_payload: { company_name: lead.company_name || company?.name || null }
  };

  const storedPlaybook = custom.sales_playbook || {};
  const verticalId = storedPlaybook?.playbook?.vertical_id || lead.industry || 'general';

  const enrichment = {
    vertical: {
      id: verticalId,
      confidence: 1,
      reason: storedPlaybook?.playbook?.vertical_id ? 'sales_playbook' : 'crm'
    },
    pack: custom.vertical_pack || null,
    quality: {
      score: Number(lead.opportunity_score || 0),
      grade: scoreBreakdown?.grade || null,
      reasons: Array.isArray(scoreBreakdown?.reasons) ? scoreBreakdown.reasons : [],
      missing_data: Array.isArray(scoreBreakdown?.missing_data) ? scoreBreakdown.missing_data : []
    },
    services: recommended,
    missing,
    next_best_action: custom.next_best_action || null
  };

  const playbook = storedPlaybook;
  const confirmedPricing = normalizeConfirmedPricing(body.confirmed_pricing);

  const proposal = buildProposalDraft({
    inbox_analysis: inboxAnalysis,
    enrichment,
    playbook,
    lead,
    company,
    contact,
    ...(confirmedPricing ? { confirmed_pricing: confirmedPricing } : {})
  }, { language: body.language === 'en' ? 'en' : 'ar' });

  if (String(body.op || 'preview') === 'preview') {
    return json(res, 200, { proposal });
  }

  if (String(body.op) === 'create_action') {
    if (proposal.status === 'not_ready') {
      return json(res, 409, { error: 'العرض غير جاهز لإنشاء مسودة مراجعة', proposal });
    }

    const conversationRows = await sbGet(
      `conversations?organization_id=eq.${encodeURIComponent(organizationId)}&lead_id=eq.${encodeURIComponent(lead.id)}&select=id,platform,last_message_at&order=last_message_at.desc&limit=1`,
      auth.token
    );
    const proposalConversation = Array.isArray(conversationRows) ? conversationRows[0] : null;

    const action = await createAction({
      organizationId,
      actionType: 'proposal_review',
      payload: {
        proposal,
        proposal_status: proposal.status,
        pricing_status: proposal.pricing?.status || null,
        client_name: proposal.client?.name || lead.company_name || lead.contact_name || null,
        source: 'v6_proposal_composer'
      },
      relatedEntityType: 'lead',
      relatedEntityId: lead.id,
      leadId: lead.id,
      conversationId: proposalConversation?.id || null,
      createdBy: auth.profile.id,
      requiresApproval: true,
      status: 'pending_approval',
      accessToken: auth.token
    });

    return json(res, 201, { proposal, action });
  }

  return json(res, 400, { error: 'op must be preview|create_action' });
}

async function handleProposalDelivery(req, res, auth) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = req.body || {};
  const actionId = String(body.action_id || '').trim();
  const op = String(body.op || 'prepare').toLowerCase();
  if (!actionId) return json(res, 400, { error: 'action_id required' });

  const action = await getAction(actionId, auth.token);
  if (!action) return json(res, 404, { error: 'Proposal action not found' });

  if (op === 'record_sent' && action.status === 'completed' && action.result?.outbound_external_id) {
    return json(res, 200, { action, already_recorded: true });
  }

  const validation = validateProposalDeliveryAction(action);
  if (!validation.ready) {
    return json(res, 409, {
      error: 'العرض غير جاهز للإرسال اليدوي',
      code: 'proposal_delivery_not_ready',
      validation
    });
  }

  const organizationId = action.organization_id || await tiqnoraOrgId(auth.token);
  if (!organizationId) return json(res, 500, { error: 'Organization missing' });

  let conversationId = action.conversation_id || null;
  if (!conversationId && action.lead_id) {
    const rows = await sbGet(
      `conversations?organization_id=eq.${encodeURIComponent(organizationId)}&lead_id=eq.${encodeURIComponent(action.lead_id)}&select=id,platform,last_message_at&order=last_message_at.desc&limit=1`,
      auth.token
    );
    conversationId = rows?.[0]?.id || null;
  }

  if (op === 'prepare') {
    let eventPath = `social_events?organization_id=eq.${encodeURIComponent(organizationId)}&event_type=in.(message.received,comment.created)&select=id,platform,event_type,author_name,author_external_id,occurred_at,raw_payload,lead_id,conversation_id,contact_id&order=occurred_at.desc&limit=30`;
    if (conversationId) eventPath += `&conversation_id=eq.${encodeURIComponent(conversationId)}`;
    else if (action.lead_id) eventPath += `&lead_id=eq.${encodeURIComponent(action.lead_id)}`;

    const events = await sbGet(eventPath, auth.token);
    const event = chooseProposalDeliveryEvent(events || [], {
      ...action,
      conversation_id: conversationId
    });
    if (!event) {
      return json(res, 409, {
        error: 'لا توجد محادثة اجتماعية واردة مرتبطة بهذا العرض للإرسال',
        code: 'proposal_delivery_channel_missing'
      });
    }

    const message = formatProposalForDelivery(action.payload?.proposal || {}, {
      language: action.payload?.proposal?.language || 'ar',
      maxLength: 3900
    });

    return json(res, 200, {
      ready: true,
      action_id: action.id,
      event_id: event.id,
      conversation_id: conversationId || event.conversation_id || null,
      platform: event.platform,
      recipient: event.author_name || event.author_external_id || null,
      message,
      validation
    });
  }

  if (op === 'record_sent') {
    const sourceEventId = String(body.source_event_id || '').trim();
    const outboundExternalId = String(body.outbound_external_id || '').trim();
    if (!sourceEventId || !outboundExternalId) {
      return json(res, 400, { error: 'source_event_id and outbound_external_id required' });
    }

    const eventRows = await sbGet(
      `social_events?id=eq.${encodeURIComponent(sourceEventId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,platform,lead_id,conversation_id&limit=1`,
      auth.token
    );
    const sourceEvent = eventRows?.[0] || null;
    if (!sourceEvent) return json(res, 404, { error: 'Source social event not found' });

    if (action.lead_id && sourceEvent.lead_id && String(action.lead_id) !== String(sourceEvent.lead_id)) {
      return json(res, 409, { error: 'Source event does not belong to proposal lead', code: 'proposal_event_mismatch' });
    }
    if (conversationId && sourceEvent.conversation_id && String(conversationId) !== String(sourceEvent.conversation_id)) {
      return json(res, 409, { error: 'Source event does not belong to proposal conversation', code: 'proposal_event_mismatch' });
    }

    const now = new Date().toISOString();
    const result = {
      ...(action.result || {}),
      outbound_external_id: outboundExternalId,
      outbound_event_id: body.outbound_event_id || null,
      source_event_id: sourceEventId,
      platform: body.platform || sourceEvent.platform || null,
      delivery_status: String(body.provider_status || 'sent').toLowerCase(),
      sent_at: now
    };

    const rows = await sbWrite(
      `actions?id=eq.${encodeURIComponent(action.id)}&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.approved`,
      {
        method: 'PATCH',
        body: {
          status: 'completed',
          result,
          executed_at: now,
          updated_at: now
        }
      },
      auth.token
    );
    const updated = Array.isArray(rows) ? rows[0] : rows;
    if (!updated) return json(res, 409, { error: 'Proposal action was already changed before send was recorded' });

    if (action.lead_id) {
      try {
        await sbWrite('crm_activities', {
          method: 'POST',
          body: {
            organization_id: organizationId,
            lead_id: action.lead_id,
            activity_type: 'system',
            title: 'تم إرسال العرض للعميل',
            body: `القناة: ${result.platform || 'social'}`,
            metadata: {
              kind: 'proposal_sent',
              action_id: action.id,
              outbound_external_id: outboundExternalId,
              outbound_event_id: result.outbound_event_id,
              source_event_id: sourceEventId
            },
            created_by: auth.profile.id
          }
        }, auth.token);
      } catch {
        // Audit action/result is the source of truth; activity is best-effort.
      }
    }

    return json(res, 200, { action: updated, sent: true });
  }

  return json(res, 400, { error: 'op must be prepare|record_sent' });
}

async function handleProposalHistory(req, res, auth) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const organizationId = req.query?.organization_id || await tiqnoraOrgId(auth.token);
  if (!organizationId) return json(res, 500, { error: 'Organization missing' });

  const limit = Math.min(parseInt(req.query?.limit || '60', 10) || 60, 200);
  const leadId = String(req.query?.lead_id || '').trim();
  const status = String(req.query?.status || '').trim().toLowerCase();

  let path =
    `actions?organization_id=eq.${encodeURIComponent(organizationId)}&action_type=eq.proposal_review&select=id,organization_id,status,payload,result,lead_id,conversation_id,created_by,approved_by,approved_at,executed_at,error_code,error_message,created_at,updated_at&order=created_at.desc&limit=${limit}`;
  if (leadId) path += `&lead_id=eq.${encodeURIComponent(leadId)}`;
  if (status && status !== 'all') path += `&status=eq.${encodeURIComponent(status)}`;

  const rows = await sbGet(path, auth.token);
  const proposals = (Array.isArray(rows) ? rows : []).map(action => {
    const proposal = action.payload?.proposal || {};
    const pricing = proposal.pricing || {};
    const result = action.result || {};
    const deliveryStatus = result.delivery_status || null;
    const clientName =
      action.payload?.client_name
      || proposal.client?.name
      || null;

    const card = buildProposalCard(action);
    const timeline = buildProposalTimeline(action);
    return {
      id: action.id,
      status: action.status,
      lifecycle_status: card.lifecycle_status,
      lifecycle_label: card.lifecycle_label,
      lead_id: action.lead_id || null,
      conversation_id: action.conversation_id || null,
      client_name: clientName,
      company_name: card.company_name,
      title: proposal.title || 'Proposal',
      language: proposal.language || 'ar',
      vertical: proposal.client?.vertical || null,
      amount: card.amount,
      currency: card.currency,
      version_number: card.version_number,
      share_token: card.share_token,
      follow_up_at: card.follow_up_at,
      timeline,
      can_send: canSendProposal(action).ok,
      proposal_status: action.payload?.proposal_status || proposal.status || null,
      pricing_status: action.payload?.pricing_status || pricing.status || null,
      currency: pricing.currency || 'SAR',
      subtotal: pricing.subtotal ?? null,
      vat: pricing.vat ?? null,
      total: pricing.total ?? null,
      delivery_status: deliveryStatus,
      platform: result.platform || null,
      outbound_external_id: result.outbound_external_id || null,
      sent_at: result.sent_at || action.executed_at || null,
      delivery_status_at: result.delivery_status_at || null,
      approved_at: action.approved_at || null,
      executed_at: action.executed_at || null,
      created_at: action.created_at,
      updated_at: action.updated_at,
      error_code: action.error_code || null,
      error_message: action.error_message || null,
      proposal,
      result
    };
  });

  const summary = {
    total: proposals.length,
    pending_approval: proposals.filter(x => x.status === 'pending_approval').length,
    approved: proposals.filter(x => x.status === 'approved').length,
    completed: proposals.filter(x => x.status === 'completed').length,
    rejected: proposals.filter(x => x.status === 'cancelled').length,
    sent: proposals.filter(x => ['sent', 'accepted', 'delivered', 'read'].includes(String(x.delivery_status || '').toLowerCase())).length,
    delivered: proposals.filter(x => ['delivered', 'read'].includes(String(x.delivery_status || '').toLowerCase())).length,
    read: proposals.filter(x => String(x.delivery_status || '').toLowerCase() === 'read').length,
    failed: proposals.filter(x => String(x.delivery_status || '').toLowerCase() === 'failed').length
  };

  return json(res, 200, { proposals, summary });
}

async function handleActions(req, res, auth) {
  const organizationId = req.body?.organization_id || req.query?.organization_id || await tiqnoraOrgId(auth.token);
  if (!organizationId) return json(res, 500, { error: 'Organization missing' });

  if (req.method === 'GET') {
    const status = req.query?.status || null;
    const limit = Math.min(parseInt(req.query?.limit || '50', 10) || 50, 200);
    const actions = await listActions({ organizationId, status, limit, accessToken: auth.token });
    return json(res, 200, { actions: actions || [] });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.action_type) return json(res, 400, { error: 'action_type required' });
    const action = await createAction({
      organizationId,
      actionType: body.action_type,
      payload: body.payload || {},
      relatedEntityType: body.related_entity_type || null,
      relatedEntityId: body.related_entity_id || null,
      leadId: body.lead_id || null,
      conversationId: body.conversation_id || null,
      createdBy: auth.profile.id,
      requiresApproval: body.requires_approval !== false,
      status: body.status || null,
      accessToken: auth.token
    });
    return json(res, 201, { action });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

async function handleAction(req, res, auth) {
  const id = String(req.query?.id || req.query?.actionId || '');
  if (!id) return json(res, 400, { error: 'id required' });

  if (req.method === 'GET') {
    const action = await getAction(id, auth.token);
    if (!action) return json(res, 404, { error: 'Not found' });
    return json(res, 200, { action });
  }

  if (req.method === 'POST') {
    const op = String(req.body?.op || '').toLowerCase();
    if (op === 'approve') {
      const action = await approveAction({
        actionId: id,
        approvedBy: auth.profile.id,
        autoExecute: Boolean(req.body?.autoExecute),
        accessToken: auth.token
      });
      return json(res, 200, { action });
    }
    if (op === 'reject') {
      const action = await rejectAction({
        actionId: id,
        approvedBy: auth.profile.id,
        reason: req.body?.reason || '',
        accessToken: auth.token
      });
      return json(res, 200, { action });
    }
    if (op === 'execute') {
      const action = await executeAction({ actionId: id, accessToken: auth.token });
      return json(res, 200, { action });
    }
    return json(res, 400, { error: 'op must be approve|reject|execute' });
  }

  return json(res, 405, { error: 'Method not allowed' });
}


async function handleProposalManage(req, res, auth) {
  const organizationId = req.body?.organization_id || req.query?.organization_id || await tiqnoraOrgId(auth.token);
  if (!organizationId) return json(res, 500, { error: 'Organization missing' });
  const id = String(req.query?.id || req.body?.id || req.body?.action_id || '').trim();
  const op = String(req.query?.op || req.body?.op || 'get').toLowerCase();
  if (!id && op !== 'list') return json(res, 400, { error: 'id required' });
  if (op === 'list' || (req.method === 'GET' && !id)) return handleProposalHistory(req, res, auth);
  const action = await getAction(id, auth.token);
  if (!action) return json(res, 404, { error: 'Not found' });
  if (action.organization_id && String(action.organization_id) !== String(organizationId)) return json(res, 403, { error: 'Forbidden' });
  if (action.action_type && action.action_type !== 'proposal_review') return json(res, 409, { error: 'Not a proposal action' });
  if (req.method === 'GET' || op === 'get') {
    return json(res, 200, { action, card: buildProposalCard(action), timeline: buildProposalTimeline(action), can_send: canSendProposal(action), versions: action.payload?.versions || [] });
  }
  if (req.method !== 'POST' && req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
  const payload = { ...(action.payload || {}) };
  if (op === 'update') {
    const edits = req.body?.edits || req.body?.proposal || {};
    const nextProposal = applyProposalEdits(payload.proposal || {}, edits);
    payload.proposal = nextProposal;
    if (edits.pricing) payload.price_updated_at = new Date().toISOString();
    if (req.body?.follow_up_at) payload.follow_up_at = req.body.follow_up_at;
    if (req.body?.lifecycle_status) payload.lifecycle_status = req.body.lifecycle_status;
    if (action.status === 'approved' || action.status === 'completed') {
      const current = Number(payload.version_number || 1);
      const version = createProposalVersion({ proposal: nextProposal, version_number: current + 1, created_by: auth.profile.id, change_summary: req.body?.change_summary || 'Human edit after approval' });
      payload.versions = [...(payload.versions || []), version];
      payload.version_number = version.version_number;
      payload.lifecycle_status = 'needs_review';
    }
    const updated = await sbPatchAction(id, organizationId, { payload }, auth.token);
    return json(res, 200, { action: updated || { ...action, payload }, card: buildProposalCard({ ...action, payload }) });
  }
  if (op === 'version') {
    const current = Number(payload.version_number || 1);
    const version = createProposalVersion({ proposal: payload.proposal || {}, version_number: current + 1, created_by: auth.profile.id, change_summary: req.body?.change_summary || 'Manual version snapshot' });
    payload.versions = [...(payload.versions || []), version];
    payload.version_number = version.version_number;
    const updated = await sbPatchAction(id, organizationId, { payload }, auth.token);
    return json(res, 200, { action: updated || { ...action, payload }, version });
  }
  if (op === 'share_link') {
    if (!payload.share_token) payload.share_token = generateShareToken();
    const updated = await sbPatchAction(id, organizationId, { payload }, auth.token);
    return json(res, 200, { share_token: payload.share_token, path: `/proposal/${payload.share_token}`, action: updated || { ...action, payload } });
  }
  if (op === 'set_lifecycle') {
    const lc = String(req.body?.lifecycle_status || '').toLowerCase();
    const allowed = ['negotiation', 'accepted', 'rejected', 'expired', 'viewed', 'sent'];
    if (!allowed.includes(lc)) return json(res, 400, { error: 'invalid lifecycle_status' });
    payload.lifecycle_status = lc;
    if (lc === 'accepted') payload.accepted_at = new Date().toISOString();
    if (lc === 'negotiation') payload.negotiation_at = new Date().toISOString();
    if (lc === 'rejected') payload.reject_reason = req.body?.reason || '';
    const crm = crmStageSuggestion(lc);
    payload.crm_suggestion = crm;
    if (action.lead_id && crm.opportunity_stage) {
      try {
        const stage = crm.opportunity_stage;
        await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${encodeURIComponent(action.lead_id)}`, {
          method: 'PATCH',
          headers: { apikey: SERVICE || ANON, Authorization: `Bearer ${SERVICE || auth.token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ pipeline_stage: stage, status: stage === 'won' ? 'won' : stage === 'lost' ? 'lost' : undefined })
        });
      } catch (_) {}
    }
    const updated = await sbPatchAction(id, organizationId, { payload }, auth.token);
    return json(res, 200, { action: updated || { ...action, payload }, crm_suggestion: crm });
  }
  if (op === 'follow_up') {
    const rec = recommendProposalFollowUp(action, { hours: Number(req.body?.hours) || 48 });
    if (rec.recommended) {
      payload.follow_up_at = rec.follow_up_at;
      payload.follow_up_draft = rec.draft_goal;
      await sbPatchAction(id, organizationId, { payload }, auth.token);
    }
    return json(res, 200, { follow_up: rec, requires_approval: true, auto_send: false });
  }
  if (op === 'timeline') return json(res, 200, { timeline: buildProposalTimeline(action), card: buildProposalCard(action) });
  if (op === 'can_send') return json(res, 200, canSendProposal(action));
  return json(res, 400, { error: 'Unknown op' });
}

async function sbPatchAction(id, organizationId, fields, token) {
  const key = SERVICE || token;
  const body = { ...fields, updated_at: new Date().toISOString() };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/actions?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) { const err = new Error((data && data.message) || `Patch failed (${r.status})`); err.status = r.status; throw err; }
  return Array.isArray(data) ? data[0] : data;
}

async function handleProposalPublic(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const token = String(req.query?.token || req.body?.token || '').trim();
  if (!token || token.length < 16) return json(res, 400, { error: 'token required' });
  const key = SERVICE || ANON;
  const path = `actions?action_type=eq.proposal_review&payload->>share_token=eq.${encodeURIComponent(token)}&select=id,status,payload,result,created_at,updated_at,executed_at,approved_at,organization_id&limit=1`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const rows = await r.json().catch(() => []);
  const action = Array.isArray(rows) ? rows[0] : null;
  if (!action) return json(res, 404, { error: 'Not found' });
  const wantView = req.method === 'POST' || String(req.query?.record_view || '') === '1';
  if (wantView) {
    const payload = { ...(action.payload || {}) };
    const views = Array.isArray(payload.views) ? payload.views : [];
    const last = views[views.length - 1];
    const now = Date.now();
    if (!last || (now - new Date(last.at).getTime()) > 30 * 60 * 1000) {
      views.push({ at: new Date().toISOString(), version: payload.version_number || 1 });
      payload.views = views.slice(-20);
      if (!payload.viewed_at) payload.viewed_at = views[views.length - 1].at;
      if (payload.lifecycle_status === 'sent' || mapActionToLifecycle({ ...action, payload: { ...payload, lifecycle_status: payload.lifecycle_status || 'sent' } }) === 'sent') {
        payload.lifecycle_status = 'viewed';
      }
      await fetch(`${SUPABASE_URL}/rest/v1/actions?id=eq.${encodeURIComponent(action.id)}`, {
        method: 'PATCH',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ payload, updated_at: new Date().toISOString() })
      }).catch(() => null);
      action.payload = payload;
    }
  }
  const view = buildPublicProposalView(action);
  if (!view.ok) return json(res, 404, { error: view.message || 'Not available' });
  return json(res, 200, { proposal: view });
}



async function handleLeadResearch(req, res, auth) {
  const organizationId = req.body?.organization_id || req.query?.organization_id || await tiqnoraOrgId(auth.token);
  if (!organizationId) return json(res, 500, { error: 'Organization missing' });
  const op = String(req.query?.op || req.body?.op || 'list_jobs').toLowerCase();

  if (op === 'run' || op === 'create_and_run') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const spec = createResearchJobSpec({
      query: req.body?.query,
      city: req.body?.city,
      industry: req.body?.industry,
      target_count: req.body?.target_count || req.body?.limit,
      source: req.body?.source || 'fixture',
      filters: req.body?.filters
    });

    // Load existing leads for dedupe (best effort)
    let existing = [];
    try {
      const rows = await sbGet(
        `leads?organization_id=eq.${encodeURIComponent(organizationId)}&select=id,company_name,name,phone,whatsapp,email,website,city,industry&limit=500`,
        auth.token
      );
      existing = Array.isArray(rows) ? rows : [];
    } catch (_) {}

    const result = await runResearchJob(spec, {
      existingCandidates: existing,
      provider: req.body?.source || 'fixture',
      rows: req.body?.rows || []
    });

    // Persist job + candidates when service role available (non-fatal if tables missing)
    let jobId = null;
    try {
      const key = SERVICE || auth.token;
      const jobInsert = await fetch(`${SUPABASE_URL}/rest/v1/research_jobs`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          organization_id: organizationId,
          query: result.job.query,
          city: result.job.city,
          industry: result.job.industry,
          target_count: result.job.target_count,
          source: result.job.source,
          status: result.job.status,
          discovered_count: result.summary.discovered,
          qualified_count: result.summary.qualified,
          duplicate_count: result.summary.duplicates || 0,
          completed_at: result.job.completed_at,
          created_by: auth.profile?.id || null
        })
      });
      const jobRows = await jobInsert.json().catch(() => []);
      jobId = Array.isArray(jobRows) ? jobRows[0]?.id : jobRows?.id;
      if (jobId) {
        const candRows = result.candidates.map((c) => ({
          organization_id: organizationId,
          job_id: jobId,
          status: c.status,
          business_name: c.record?.business_name || null,
          industry: c.record?.industry || null,
          city: c.record?.city || null,
          country: c.record?.country || 'SA',
          website: c.record?.website || null,
          domain: c.record?.domain || null,
          phone: c.record?.phone || null,
          whatsapp: c.record?.whatsapp || null,
          email: c.record?.email || null,
          source: c.record?.source || result.job.source,
          source_url: c.record?.source_url || null,
          address: c.record?.address || null,
          rating: c.record?.rating ?? null,
          reviews_count: c.record?.reviews_count ?? null,
          description: c.record?.description || null,
          social_links: c.record?.social_links || {},
          opportunity_score: c.opportunity_score,
          grade: c.grade,
          reasons: c.reasons || [],
          missing_data: c.missing_data || [],
          recommended_services: c.recommended_services || [],
          next_best_action: c.next_best_action || null,
          vertical: c.vertical || null,
          match_on: c.match_on || null,
          payload: { crm_payload: c.crm_payload || null, outreach_draft: c.outreach_draft || null },
          requires_approval: true
        }));
        if (candRows.length) {
          await fetch(`${SUPABASE_URL}/rest/v1/research_candidates`, {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal'
            },
            body: JSON.stringify(candRows)
          }).catch(() => null);
        }
      }
    } catch (_) { /* tables may not exist yet */ }

    return json(res, 200, { job: { ...result.job, id: jobId }, candidates: result.candidates, summary: result.summary });
  }

  if (op === 'list_jobs') {
    try {
      const rows = await sbGet(
        `research_jobs?organization_id=eq.${encodeURIComponent(organizationId)}&select=*&order=created_at.desc&limit=50`,
        auth.token
      );
      return json(res, 200, { jobs: Array.isArray(rows) ? rows : [] });
    } catch (e) {
      return json(res, 200, { jobs: [], warning: e.message });
    }
  }

  if (op === 'list_candidates') {
    const jobId = String(req.query?.job_id || req.body?.job_id || '').trim();
    let path = `research_candidates?organization_id=eq.${encodeURIComponent(organizationId)}&select=*&order=opportunity_score.desc.nullslast&limit=100`;
    if (jobId) path += `&job_id=eq.${encodeURIComponent(jobId)}`;
    const status = String(req.query?.status || '').trim();
    if (status) path += `&status=eq.${encodeURIComponent(status)}`;
    try {
      const rows = await sbGet(path, auth.token);
      return json(res, 200, { candidates: Array.isArray(rows) ? rows : [] });
    } catch (e) {
      return json(res, 200, { candidates: [], warning: e.message });
    }
  }

  if (op === 'import_crm') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const candidate = req.body?.candidate || req.body;
    const payload = candidate?.crm_payload || candidate?.payload?.crm_payload || buildCrmLeadPayload({
      record: normalizeBusinessRecord(candidate),
      opportunity_score: candidate.opportunity_score,
      grade: candidate.grade,
      reasons: candidate.reasons || [],
      missing_data: candidate.missing_data || [],
      recommended_services: candidate.recommended_services || [],
      next_best_action: candidate.next_best_action,
      vertical: candidate.vertical
    }, {});
    payload.organization_id = organizationId;
    const key = SERVICE || auth.token;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    const rows = await r.json().catch(() => null);
    if (!r.ok) return json(res, r.status, { error: rows?.message || 'CRM insert failed' });
    const lead = Array.isArray(rows) ? rows[0] : rows;
    if (candidate?.id) {
      await fetch(`${SUPABASE_URL}/rest/v1/research_candidates?id=eq.${encodeURIComponent(candidate.id)}`, {
        method: 'PATCH',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ status: 'imported', lead_id: lead?.id, updated_at: new Date().toISOString() })
      }).catch(() => null);
    }
    return json(res, 201, { lead, requires_approval: true });
  }

  if (op === 'draft_outreach') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const record = normalizeBusinessRecord(req.body?.candidate || req.body || {});
    const analysis = await analyzeResearchCandidate(record);
    const draft = buildResearchOutreachDraft(analysis, { language: req.body?.language || 'ar' });
    // Create pending action only — no send
    const action = await createAction({
      organizationId,
      actionType: 'research_outreach',
      payload: { draft, candidate: record, requires_approval: true },
      leadId: req.body?.lead_id || null,
      createdBy: auth.profile.id,
      requiresApproval: true,
      status: 'pending_approval',
      accessToken: auth.token
    });
    return json(res, 201, { draft, action, requires_approval: true, auto_send: false });
  }

  return json(res, 400, { error: 'Unknown op', ops: ['run', 'list_jobs', 'list_candidates', 'import_crm', 'draft_outreach'] });
}


export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const route = String(req.query?.route || '').toLowerCase();

  if (route === 'ai_health') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    return json(res, 200, { ok: true, ai: aiProviderHealth() });
  }

  if (route === 'sales_chat') {
    return handleSalesChat(req, res);
  }

  if (route === 'proposal_public') {
    return handleProposalPublic(req, res);
  }

  const auth = await requireAdmin(req);
  if (!auth) return json(res, 401, { error: 'Unauthorized' });

  try {
    if (route === 'draft_reply') return await handleDraftReply(req, res, auth);
    if (route === 'proposal') return await handleProposal(req, res, auth);
    if (route === 'proposal_delivery') return await handleProposalDelivery(req, res, auth);
    if (route === 'proposal_history') return await handleProposalHistory(req, res, auth);
    if (route === 'proposal_manage') return await handleProposalManage(req, res, auth);
    if (route === 'research') return await handleLeadResearch(req, res, auth);
    if (route === 'actions') return await handleActions(req, res, auth);
    if (route === 'action') return await handleAction(req, res, auth);
    return json(res, 404, { error: 'Unknown V6 route' });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Error', code: error.code });
  }
}
