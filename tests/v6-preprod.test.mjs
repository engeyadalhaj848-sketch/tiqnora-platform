import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const api = readFileSync(new URL('../api/v6.js', import.meta.url), 'utf8');

test('Proposal sent CRM activity uses an allowed activity_type', () => {
  assert.equal(api.includes("activity_type: 'proposal_sent'"), false);
  assert.equal(api.includes("activity_type: 'system'"), true);
  assert.equal(api.includes("kind: 'proposal_sent'"), true);
});

test('V6 CRM migration is ordered after current main 046 and 047 migrations', () => {
  assert.equal(existsSync(new URL('../supabase/migrations/046_social_notifications_realtime.sql', import.meta.url)), true);
  assert.equal(existsSync(new URL('../supabase/migrations/047_whatsapp_ai_auto_reply.sql', import.meta.url)), true);
  assert.equal(existsSync(new URL('../supabase/migrations/046_v6_crm_core.sql', import.meta.url)), false);
  assert.equal(existsSync(new URL('../supabase/migrations/048_v6_crm_core.sql', import.meta.url)), true);
});

test('Vercel Hobby serverless API count remains exactly 11', () => {
  const root = fileURLToPath(new URL('../api/', import.meta.url));
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  const functions = walk(root).filter(path => /\.(?:js|mjs|ts)$/.test(path));
  assert.equal(functions.length, 11, functions.join('\n'));
});


test('core serverless modules load without syntax or export errors', async () => {
  const [v6, billing] = await Promise.all([
    import('../api/v6.js'),
    import('../api/billing/providers.js')
  ]);
  assert.equal(typeof v6.default, 'function');
  assert.equal(typeof billing.default, 'function');
});
