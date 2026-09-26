import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('commerce AI requires exact admin roles and removes wildcard CORS', () => {
  const src = read('api/commerce/ai.js');
  assert.match(src, /async function requireAdmin\(/);
  assert.match(src, /\['admin', 'super_admin'\]/);
  assert.match(src, /const admin = await requireAdmin\(req\.headers\?\.authorization/);
  assert.doesNotMatch(src, /Access-Control-Allow-Origin', '\*'/);
});

test('admin commerce calls always use authenticated helper', () => {
  const src = read('js/admin-app.js');
  assert.match(src, /async function commerceAi\(/);
  assert.match(src, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.doesNotMatch(src, /fetch\('\/api\/commerce\/ai/);
});

test('bulk action fails closed and permits only exact platform admin roles', () => {
  const src = read('api/products/bulk-action.js');
  assert.match(src, /if \(!SERVICE\) return \{ ok: false, status: 503/);
  assert.match(src, /\['admin', 'super_admin'\]\.includes\(role\)/);
  assert.doesNotMatch(src, /\/admin\/i\.test/);
  assert.doesNotMatch(src, /\['admin', 'super_admin', 'owner'\]/);
});

test('AliExpress OAuth start is admin-authenticated and state binds initiating admin', () => {
  const src = read('api/billing/providers.js');
  assert.match(src, /handleAliExpressConnect\(req, res, url\)/);
  assert.match(src, /const admin = await requireAdminUser\(req\)/);
  assert.match(src, /admin_user_id: admin\.user\.id/);
  assert.match(src, /authorize_url: auth\.url/);
});

test('AliExpress callback requires authorized state and status does not mint OAuth URLs', () => {
  const src = read('api/billing/providers.js');
  assert.match(src, /stateData\.provider !== 'aliexpress'/);
  assert.match(src, /!stateData\.admin_user_id/);
  assert.match(src, /initiating_admin_not_authorized/);
  assert.match(src, /authorize_url_ready: false/);
  assert.match(src, /authorize_url: null/);
});

test('social OAuth start and callback bind admin and organization in signed state', () => {
  const src = read('api/social/oauth/[provider].js');
  assert.match(src, /async function authenticateAdmin\(/);
  assert.match(src, /\['super_admin', 'admin'\]/);
  assert.match(src, /admin_user_id: authn\.admin\.id/);
  assert.match(src, /organization_id: organizationId/);
  assert.match(src, /!state\.organization_id \|\| !state\.admin_user_id/);
});

test('social OAuth UI starts authorization with current admin bearer session', () => {
  const src = read('js/social-inbox-admin.js');
  assert.match(src, /format: 'json'/);
  assert.match(src, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(src, /payload\.authorize_url/);
});
