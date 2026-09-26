import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../api/v6.js', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../lib/v6/social-runtime.js', import.meta.url), 'utf8');

test('MCP social bridge is consolidated into the existing V6 function', () => {
  assert.equal(api.includes("route === 'mcp_social'"), true);
  assert.equal(api.includes('handleMcpSocial'), true);
  assert.equal(api.includes('MCP_SOCIAL_TOOL_DEFS'), true);
  assert.equal(runtime.includes("primary_provider:'mcp'"), true);
  assert.equal(runtime.includes("fallback_provider:'gemini_optional'"), true);
});

test('MCP tool execution requires admin auth and persisted approved content', () => {
  assert.equal(api.includes('const auth = await requireAdmin(req)'), true);
  assert.equal(runtime.includes('persisted_content_required'), true);
  assert.equal(runtime.includes('const gate=canPublish(persisted.publishable)'), true);
  assert.equal(runtime.includes('if(!gate?.ok)'), true);
  assert.equal(runtime.includes("requires_approval:false"), true);
  assert.equal(runtime.includes("source:'mcp'"), true);
});

test('MCP bridge implements initialize, tools/list and tools/call JSON-RPC methods', () => {
  assert.equal(api.includes("body.method === 'initialize'"), true);
  assert.equal(api.includes("body.method === 'tools/list'"), true);
  assert.equal(api.includes("body.method !== 'tools/call'"), true);
  assert.equal(api.includes("body.jsonrpc !== '2.0'"), true);
});
