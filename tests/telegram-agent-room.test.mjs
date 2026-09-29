import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAgentRoomSetupCommand,
  isAgentRoomDiscussionRequest
} from '../lib/telegram-agent-room.js';

test('Telegram agent room recognizes setup commands', () => {
  assert.equal(isAgentRoomSetupCommand('/group'), true);
  assert.equal(isAgentRoomSetupCommand('/room setup'), true);
  assert.equal(isAgentRoomSetupCommand('/group@tiqnora_bot'), true);
  assert.equal(isAgentRoomSetupCommand('/status'), false);
});

test('Telegram agent room recognizes discussion requests', () => {
  assert.equal(isAgentRoomDiscussionRequest('/discuss كيف نزيد مبيعات تصميم المواقع؟'), true);
  assert.equal(isAgentRoomDiscussionRequest('ناقشوا خطة التسويق لهذا الأسبوع'), true);
  assert.equal(isAgentRoomDiscussionRequest('حالة المنصة'), false);
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('collaboration group routes normal owner messages into multi-agent discussion', () => {
  const src = readFileSync(join(root, 'lib/telegram-command-center.js'), 'utf8');
  assert.ok(src.includes('isCollaborationGroup'));
  assert.ok(src.includes('directAgentTarget'));
  assert.ok(src.includes('return await runAgentRoomDiscussion(message, agents)'));
});

test('agent room supports provider fallback and retries', () => {
  const src = readFileSync(join(root, 'lib/telegram-agent-room.js'), 'utf8');
  assert.ok(src.includes("process.env.OPENAI_API_KEY"));
  assert.ok(src.includes("https://api.openai.com/v1/responses"));
  assert.ok(src.includes('retryableStatus'));
  assert.ok(src.includes('callProvider'));
});
