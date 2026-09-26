import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'lib/telegram-command-center.js'), 'utf8');

test('telegram-command-center is not a stub/placeholder', () => {
  assert.equal(src.includes('SURGICAL_PLACEHOLDER'), false);
  assert.equal(src.includes('Temporary thin restore layer'), false);
  assert.equal(src.includes('minimal_handler'), false);
  // Full implementation markers
  assert.ok(src.length > 20000, `file too small: ${src.length}`);
  assert.ok(src.includes('export async function handleTelegramUpdate'));
  assert.ok(src.includes('export async function telegramBotInfo'));
  assert.ok(src.includes('export async function sendTelegramText'));
  assert.ok(src.includes('export function verifyTelegramWebhook'));
  assert.ok(src.includes('export async function telegramTargetChatId'));
  assert.ok(src.includes('tryPairChat') || src.includes('pairing'));
  assert.ok(src.includes('activeAgents') || src.includes('ai_agents'));
  assert.ok(src.includes('processCommand') || src.includes('/status'));
  assert.ok(src.includes('/scan') || src.includes('discoverProspects'));
  assert.ok(src.includes('/daily') || src.includes('ensureDailyWorkforceTasks'));
});

test('telegram-command-center status enrichment fields present', () => {
  assert.ok(src.includes('chat_id_source'));
  assert.ok(src.includes('paired_in_database'));
  assert.ok(src.includes('reachable'));
  assert.ok(src.includes('export async function isTelegramOperational') || src.includes('isTelegramOperational'));
});
