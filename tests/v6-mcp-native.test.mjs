import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  createTiqnoraNativeMcpHandler,
  toMcpAuthInfo,
  verifyTiqnoraMcpAdminToken
} from '../lib/v6/workforce/mcp-native.js';

function fakeAdminAuth() {
  return {
    token: 'admin-token',
    user: { id: '00000000-0000-4000-8000-000000000001' },
    profile: {
      id: '00000000-0000-4000-8000-000000000001',
      role: 'super_admin',
      is_active: true,
      default_organization_id: '00000000-0000-4000-8000-000000000099'
    }
  };
}

function inProcessTransport(handler, authInfo, { modern = true } = {}) {
  return new StreamableHTTPClientTransport(new URL('https://test.local/api/v6?route=mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init), authInfo ? { authInfo } : {})
  });
}

describe('official MCP v2 server/client handshake', () => {
  test('modern 2026-era client discovers tools/resources and calls an authenticated tool', async () => {
    const calls = [];
    const handler = createTiqnoraNativeMcpHandler({
      executeTool: async (name, args, auth) => {
        calls.push({ name, args, auth });
        return { ok: true, tool: name, admin_id: auth.user.id };
      }
    });
    const authInfo = toMcpAuthInfo(fakeAdminAuth());
    const client = new Client(
      { name: 'tiqnora-native-test', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const transport = inProcessTransport(handler, authInfo);

    await client.connect(transport);
    assert.equal(client.getProtocolEra(), 'modern');

    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === 'social.status'));
    assert.ok(tools.tools.some((tool) => tool.name === 'social.publish'));

    const resources = await client.listResources();
    assert.ok(resources.resources.some((resource) => resource.uri === 'tiqnora://agent-runtime/status'));
    assert.ok(resources.resources.some((resource) => resource.uri === 'tiqnora://social/tools'));

    const read = await client.readResource({ uri: 'tiqnora://agent-runtime/status' });
    const runtime = JSON.parse(read.contents[0].text);
    assert.equal(runtime.native, true);
    assert.equal(runtime.sdk, '@modelcontextprotocol/server');
    assert.equal(runtime.protocol_era, 'modern');

    const result = await client.callTool({ name: 'social.status', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].auth.profile.role, 'super_admin');

    await transport.close();
    await handler.close();
  });

  test('legacy initialize clients are still supported by the native SDK handler', async () => {
    const handler = createTiqnoraNativeMcpHandler({
      executeTool: async () => ({ ok: true })
    });
    const client = new Client({ name: 'legacy-test', version: '1.0.0' });
    const transport = inProcessTransport(handler, toMcpAuthInfo(fakeAdminAuth()), { modern: false });

    await client.connect(transport);
    assert.equal(client.getProtocolEra(), 'legacy');
    const tools = await client.listTools();
    assert.ok(tools.tools.length >= 5);

    await transport.close();
    await handler.close();
  });

  test('tool calls fail closed without admin auth while discovery remains available', async () => {
    const handler = createTiqnoraNativeMcpHandler({
      executeTool: async () => {
        throw new Error('must_not_execute');
      }
    });
    const client = new Client(
      { name: 'anonymous-test', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const transport = inProcessTransport(handler, null);

    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === 'social.status'));

    const result = await client.callTool({ name: 'social.status', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /admin_auth_required/);

    await transport.close();
    await handler.close();
  });
});

describe('native MCP auth verification', () => {
  test('valid active admin token becomes MCP auth info', async () => {
    const responses = [
      { ok: true, json: async () => ({ id: 'user-1' }) },
      { ok: true, json: async () => [{ id: 'user-1', role: 'admin', is_active: true, default_organization_id: 'org-1' }] }
    ];
    const fetchImpl = async () => responses.shift();
    const auth = await verifyTiqnoraMcpAdminToken('jwt', {
      env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon' },
      fetchImpl
    });
    assert.equal(auth.profile.role, 'admin');
    const authInfo = toMcpAuthInfo(auth);
    assert.equal(authInfo.clientId, 'user-1');
    assert.ok(authInfo.scopes.includes('mcp:tools'));
  });

  test('non-admin token is rejected', async () => {
    const responses = [
      { ok: true, json: async () => ({ id: 'user-2' }) },
      { ok: true, json: async () => [{ id: 'user-2', role: 'customer', is_active: true }] }
    ];
    const auth = await verifyTiqnoraMcpAdminToken('jwt', {
      env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon' },
      fetchImpl: async () => responses.shift()
    });
    assert.equal(auth, null);
  });
});

test('consolidated V6 route mounts native MCP and preserves compatibility bridge', () => {
  const api = readFileSync(new URL('../api/v6.js', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(api, /route === 'mcp'/);
  assert.match(api, /handleTiqnoraNativeMcp/);
  assert.match(api, /route === 'mcp_social'/);
  assert.equal(pkg.dependencies['@modelcontextprotocol/server'].startsWith('^2.'), true);
  assert.equal(pkg.devDependencies['@modelcontextprotocol/client'].startsWith('^2.'), true);
});
