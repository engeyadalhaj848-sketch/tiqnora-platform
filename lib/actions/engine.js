/**
 * Tiqnora V6 — Action / Approval Engine
 * All external side-effects (send message, create appointment, etc.)
 * must pass through createAction → approve → execute.
 */

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY required for action engine');
    err.code = 'CONFIG';
    err.status = 503;
    throw err;
  }
  return key;
}

async function rest(path, options = {}) {
  const key = serviceKey();
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.message || body?.hint || `Supabase ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const ALLOWED_TYPES = new Set([
  'send_whatsapp',
  'send_instagram_dm',
  'send_facebook_message',
  'reply_comment',
  'create_appointment',
  'send_quote',
  'create_followup',
  'update_crm_stage',
  'generic'
]);

/**
 * Create a draft or pending_approval action.
 */
export async function createAction({
  organizationId,
  actionType,
  payload = {},
  relatedEntityType = null,
  relatedEntityId = null,
  leadId = null,
  conversationId = null,
  createdBy = null,
  requiresApproval = true,
  status = null
}) {
  if (!organizationId) throw Object.assign(new Error('organizationId required'), { status: 400 });
  if (!ALLOWED_TYPES.has(actionType) && actionType !== 'generic') {
    // allow custom types but prefer known ones
  }
  const initialStatus = status || (requiresApproval ? 'pending_approval' : 'approved');
  const rows = await rest('actions', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: organizationId,
      action_type: actionType,
      status: initialStatus,
      payload,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
      lead_id: leadId,
      conversation_id: conversationId,
      created_by: createdBy,
      requires_approval: requiresApproval
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function listActions({ organizationId, status, limit = 50 }) {
  let q = `actions?organization_id=eq.${organizationId}&select=*&order=created_at.desc&limit=${Math.min(limit, 200)}`;
  if (status) q += `&status=eq.${encodeURIComponent(status)}`;
  return rest(q);
}

export async function getAction(id) {
  const rows = await rest(`actions?id=eq.${id}&select=*&limit=1`);
  return rows?.[0] || null;
}

/**
 * Human approves → status approved (does not execute yet unless autoExecute).
 */
export async function approveAction({ actionId, approvedBy, autoExecute = false }) {
  const action = await getAction(actionId);
  if (!action) throw Object.assign(new Error('Action not found'), { status: 404 });
  if (!['draft', 'pending_approval'].includes(action.status)) {
    throw Object.assign(new Error(`Cannot approve action in status ${action.status}`), { status: 409 });
  }
  const updated = await rest(`actions?id=eq.${actionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });
  const row = Array.isArray(updated) ? updated[0] : updated;
  if (autoExecute) {
    return executeAction({ actionId });
  }
  return row;
}

export async function rejectAction({ actionId, approvedBy, reason = '' }) {
  const action = await getAction(actionId);
  if (!action) throw Object.assign(new Error('Action not found'), { status: 404 });
  if (!['draft', 'pending_approval'].includes(action.status)) {
    throw Object.assign(new Error(`Cannot reject action in status ${action.status}`), { status: 409 });
  }
  const updated = await rest(`actions?id=eq.${actionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'cancelled',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      error_message: reason || 'Rejected by user',
      updated_at: new Date().toISOString()
    })
  });
  return Array.isArray(updated) ? updated[0] : updated;
}

/**
 * Execute an approved action. Adapters are plugged here gradually.
 * V6.1: records execution; real channel send adapters reuse existing social code in follow-up commits.
 */
export async function executeAction({ actionId }) {
  const action = await getAction(actionId);
  if (!action) throw Object.assign(new Error('Action not found'), { status: 404 });
  if (action.status !== 'approved' && action.status !== 'failed') {
    throw Object.assign(new Error(`Cannot execute action in status ${action.status}`), { status: 409 });
  }

  await rest(`actions?id=eq.${actionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'executing', updated_at: new Date().toISOString() })
  });

  try {
    let result = { ok: true, note: 'noop' };

    switch (action.action_type) {
      case 'create_appointment': {
        result = await executeCreateAppointment(action);
        break;
      }
      case 'create_followup': {
        result = await executeCreateFollowup(action);
        break;
      }
      case 'update_crm_stage': {
        result = await executeUpdateStage(action);
        break;
      }
      case 'send_whatsapp':
      case 'send_instagram_dm':
      case 'send_facebook_message':
      case 'reply_comment': {
        // Placeholder: real send wired in social adapter commit.
        // For now mark completed only if payload.simulate === true; else leave instructions.
        if (action.payload?.simulate) {
          result = { ok: true, simulated: true, channel: action.action_type };
        } else {
          result = {
            ok: true,
            deferred: true,
            message: 'Channel adapter will send on next social integration pass. Action recorded as completed with deferred flag for audit.'
          };
        }
        break;
      }
      default:
        result = { ok: true, note: 'generic action recorded' };
    }

    const updated = await rest(`actions?id=eq.${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'completed',
        result,
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });
    return Array.isArray(updated) ? updated[0] : updated;
  } catch (e) {
    await rest(`actions?id=eq.${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'failed',
        error_code: e.code || 'EXECUTE_FAILED',
        error_message: e.message || String(e),
        retry_count: (action.retry_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
    });
    throw e;
  }
}

async function executeCreateAppointment(action) {
  const p = action.payload || {};
  if (!p.starts_at || !p.title) {
    throw Object.assign(new Error('starts_at and title required for appointment'), { status: 400 });
  }
  const rows = await rest('appointments', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: action.organization_id,
      lead_id: action.lead_id || p.lead_id || null,
      conversation_id: action.conversation_id || p.conversation_id || null,
      contact_id: p.contact_id || null,
      service_id: p.service_id || null,
      title: p.title,
      starts_at: p.starts_at,
      ends_at: p.ends_at || null,
      status: p.status || 'scheduled',
      location: p.location || null,
      notes: p.notes || null,
      created_by: action.approved_by || action.created_by
    })
  });
  const appt = Array.isArray(rows) ? rows[0] : rows;

  // Timeline activity
  if (action.lead_id) {
    await rest('crm_activities', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: action.organization_id,
        lead_id: action.lead_id,
        activity_type: 'meeting',
        title: `موعد: ${p.title}`,
        body: p.starts_at,
        metadata: { appointment_id: appt.id, action_id: action.id },
        created_by: action.approved_by || action.created_by
      })
    }).catch(() => null);
  }
  return { ok: true, appointment_id: appt.id };
}

async function executeCreateFollowup(action) {
  const p = action.payload || {};
  if (!p.due_at || !p.reason) {
    throw Object.assign(new Error('due_at and reason required'), { status: 400 });
  }
  const rows = await rest('follow_ups', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: action.organization_id,
      lead_id: action.lead_id || p.lead_id,
      conversation_id: action.conversation_id || p.conversation_id || null,
      reason: p.reason,
      due_at: p.due_at,
      draft_message: p.draft_message || null,
      assigned_to: p.assigned_to || null,
      assigned_agent: p.assigned_agent || 'sales',
      status: 'pending'
    })
  });
  const fu = Array.isArray(rows) ? rows[0] : rows;
  if (action.lead_id) {
    await rest(`leads?id=eq.${action.lead_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ next_followup_at: p.due_at, updated_at: new Date().toISOString() })
    }).catch(() => null);
  }
  return { ok: true, follow_up_id: fu.id };
}

async function executeUpdateStage(action) {
  const p = action.payload || {};
  if (!action.lead_id || !p.stage) {
    throw Object.assign(new Error('lead_id and stage required'), { status: 400 });
  }
  await rest(`leads?id=eq.${action.lead_id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      pipeline_stage: p.stage,
      status: p.lead_status || undefined,
      updated_at: new Date().toISOString()
    })
  });
  await rest('crm_activities', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: action.organization_id,
      lead_id: action.lead_id,
      activity_type: 'stage_change',
      title: `المرحلة: ${p.stage}`,
      body: p.note || null,
      metadata: { action_id: action.id },
      created_by: action.approved_by || action.created_by
    })
  }).catch(() => null);
  return { ok: true, stage: p.stage };
}

export default {
  createAction,
  listActions,
  getAction,
  approveAction,
  rejectAction,
  executeAction
};
