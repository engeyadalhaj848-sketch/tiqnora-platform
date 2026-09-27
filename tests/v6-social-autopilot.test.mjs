import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const autopilot = readFileSync(new URL('../lib/v6/social-autopilot.js', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../api/reports/telegram.js', import.meta.url), 'utf8');
const workforceChat = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/060_daily_social_autopilot.sql', import.meta.url), 'utf8');

test('daily social autopilot is collaborative and OpenAI-backed through shared provider', () => {
  assert.equal(autopilot.includes('managerDirective'), true);
  assert.equal(autopilot.includes('marketingBrief'), true);
  assert.equal(autopilot.includes('socialPackage'), true);
  assert.equal(autopilot.includes("generateStructured"), true);
  assert.equal(autopilot.includes("collaboration:['manager','marketing','content','social-media','image-designer']"), true);
});

test('daily social autopilot only queues currently supported feed platforms', () => {
  assert.equal(autopilot.includes("['facebook','instagram']"), true);
  assert.equal(autopilot.includes("platforms.has('facebook')"), true);
  assert.equal(autopilot.includes("platforms.has('instagram')"), true);
  assert.equal(autopilot.includes("requires_approval:false"), true);
  assert.equal(autopilot.includes("user_authorized_auto_publish:true"), true);
});

test('morning cron prepares social content before processing publish queue', () => {
  const make = reports.indexOf('ensureDailySocialAutopilot()');
  const publish = reports.indexOf('processPublishingQueue({ limit: 5 })');
  assert.equal(make >= 0 && publish > make, true);
  assert.equal(reports.includes("schedule === '0 5 * * *'"), true);
});

test('chief of staff exists as a specialist orchestrator', () => {
  assert.equal(workforceChat.includes('Tiqnora AI Chief of Staff and Multi-Agent Orchestrator'), true);
  assert.equal(migration.includes("'manager'"), true);
  assert.equal(migration.includes("'openai'"), true);
  assert.equal(migration.includes("'chat-latest'"), true);
});

test('autopilot is explicitly scoped in organization settings', () => {
  assert.equal(migration.includes("'social_autopilot'"), true);
  assert.equal(migration.includes("'facebook','instagram'"), true);
  assert.equal(migration.includes("'daily_time', '08:00'"), true);
  assert.equal(migration.includes("'authorized_scope'"), true);
});
