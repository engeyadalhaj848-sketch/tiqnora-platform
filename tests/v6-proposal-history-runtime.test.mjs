import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../api/v6.js', import.meta.url), 'utf8');

test('Proposal history is an authenticated V6 route', () => {
  assert.equal(api.includes("if (route === 'proposal_history') return await handleProposalHistory(req, res, auth);"), true);
  const authIndex = api.indexOf("const auth = await requireAdmin(req);");
  const historyIndex = api.indexOf("if (route === 'proposal_history')");
  assert.ok(authIndex >= 0 && historyIndex > authIndex);
});

test('Proposal history only reads proposal_review actions and exposes delivery fields', () => {
  assert.equal(api.includes("action_type=eq.proposal_review"), true);
  assert.equal(api.includes("delivery_status: deliveryStatus"), true);
  assert.equal(api.includes("outbound_external_id: result.outbound_external_id || null"), true);
  assert.equal(api.includes("read: proposals.filter"), true);
});
