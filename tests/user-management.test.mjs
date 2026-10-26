import test from 'node:test';
import assert from 'node:assert/strict';
import { manageUsers } from '../lib/user-management.js';
const id = '11111111-1111-4111-8111-111111111111';
const auth = { user: { id, email_confirmed_at: '2026-01-01' }, profile: { role: 'super_admin', is_active: true } };
const defaults = { auth, method: 'PATCH', body: { id, password: 'Long-test-password!' }, base: 'https://example.supabase.co', service: 'server-only-test' };
test('rejects inactive, ordinary, unconfirmed and missing owners before network access', async () => {
  for (const actor of [null, { ...auth, profile: { role: 'admin', is_active: true } }, { ...auth, profile: { role: 'super_admin', is_active: false } }, { ...auth, user: { id } }]) {
    await assert.rejects(manageUsers({ ...defaults, auth: actor, fetchImpl: () => assert.fail('network forbidden') }), { status: 403 });
  }
});
test('rejects weak passwords, unknown fields and privilege escalation', async () => {
  for (const body of [{ id, password: 'short' }, { ...defaults.body, role: 'super_admin' }]) await assert.rejects(manageUsers({ ...defaults, body }), { status: 400 });
  await assert.rejects(manageUsers({ ...defaults, method: 'POST', body: { email: 'x@example.com', full_name: 'x', role: 'super_admin', password: 'Long-test-password!' } }), { status: 400 });
});
test('updates password only and never returns or audits secrets', async () => {
  const calls = [];
  const result = await manageUsers({ ...defaults, fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(calls.length === 1 ? [{ id, role: 'super_admin' }] : {})); } });
  assert.equal(result.ok, true);
  assert.equal(calls[1].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].init.body), { password: defaults.body.password });
  assert.ok(!JSON.stringify(result).includes(defaults.body.password));
  assert.ok(!calls[2].init.body.includes(defaults.body.password));
});
test('cannot change another owners password', async () => {
  await assert.rejects(manageUsers({ ...defaults, auth: { ...auth, user: { ...auth.user, id: 'other' } }, fetchImpl: async () => new Response(JSON.stringify([{ id, role: 'super_admin' }])) }), { status: 403 });
});
test('create maps account and role without falsely confirming email', async () => {
  const calls = [];
  const result = await manageUsers({ ...defaults, method: 'POST', body: { email: 'new@example.com', full_name: 'New', role: 'admin', password: defaults.body.password }, fetchImpl: async (url, init) => {
    calls.push({ url, init }); return new Response(JSON.stringify(calls.length === 1 ? { id } : calls.length === 2 ? [{ id }] : {}));
  } });
  assert.equal(result.requires_email_confirmation, true);
  assert.equal(JSON.parse(calls[0].init.body).email_confirm, false);
  assert.equal(JSON.parse(calls[1].init.body).role, 'admin');
});
test('provider failure does not report success or leak provider data', async () => {
  await assert.rejects(manageUsers({ ...defaults, fetchImpl: async () => new Response('{"message":"secret-debug"}', { status: 500 }) }), err => err.status === 502 && !err.message.includes('secret-debug'));
});
test('missing profile after creation suspends partial account', async () => {
  const calls = [];
  await assert.rejects(manageUsers({ ...defaults, method: 'POST', body: { email: 'new@example.com', full_name: 'New', password: defaults.body.password }, fetchImpl: async (url, init) => {
    calls.push({ url, init }); return new Response(JSON.stringify(calls.length === 1 ? { id } : calls.length === 2 ? [] : {}));
  } }), { status: 502 });
  assert.equal(JSON.parse(calls[2].init.body).ban_duration, '876000h');
});
