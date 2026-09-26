/**
 * Admin-only Apify integration API
 * Auth: Bearer + profiles.role in (admin, super_admin)
 * Secrets: APIFY_TOKEN never returned.
 */

import {
  isApifyConfigured,
  testConnection,
  runActor,
  getRun,
  getDatasetItems,
  clampMaxResults,
  DEFAULT_MAX_RESULTS,
  HARD_CAP_RESULTS
} from '../../../lib/integrations/apify.js';
import { runApifyGoogleMapsLeadWorkflow } from '../../../lib/v6/apify-lead-workflow.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function bearer(req) {
  const value = req.headers.authorization || req.headers.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function requireAdmin(req) {
  const token = bearer(req);
  if (!token) return null;
  try {
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
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) raw = raw.slice(0, 1_000_000);
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function actionFromReq(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const q = url.searchParams.get('action') || url.searchParams.get('route');
  if (q) return String(q).toLowerCase().replace(/_/g, '-');
  const parts = (url.pathname || '').split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'apify');
  if (idx >= 0 && parts[idx + 1]) {
    const a = parts[idx + 1].toLowerCase();
    if (a === 'runs' && parts[idx + 2]) return `runs/${parts[idx + 2]}`;
    if (a === 'datasets' && parts[idx + 2]) return `datasets/${parts[idx + 2]}`;
    if (a === 'actors' && parts[idx + 2] === 'run') return 'actors-run';
    return a;
  }
  return 'status';
}

export default async function handler(req, res) {
  const auth = await requireAdmin(req);
  if (!auth) {
    return json(res, 401, { ok: false, error: 'Admin authorization required', code: 'unauthorized' });
  }

  const action = actionFromReq(req);
  const method = (req.method || 'GET').toUpperCase();

  try {
    if (action === 'status' && method === 'GET') {
      const configured = isApifyConfigured();
      let connection = null;
      if (configured) connection = await testConnection({ timeoutMs: 10_000 });
      return json(res, 200, {
        ok: true,
        provider: 'apify',
        configured,
        status: configured ? connection?.status || 'connected' : 'not_configured',
        message: configured
          ? connection?.message || 'Configured'
          : 'Missing env: APIFY_TOKEN — set in Vercel Project Settings → Environment Variables',
        mcp_status: 'available_not_enabled',
        mcp_note:
          'Apify MCP Server (https://mcp.apify.com) can be enabled later as server-side MCP; token must stay server-only.',
        cost_safeguards: { default_max_results: DEFAULT_MAX_RESULTS, hard_cap: HARD_CAP_RESULTS },
        username: connection?.username || null,
        last_checked_at: new Date().toISOString()
      });
    }

    if ((action === 'test' || action === 'test-connection') && method === 'POST') {
      const result = await testConnection({ timeoutMs: 12_000 });
      return json(res, result.ok ? 200 : result.status === 'not_configured' ? 503 : 502, result);
    }

    if ((action === 'actors-run' || action === 'actors/run' || action === 'run') && method === 'POST') {
      const body = await readBody(req);
      const actorId = body.actorId || body.actor_id || body.actor;
      if (!actorId) return json(res, 400, { ok: false, error: 'actorId required' });
      const input = { ...(body.input || body) };
      delete input.actorId;
      delete input.actor_id;
      delete input.actor;
      if (input.maxCrawledPlaces != null) input.maxCrawledPlaces = clampMaxResults(input.maxCrawledPlaces);
      if (input.maxResults != null) input.maxResults = clampMaxResults(input.maxResults);
      const started = await runActor(String(actorId), input, {
        hardCap: HARD_CAP_RESULTS,
        defaultMax: DEFAULT_MAX_RESULTS
      });
      return json(res, 200, { ok: true, ...started, note: 'Run started. Poll GET runs/:id. No auto CRM import.' });
    }

    if (action.startsWith('runs/') && method === 'GET') {
      const runId = action.slice('runs/'.length);
      const run = await getRun(runId);
      return json(res, 200, run);
    }
    if (action === 'runs' && method === 'GET') {
      return json(res, 400, { ok: false, error: 'run id required: /api/integrations/apify/runs/:id' });
    }

    if (action.startsWith('datasets/') && method === 'GET') {
      const datasetId = action.slice('datasets/'.length);
      const url = new URL(req.url || '/', 'http://localhost');
      const limit = clampMaxResults(url.searchParams.get('limit') || DEFAULT_MAX_RESULTS);
      const ds = await getDatasetItems(datasetId, { limit });
      return json(res, 200, ds);
    }

    if ((action === 'maps-leads' || action === 'maps_leads' || action === 'google-maps-leads') && method === 'POST') {
      const body = await readBody(req);
      const maxResults = clampMaxResults(body.maxResults ?? body.limit ?? 3);
      const workflow = await runApifyGoogleMapsLeadWorkflow(
        {
          keyword: body.keyword || body.query || 'مطاعم',
          city: body.city || 'المدينة المنورة',
          maxResults,
          industry: body.industry,
          actorId: body.actorId || body.actor_id
        },
        {
          commitCandidates: false,
          existingLeads: Array.isArray(body.existingLeads) ? body.existingLeads : []
        }
      );
      return json(res, workflow.ok ? 200 : 502, {
        ...workflow,
        preview_only: true,
        crm_written: false,
        outreach_sent: false
      });
    }

    return json(res, 404, {
      ok: false,
      error: 'Unknown action',
      supported: ['status', 'test', 'actors-run', 'runs/:id', 'datasets/:id', 'maps-leads']
    });
  } catch (e) {
    const status = e.status || (e.code === 'not_configured' ? 503 : 500);
    return json(res, status, {
      ok: false,
      error: e.message || 'Apify API error',
      code: e.code || 'apify_error'
    });
  }
}
