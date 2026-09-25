import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const api = readFileSync(new URL('../api/v6.js', import.meta.url), 'utf8');

test('Proposal sent CRM activity uses an allowed activity_type', () => {
  assert.equal(api.includes("activity_type: 'proposal_sent'"), false);
  assert.equal(api.includes("activity_type: 'system'"), true);
  assert.equal(api.includes("kind: 'proposal_sent'"), true);
});

test('V6 CRM migration is ordered after main 046 and 047 migrations', () => {
  assert.equal(existsSync(new URL('../supabase/migrations/046_v6_crm_core.sql', import.meta.url)), false);
  assert.equal(existsSync(new URL('../supabase/migrations/048_v6_crm_core.sql', import.meta.url)), true);
});
