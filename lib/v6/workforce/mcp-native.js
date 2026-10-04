import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { MCP_SOCIAL_TOOL_DEFS, executeMcpSocialTool } from '../social-runtime.js';
import { AGENT_CONCEPTS } from '../agent-runtime.js';
import { runVideoGeneration, videoProviderStatus } from '../video-designer.js';

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

const looseObject = z.object({}).passthrough();
const toolSchemas = Object.freeze({
  'social.create_draft': z.object({
    campaign: looseObject.optional(),
    idea: looseObject.optional(),
    brand_profile: looseObject.optional()
  }).passthrough(),
  'social.create_variants': z.object({
    draft: looseObject,
    platforms: z.array(z.string()).optional(),
    brand_profile: looseObject.optional()
  }).passthrough(),
  'social.create_creative_brief': z.object({
    draft: looseObject,
    platform: z.string().optional(),
    brand_profile: looseObject.optional()
  }).passthrough(),
  'social.publish': z.object({
    content_id: z.string().optional(),
    variant_id: z.string().optional(),
    organization_id: z.string().optional(),
    platform: z.string().optional(),
    scheduled_at: z.string().optional(),
    image_url: z.string().optional()
  }).passthrough(),
  'social.status': z.object({}).passthrough(),
  'knowledge.search': z.object({
    query: z.string().min(1).max(2000),
    organization_id: z.string().optional(),
    limit: z.number().int().min(1).max(8).optional()
  }).passthrough(),
  'memory.read': z.object({
    organization_id: z.string().optional(),
    agent_key: z.string().optional(),
    memory_type: z.enum(['working','episodic','semantic','shared','customer']).optional(),
    limit: z.number().int().min(1).max(50).optional()
  }).passthrough(),
  'learning.read': z.object({
    organization_id: z.string().optional(),
    agent_key: z.string().optional(),
    limit: z.number().int().min(1).max(20).optional()
  }).passthrough(),
  'eval.read': z.object({
    organization_id: z.string().optional(),
    agent_id: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional()
  }).passthrough(),
  'media.generate_video': z.object({
    prompt: z.string().min(1),
    organization_id: z.string().optional(),
    aspect_ratio: z.enum(['9:16', '16:9']).optional(),
    duration_seconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
    resolution: z.enum(['720p', '1080p']).optional()
  }).passthrough(),
  'media.video_status': z.object({}).passthrough()
});

const MCP_CONTEXT_TOOL_DEFS = Object.freeze([
  {
    name: 'knowledge.search',
    description: 'Search Tiqnora organization knowledge through the live RAG knowledge RPC. Read-only and tenant-scoped.',
    inputSchema: { type: 'object', required: ['query'] }
  },
  {
    name: 'memory.read',
    description: 'Read current Tiqnora organization/agent memory entries. Read-only and tenant-scoped.',
    inputSchema: { type: 'object' }
  },
  {
    name: 'learning.read',
    description: 'Read approved Tiqnora learning lessons from previous evaluated work. Read-only and tenant-scoped.',
    inputSchema: { type: 'object' }
  },
  {
    name: 'eval.read',
    description: 'Read recent Tiqnora agent evaluation results for evidence-backed quality review. Read-only and tenant-scoped.',
    inputSchema: { type: 'object' }
  }
]);

const MCP_MEDIA_TOOL_DEFS = Object.freeze([
  {
    name: 'media.generate_video',
    description: 'Generate a real approval-gated Tiqnora video draft through the configured Veo provider.',
    inputSchema: { type: 'object', required: ['prompt'] }
  },
  {
    name: 'media.video_status',
    description: 'Return the real Video Designer provider/runtime status.',
    inputSchema: { type: 'object' }
  }
]);

const NATIVE_TOOL_DEFS = Object.freeze([...MCP_CONTEXT_TOOL_DEFS, ...MCP_SOCIAL_TOOL_DEFS, ...MCP_MEDIA_TOOL_DEFS]);

function resolveOrganizationId(args, admin) {
  const organizationId = String(args?.organization_id || admin?.profile?.default_organization_id || '').trim();
  if (!organizationId) throw new Error('organization_id_required');
  return organizationId;
}

async function supabaseToolJson(path, admin, {
  env = process.env,
  fetchImpl = fetch,
  method = 'GET',
  body
} = {}) {
  if (!admin?.token) throw new Error('admin_auth_required');
  const supabaseUrl = String(env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const response = await fetchImpl(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${admin.token}`,
      'Content-Type': 'application/json'
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const detail = payload?.message || payload?.error || `supabase_${response.status}`;
    throw new Error(String(detail).slice(0, 300));
  }
  return payload;
}

async function executeContextReadTool(name, args, admin, options = {}) {
  const organizationId = resolveOrganizationId(args, admin);

  if (name === 'knowledge.search') {
    const query = String(args.query || '').trim();
    if (!query) throw new Error('query_required');
    const limit = Math.max(1, Math.min(Number(args.limit) || 8, 8));
    const rows = await supabaseToolJson('/rest/v1/rpc/search_agent_knowledge', admin, {
      ...options,
      method: 'POST',
      body: {
        p_organization_id: organizationId,
        p_query: query,
        p_match_count: limit
      }
    });
    return {
      ok: true,
      organization_id: organizationId,
      mode: 'lexical_rpc',
      results: (Array.isArray(rows) ? rows : []).slice(0, limit).map((row) => ({
        id: row.id || null,
        document_id: row.document_id || null,
        title: row.title || 'Tiqnora Knowledge',
        source_uri: row.source_uri || null,
        content: String(row.content || '').slice(0, 2400),
        score: Number(row.rank ?? row.lexical_rank ?? 0)
      }))
    };
  }

  if (name === 'memory.read') {
    const limit = Math.max(1, Math.min(Number(args.limit) || 20, 50));
    const rows = await supabaseToolJson(
      `/rest/v1/agent_memory_entries?organization_id=eq.${encodeURIComponent(organizationId)}&archived_at=is.null&select=memory_id,agent_key,memory_type,scope,key,content,summary,confidence,source,tags,updated_at&order=updated_at.desc&limit=100`,
      admin,
      options
    );
    let filtered = Array.isArray(rows) ? rows : [];
    if (args.memory_type) filtered = filtered.filter((row) => row.memory_type === args.memory_type);
    if (args.agent_key) {
      const wanted = String(args.agent_key).toLowerCase();
      filtered = filtered.filter((row) =>
        !row.agent_key ||
        String(row.agent_key).toLowerCase() === wanted ||
        ['shared','organization'].includes(String(row.scope || '').toLowerCase())
      );
    }
    return { ok: true, organization_id: organizationId, results: filtered.slice(0, limit) };
  }

  if (name === 'learning.read') {
    const limit = Math.max(1, Math.min(Number(args.limit) || 10, 20));
    const rows = await supabaseToolJson(
      `/rest/v1/ai_agent_learning_events?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.approved&select=id,agent_id,lesson_key,lesson,status,metadata,created_at&order=created_at.desc&limit=100`,
      admin,
      options
    );
    let filtered = Array.isArray(rows) ? rows : [];
    if (args.agent_key) {
      const wanted = String(args.agent_key).toLowerCase();
      filtered = filtered.filter((row) => {
        const key = String(row.metadata?.agent_key || '').toLowerCase();
        const scope = String(row.metadata?.scope || '').toLowerCase();
        return key === wanted || ['shared','organization'].includes(scope);
      });
    }
    return { ok: true, organization_id: organizationId, results: filtered.slice(0, limit) };
  }

  if (name === 'eval.read') {
    const limit = Math.max(1, Math.min(Number(args.limit) || 20, 50));
    const agentFilter = args.agent_id ? `&agent_id=eq.${encodeURIComponent(args.agent_id)}` : '';
    const rows = await supabaseToolJson(
      `/rest/v1/ai_agent_evals?organization_id=eq.${encodeURIComponent(organizationId)}${agentFilter}&select=id,agent_id,rubric,score,passed,dimensions,failures,metadata,created_at&order=created_at.desc&limit=${limit}`,
      admin,
      options
    );
    return { ok: true, organization_id: organizationId, results: Array.isArray(rows) ? rows.slice(0, limit) : [] };
  }

  throw new Error('unsupported_context_tool');
}

async function executeNativeTool(name, args, admin, executeSocialTool, options = {}) {
  if (MCP_CONTEXT_TOOL_DEFS.some((tool) => tool.name === name)) {
    return executeContextReadTool(name, args, admin, options);
  }
  if (name === 'media.video_status') return { ok: true, ...videoProviderStatus() };
  if (name === 'media.generate_video') {
    const generated = await runVideoGeneration({
      message: args.prompt,
      organizationId: args.organization_id || admin?.profile?.default_organization_id || null,
      aspectRatio: args.aspect_ratio || '9:16',
      durationSeconds: args.duration_seconds || 8,
      resolution: args.resolution || '720p',
      campaignName: 'MCP Video Draft'
    });
    const { output_b64, ...safe } = generated;
    return { ok: generated.generation_status === 'succeeded', ...safe, has_video: Boolean(output_b64) };
  }
  return executeSocialTool(name, args, admin);
}

function textResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
    ...(isError ? {} : { structuredContent: value })
  };
}

async function readJson(response) {
  return response.json().catch(() => null);
}

export async function verifyTiqnoraMcpAdminToken(
  token,
  { env = process.env, fetchImpl = fetch } = {}
) {
  const bearer = String(token || '').trim();
  if (!bearer) return null;
  const supabaseUrl = String(env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` }
  });
  const user = await readJson(userResponse);
  if (!userResponse.ok || !user?.id) return null;

  const profileResponse = await fetchImpl(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active,default_organization_id&limit=1`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` } }
  );
  const profiles = await readJson(profileResponse);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile || !profile.is_active || !['admin', 'super_admin'].includes(profile.role)) return null;

  return { user, profile, token: bearer };
}

export function toMcpAuthInfo(adminAuth) {
  if (!adminAuth?.token || !adminAuth?.user?.id) return undefined;
  return {
    token: adminAuth.token,
    clientId: String(adminAuth.user.id),
    scopes: ['tiqnora:admin', 'mcp:tools', 'mcp:resources'],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    tiqnoraAuth: adminAuth
  };
}

function buildNativeServer({ authInfo, era }, executeTool, runtimeOptions = {}) {
  const server = new McpServer(
    { name: 'tiqnora-native-mcp', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  for (const definition of NATIVE_TOOL_DEFS) {
    server.registerTool(
      definition.name,
      {
        title: definition.name,
        description: definition.description,
        inputSchema: toolSchemas[definition.name] || looseObject,
        annotations: {
          destructiveHint: definition.name === 'social.publish',
          idempotentHint: definition.name === 'social.status' || definition.name.endsWith('.read') || definition.name.endsWith('.search'),
          readOnlyHint: definition.name === 'social.status' || definition.name.endsWith('.read') || definition.name.endsWith('.search'),
          openWorldHint: definition.name === 'social.publish'
        }
      },
      async (args, ctx) => {
        const admin = ctx.http?.authInfo?.tiqnoraAuth || authInfo?.tiqnoraAuth || null;
        if (!admin) {
          return textResult({ ok: false, error: 'admin_auth_required' }, true);
        }
        try {
          const result = await executeNativeTool(definition.name, args || {}, admin, executeTool, runtimeOptions);
          return textResult(result);
        } catch (error) {
          return textResult({
            ok: false,
            error: String(error?.message || 'tool_error').slice(0, 500)
          }, true);
        }
      }
    );
  }

  server.registerResource(
    'runtime-status',
    'tiqnora://agent-runtime/status',
    {
      title: 'Tiqnora Agent Runtime Status',
      description: 'Runtime concepts and MCP-native capability declaration.',
      mimeType: 'application/json'
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({
          name: 'tiqnora-native-mcp',
          native: true,
          sdk: '@modelcontextprotocol/server',
          protocol_era: era,
          concepts: AGENT_CONCEPTS,
          tools: NATIVE_TOOL_DEFS.map((tool) => tool.name),
          video_provider: videoProviderStatus(),
          approval_required_for_external_actions: true
        })
      }]
    })
  );

  server.registerResource(
    'social-tool-catalog',
    'tiqnora://social/tools',
    {
      title: 'Tiqnora Social Tool Catalog',
      description: 'Approval-gated social tools exposed through the native MCP server.',
      mimeType: 'application/json'
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(MCP_SOCIAL_TOOL_DEFS)
      }]
    })
  );

  return server;
}

export function createTiqnoraNativeMcpHandler({
  executeTool = executeMcpSocialTool,
  fetchImpl = fetch,
  env = process.env
} = {}) {
  return createMcpHandler(
    (ctx) => buildNativeServer(ctx, executeTool, { fetchImpl, env }),
    {
      responseMode: 'json',
      legacy: 'stateless',
      maxRequestBodySize: 1024 * 1024
    }
  );
}

export const tiqnoraNativeMcpHandler = createTiqnoraNativeMcpHandler();

function bearer(req) {
  const value = String(req.headers?.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function requestUrl(req) {
  const protocol = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers?.host || 'www.tiqnora.com');
  return new URL(req.url || '/api/v6?route=mcp', `${protocol}://${host}`);
}

function webHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, String(item)));
    else headers.set(key, String(value));
  }
  return headers;
}

async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-length') return;
    res.setHeader(key, value);
  });

  if (!response.body) return res.end();
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value?.length) res.write(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return res.end();
}

export async function handleTiqnoraNativeMcp(req, res, {
  handler = tiqnoraNativeMcpHandler,
  verifyAdmin = verifyTiqnoraMcpAdminToken
} = {}) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.statusCode = 405;
    return res.end('Method not allowed');
  }

  const token = bearer(req);
  let authInfo;
  if (token) {
    const admin = await verifyAdmin(token);
    if (!admin) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Bearer realm="tiqnora-mcp"');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'invalid_or_unauthorized_token' }));
    }
    authInfo = toMcpAuthInfo(admin);
  }

  const request = new Request(requestUrl(req), {
    method: req.method,
    headers: webHeaders(req)
  });

  const response = await handler.fetch(request, {
    ...(authInfo ? { authInfo } : {}),
    ...(req.body !== undefined ? { parsedBody: req.body } : {})
  });
  return sendWebResponse(res, response);
}

export default {
  createTiqnoraNativeMcpHandler,
  handleTiqnoraNativeMcp,
  verifyTiqnoraMcpAdminToken,
  toMcpAuthInfo
};
