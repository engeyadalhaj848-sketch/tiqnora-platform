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
  'media.generate_video': z.object({
    prompt: z.string().min(1),
    organization_id: z.string().optional(),
    aspect_ratio: z.enum(['9:16', '16:9']).optional(),
    duration_seconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
    resolution: z.enum(['720p', '1080p']).optional()
  }).passthrough(),
  'media.video_status': z.object({}).passthrough()
});

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

const NATIVE_TOOL_DEFS = Object.freeze([...MCP_SOCIAL_TOOL_DEFS, ...MCP_MEDIA_TOOL_DEFS]);

async function executeNativeTool(name, args, admin, executeSocialTool) {
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

function buildNativeServer({ authInfo, era }, executeTool) {
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
          idempotentHint: definition.name === 'social.status',
          readOnlyHint: definition.name === 'social.status',
          openWorldHint: definition.name === 'social.publish'
        }
      },
      async (args, ctx) => {
        const admin = ctx.http?.authInfo?.tiqnoraAuth || authInfo?.tiqnoraAuth || null;
        if (!admin) {
          return textResult({ ok: false, error: 'admin_auth_required' }, true);
        }
        try {
          const result = await executeNativeTool(definition.name, args || {}, admin, executeTool);
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
  executeTool = executeMcpSocialTool
} = {}) {
  return createMcpHandler(
    (ctx) => buildNativeServer(ctx, executeTool),
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
