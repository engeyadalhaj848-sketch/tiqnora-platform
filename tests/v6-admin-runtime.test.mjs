import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/admin-app.js', import.meta.url), 'utf8');

test('V6 proposal price inputs use a collection selector', () => {
  assert.equal(source.includes("const rows = $$('[data-proposal-price]');"), true);
  assert.equal(/(^|[^$])\$\('\[data-proposal-price\]'\)/m.test(source), false);
});

test('V6 pending approval buttons use collection selectors', () => {
  assert.equal(source.includes("$$('[data-v6-approve]').forEach"), true);
  assert.equal(source.includes("$$('[data-v6-reject]').forEach"), true);
  assert.equal(/(^|[^$])\$\('\[data-v6-approve\]'\)\.forEach/m.test(source), false);
  assert.equal(/(^|[^$])\$\('\[data-v6-reject\]'\)\.forEach/m.test(source), false);
});


test('V6 proposal delivery requires an explicit send action in the admin UI', () => {
  assert.equal(source.includes('data-v6-send-proposal'), true);
  assert.equal(source.includes("v6Api('proposal_delivery'"), true);
  assert.equal(source.includes("fetch('/api/social/reply'"), true);
  assert.equal(source.includes("action_id: prepared.action_id"), true);
  assert.equal(source.includes("op: 'record_sent'"), true);
});

test('Approval itself still does not auto execute or auto send', () => {
  assert.equal(source.includes("body: { op: 'approve', autoExecute: false }"), true);
});
