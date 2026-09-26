import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../api/mcp/social.js', import.meta.url), 'utf8');

test('MCP social bridge exposes core tools and keeps Gemini optional', () => {
  for (const name of ['social.create_draft','social.create_variants','social.create_creative_brief','social.publish','social.status']) {
    assert.equal(bridge.includes(name), true, name);
  }
  assert.equal(bridge.includes("primary_provider:'mcp'"), true);
  assert.equal(bridge.includes("fallback_provider:'gemini_optional'"), true);
});

test('MCP tool execution requires admin auth and publish uses approval gate', () => {
  assert.equal(bridge.includes('verifyAdmin(req.headers.authorization'), true);
  assert.equal(bridge.includes("['admin','super_admin']"), true);
  assert.equal(bridge.includes('const gate=canPublish(args.content||{})'), true);
  assert.equal(bridge.includes('Boolean(gate?.ok)'), true);
  assert.equal(bridge.includes("status:'queued'"), true);
  assert.equal(bridge.includes("requires_approval:false"), true);
  assert.equal(bridge.includes("source:'mcp'"), true);
  assert.equal(bridge.includes('resolveOrganization'), true);
});

test('MCP bridge implements initialize, tools/list and tools/call JSON-RPC methods', () => {
  assert.equal(bridge.includes("body.method==='initialize'"), true);
  assert.equal(bridge.includes("body.method==='tools/list'"), true);
  assert.equal(bridge.includes("body.method==='tools/call'"), true);
  assert.equal(bridge.includes("body.jsonrpc!=='2.0'"), true);
});
